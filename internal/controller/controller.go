package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"goldbus/internal/audio"
	"goldbus/internal/console"
	"goldbus/internal/dmx"
	"goldbus/internal/network"
	serial2 "goldbus/internal/serial"
	wledpkg "goldbus/internal/wled"
	"goldbus/internal/wledhttp"
	"log"
	"net"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"go.bug.st/serial"
)

const (
	defaultStateFileName    = "state.json"
	generalTabStateFileName = "general-tab-state.json"
	dmxStateFileName        = "dmx.json"
	simulatedWLEDDeviceID   = "sim:wled"
	simulatedUSBDMXDeviceID = "sim:usb-dmx512"
	simulatedUSBDMXPath     = "sim://usb-dmx512"
	simulatedUSBDMXName     = "Simulated USB-DMX512"

	// WLED hardware commonly uses 2.4 GHz–only Wi‑Fi; the controller AP must stay on that band.
	ap24MinChannel     = 1
	ap24MaxChannel     = 14
	defaultAP24Channel = 6
)

type AccessPointSettings struct {
	Enabled       bool   `json:"enabled"`
	Connection    string `json:"connection"`
	InterfaceName string `json:"interfaceName"`
	SSID          string `json:"ssid"`
	Password      string `json:"password"`
	Channel       int    `json:"channel"`
}

// legacyDiscoverySettings is only retained for loading older persisted state.json files.
type legacyDiscoverySettings struct {
	Enabled                          bool     `json:"enabled"`
	ServiceTypes                     []string `json:"serviceTypes"`
	IntervalSeconds                  int      `json:"intervalSeconds"`
	QueryTimeoutMS                   int      `json:"queryTimeoutMs"`
	BindInterface                    string   `json:"bindInterface"`
	PassiveBrowse                    bool     `json:"passiveBrowse"`
	SubnetProbe                      bool     `json:"subnetProbe"`
	PollIntervalSecondsWhenApEnabled int      `json:"pollIntervalSecondsWhenApEnabled"`
}

type ProvisioningSettings struct {
	AutoProvision       bool           `json:"autoProvision"`
	DefaultStatePayload map[string]any `json:"defaultStatePayload"`
	DefaultConfigPatch  map[string]any `json:"defaultConfigPatch"`
}

type TestingSettings struct {
	SimulateWLED bool `json:"simulateWled"`
}

type WLEDDebugSettings struct {
	ShowInfo bool `json:"showInfo"`
}

type WLEDSettings struct {
	Enabled      bool                 `json:"enabled"`
	Provisioning ProvisioningSettings `json:"provisioning"`
	Testing      TestingSettings      `json:"testing"`
	Debug        WLEDDebugSettings    `json:"debug"`
}

type ArtNetSettings struct {
	Enabled    bool   `json:"enabled"`
	TargetHost string `json:"targetHost"`
	Port       int    `json:"port"`
	Net        int    `json:"net"`
	Subnet     int    `json:"subnet"`
	Universe   int    `json:"universe"`
	RefreshHz  int    `json:"refreshHz"`
}

type USBTransportSettings struct {
	Enabled *bool `json:"enabled,omitempty"`
}

type DMXTestingSettings struct {
	SimulateUSBDMX bool `json:"simulateUsbDmx"`
	SimulateArtNet bool `json:"simulateArtNet"`
}

type DMXSettings struct {
	Enabled            bool                                    `json:"enabled"`
	USB                USBTransportSettings                    `json:"usb"`
	ArtNet             ArtNetSettings                          `json:"artNet"` // legacy; migrated into UniverseInterfaces
	Testing            DMXTestingSettings                      `json:"testing"`
	UniverseInterfaces map[string]DMXUniverseInterfaceSettings `json:"universeInterfaces,omitempty"`
}

type ControllerSettings struct {
	AccessPoint AccessPointSettings `json:"accessPoint"`
	WLED        WLEDSettings        `json:"wled"`
	DMX         DMXSettings         `json:"dmx"`

	// Legacy flattened settings kept for migration from persisted v2 state.
	Discovery    legacyDiscoverySettings `json:"discovery,omitempty"`
	Provisioning ProvisioningSettings    `json:"provisioning,omitempty"`
	Testing      TestingSettings         `json:"testing,omitempty"`
}

type WLEDDevice struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Host        string         `json:"host"`
	Address     string         `json:"address"`
	Port        int            `json:"port"`
	LastSeen    time.Time      `json:"lastSeen"`
	Online      bool           `json:"online"`
	Provisioned bool           `json:"provisioned"`
	Ignored     bool           `json:"ignored"`
	Info        map[string]any `json:"info,omitempty"`
	// LastState holds the last known WLED JSON state payload applied to the device (merged over time) for restore on reconnect.
	LastState map[string]any `json:"lastState,omitempty"`
}

func isSimulatedWLED(device WLEDDevice, settings ControllerSettings) bool {
	return settings.WLED.Enabled && settings.WLED.Testing.SimulateWLED && device.ID == simulatedWLEDDeviceID
}

func newSimulatedWLEDDevice() WLEDDevice {
	now := time.Now()
	st := map[string]any{
		"on":         true,
		"bri":        180,
		"transition": 7,
		"seg": []any{map[string]any{
			"id": 0, "start": 0, "stop": 149, "len": 150,
			"col": []any{[]any{255, 160, 0}},
		}},
	}
	return WLEDDevice{
		ID:          simulatedWLEDDeviceID,
		Name:        "Simulated WLED",
		Host:        "simulated.local",
		Address:     "127.0.0.1",
		Port:        80,
		LastSeen:    now,
		Online:      true,
		Provisioned: false,
		Info:        map[string]any{"on": true, "bri": 180},
		LastState:   st,
	}
}

type persistentState struct {
	Version  int                   `json:"version"`
	SavedAt  time.Time             `json:"savedAt"`
	Settings ControllerSettings    `json:"settings"`
	Devices  map[string]WLEDDevice `json:"devices"`
}

const persistentStateVersion = 3

type ControllerSnapshot struct {
	Settings        ControllerSettings     `json:"settings"`
	Devices         []WLEDDevice           `json:"devices"`
	GeneralTabState GeneralTabState        `json:"generalTabState"`
	PersistencePath string                 `json:"persistencePath"`
	UpdatedAt       time.Time              `json:"updatedAt"`
	Capabilities    ControllerCapabilities `json:"capabilities"`
}

type GeneralTabState struct {
	On  bool   `json:"on"`
	Bri int    `json:"bri"`
	RGB [3]int `json:"rgb"`
	FX  int    `json:"fx"`
	Pal int    `json:"pal"`
	SX  int    `json:"sx"`
	IX  int    `json:"ix"`
}

type DMXFixtureType string

const (
	DMXFixtureTypeColorChanger DMXFixtureType = "colorChanger"
	DMXFixtureTypeDimmer       DMXFixtureType = "dimmer"
	DMXFixtureTypeEffect       DMXFixtureType = "effect"
	DMXFixtureTypeFan          DMXFixtureType = "fan"
	DMXFixtureTypeFlower       DMXFixtureType = "flower"
	DMXFixtureTypeHazer        DMXFixtureType = "hazer"
	DMXFixtureTypeLaser        DMXFixtureType = "laser"
	DMXFixtureTypeLEDBarBeams  DMXFixtureType = "ledBarBeams"
	DMXFixtureTypeLEDBarPixels DMXFixtureType = "ledBarPixels"
	DMXFixtureTypeMovingHead   DMXFixtureType = "movingHead"
	DMXFixtureTypeOther        DMXFixtureType = "other"
	DMXFixtureTypeScanner      DMXFixtureType = "scanner"
	DMXFixtureTypeSmoke        DMXFixtureType = "smoke"
	DMXFixtureTypeStrobe       DMXFixtureType = "strobe"
)

type DMXChannel struct {
	Channel      int            `json:"channel"`
	Type         string         `json:"type"`
	DefaultValue *int           `json:"defaultValue,omitempty"`
	Properties   map[string]any `json:"properties,omitempty"`
}

type MovingHeadConfig struct {
	MaxPan  int `json:"maxPan"`
	MaxTilt int `json:"maxTilt"`
}

type DMXFixture struct {
	ID         string         `json:"id"`
	Type       DMXFixtureType `json:"type"`
	Brand      string         `json:"brand"`
	Name       string         `json:"name"`
	UniverseID string         `json:"universeId,omitempty"`
	DMXAddress int            `json:"dmxAddress"`
	// MasterFixtureID links this fixture as a slave that mirrors the master's DMX output.
	MasterFixtureID string           `json:"masterFixtureId,omitempty"`
	MovingHead      MovingHeadConfig `json:"movingHead"`
	Party           DMXFixtureParty  `json:"party,omitempty"`
	Channels        []DMXChannel     `json:"channels"`
	CreatedAt       time.Time        `json:"createdAt"`
	UpdatedAt       time.Time        `json:"updatedAt"`
}

type DMXState struct {
	Universes           []DMXUniverse `json:"universes"`
	Fixtures            []DMXFixture  `json:"fixtures"`
	SelectedUSBDeviceID string        `json:"selectedUSBDeviceId"` // legacy; migrated to UniverseInterfaces
	Party               DMXPartyState `json:"party"`
	// LiveUniverses maps universe id → 512 slot values when live output is active.
	LiveUniverses map[string][]int `json:"liveUniverses,omitempty"`
	// LiveUniverse is the legacy single-universe buffer (universe 1) for backward compatibility.
	LiveUniverse []int `json:"liveUniverse,omitempty"`
}

type USBSerialDevice = serial2.USBSerialDevice

type UpsertDMXFixtureInput struct {
	ID         string         `json:"id,omitempty"`
	Type       DMXFixtureType `json:"type"`
	Brand      string         `json:"brand"`
	Name       string         `json:"name"`
	UniverseID string         `json:"universeId,omitempty"`
	DMXAddress int            `json:"dmxAddress"`
	// MasterFixtureID links this fixture as a slave that mirrors the master's DMX output.
	MasterFixtureID string          `json:"masterFixtureId,omitempty"`
	MaxPan          int             `json:"maxPan"`
	MaxTilt         int             `json:"maxTilt"`
	Party           DMXFixtureParty `json:"party,omitempty"`
	Channels        []DMXChannel    `json:"channels"`
}

type ControllerCapabilities struct {
	// NetworkBackendID identifies which integration is active (e.g. "nmcli", "darwin", "netsh", "stub").
	NetworkBackendID string `json:"networkBackendId"`
	// NetworkBackendLabel is a human-readable description for the UI.
	NetworkBackendLabel string `json:"networkBackendLabel"`
	// NetworkControlAvailable is true when this OS exposes working CLI tools for applying network settings (partial features may still be unavailable).
	NetworkControlAvailable bool `json:"networkControlAvailable"`
	// NetworkCliName is the primary host CLI for Wi-Fi on this platform (e.g. nmcli, netsh, networksetup).
	NetworkCliName string `json:"networkCliName"`
	// NetworkCliUnavailableReason is non-empty when NetworkControlAvailable is false; explains which binary or requirement is missing.
	NetworkCliUnavailableReason string `json:"networkCliUnavailableReason,omitempty"`
	// NmcliAvailable is true only when Linux nmcli (NetworkManager) is present and used.
	NmcliAvailable bool `json:"nmcliAvailable"`
}

type NetworkCommandResult struct {
	Command string `json:"command"`
	Output  string `json:"output"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type NetworkApplyResult struct {
	DryRun   bool                   `json:"dryRun"`
	Warnings []string               `json:"warnings,omitempty"`
	Steps    []NetworkCommandResult `json:"steps"`
}

type StatePersistenceManager struct {
	path string
	mu   sync.Mutex
}

type GeneralTabStatePersistenceManager struct {
	path string
	mu   sync.Mutex
}

type DMXPersistenceManager struct {
	path string
	mu   sync.Mutex
}

func NewStatePersistenceManager() *StatePersistenceManager {
	cfgDir, err := os.UserConfigDir()
	if err != nil || cfgDir == "" {
		return &StatePersistenceManager{path: filepath.Join(".", defaultStateFileName)}
	}

	return &StatePersistenceManager{
		path: filepath.Join(cfgDir, "wled-controller", defaultStateFileName),
	}
}

func (s *GeneralTabStatePersistenceManager) Path() string {
	return s.path
}

func NewGeneralTabStatePersistenceManager() *GeneralTabStatePersistenceManager {
	cfgDir, err := os.UserConfigDir()
	if err != nil || cfgDir == "" {
		return &GeneralTabStatePersistenceManager{path: filepath.Join(".", generalTabStateFileName)}
	}
	return &GeneralTabStatePersistenceManager{
		path: filepath.Join(cfgDir, "wled-controller", generalTabStateFileName),
	}
}

func NewDMXPersistenceManager() *DMXPersistenceManager {
	cfgDir, err := os.UserConfigDir()
	if err != nil || cfgDir == "" {
		return &DMXPersistenceManager{path: filepath.Join(".", dmxStateFileName)}
	}
	return &DMXPersistenceManager{
		path: filepath.Join(cfgDir, "wled-controller", dmxStateFileName),
	}
}

func (s *GeneralTabStatePersistenceManager) Load() (GeneralTabState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	def := defaultGeneralTabState()
	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return def, nil
		}
		return def, err
	}
	var st GeneralTabState
	if err := json.Unmarshal(data, &st); err != nil {
		return def, err
	}
	return clampGeneralTabState(st), nil
}

func (s *GeneralTabStatePersistenceManager) Save(st GeneralTabState) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(clampGeneralTabState(st), "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, payload, 0o600)
}

func (s *DMXPersistenceManager) Path() string {
	return s.path
}

func (s *DMXPersistenceManager) Load() (DMXState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	def := defaultDMXState()
	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return def, nil
		}
		return def, err
	}
	var st DMXState
	if err := json.Unmarshal(data, &st); err != nil {
		return def, err
	}
	return normalizeDMXState(st), nil
}

func (s *DMXPersistenceManager) Save(st DMXState) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(normalizeDMXState(st), "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, payload, 0o600)
}

func (s *StatePersistenceManager) Path() string {
	return s.path
}

func (s *StatePersistenceManager) Load() (persistentState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	defaultState := persistentState{
		Version:  persistentStateVersion,
		SavedAt:  time.Now(),
		Settings: DefaultControllerSettings(),
		Devices:  map[string]WLEDDevice{},
	}

	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return defaultState, nil
		}
		return defaultState, err
	}

	var state persistentState
	if err := json.Unmarshal(data, &state); err != nil {
		return defaultState, err
	}
	if state.Version < 2 {
		state.Settings.Discovery.PassiveBrowse = true
		if state.Settings.Discovery.PollIntervalSecondsWhenApEnabled <= 0 {
			state.Settings.Discovery.PollIntervalSecondsWhenApEnabled = 5
		}
		state.Version = 2
	}
	if state.Version < 3 {
		if state.Settings.WLED.Provisioning.DefaultStatePayload == nil && state.Settings.Provisioning.DefaultStatePayload != nil {
			state.Settings.WLED.Provisioning = state.Settings.Provisioning
		}
		if !state.Settings.WLED.Testing.SimulateWLED && state.Settings.Testing.SimulateWLED {
			state.Settings.WLED.Testing = state.Settings.Testing
		}
		state.Settings.WLED.Enabled = true
		state.Settings.DMX.Enabled = true
		state.Version = 3
	}
	state.Settings = mergeWithDefaults(state.Settings)
	if state.Devices == nil {
		state.Devices = map[string]WLEDDevice{}
	}
	return state, nil
}

func (s *StatePersistenceManager) Save(state persistentState) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}

	state.Version = persistentStateVersion
	state.SavedAt = time.Now()
	payload, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, payload, 0o600)
}

type NetworkManager struct {
	logger  *log.Logger
	backend network.Backend
}

func NewNetworkManager(logger *log.Logger) *NetworkManager {
	return &NetworkManager{
		logger:  logger,
		backend: network.SelectNetworkBackend(logger),
	}
}

func (n *NetworkManager) controllerCapabilities() ControllerCapabilities {
	b := n.backend
	nmcli := b.ID() == "nmcli" && b.Available()
	reason := ""
	if !b.Available() {
		reason = b.UnavailableHint()
	}
	return ControllerCapabilities{
		NetworkBackendID:            b.ID(),
		NetworkBackendLabel:         b.Label(),
		NetworkControlAvailable:     b.Available(),
		NetworkCliName:              b.PrimaryCLI(),
		NetworkCliUnavailableReason: reason,
		NmcliAvailable:              nmcli,
	}
}

func (n *NetworkManager) Apply(ctx context.Context, settings ControllerSettings) NetworkApplyResult {
	raw := n.backend.Apply(ctx, network.ControllerSettings{
		AccessPoint: network.AccessPointSettings{
			Enabled:       settings.AccessPoint.Enabled,
			Connection:    settings.AccessPoint.Connection,
			InterfaceName: settings.AccessPoint.InterfaceName,
			SSID:          settings.AccessPoint.SSID,
			Password:      settings.AccessPoint.Password,
			Channel:       settings.AccessPoint.Channel,
		},
	})
	steps := make([]NetworkCommandResult, 0, len(raw.Steps))
	for _, step := range raw.Steps {
		steps = append(steps, NetworkCommandResult{
			Command: step.Command,
			Output:  step.Output,
			Success: step.Success,
			Error:   step.Error,
		})
	}
	return NetworkApplyResult{
		DryRun:   raw.DryRun,
		Warnings: slices.Clone(raw.Warnings),
		Steps:    steps,
	}
}

type WLEDDeviceDetail struct {
	Online    bool           `json:"online"`
	Error     string         `json:"error,omitempty"`
	State     map[string]any `json:"state,omitempty"`
	Info      map[string]any `json:"info,omitempty"`
	Effects   []string       `json:"effects,omitempty"`
	Palettes  []string       `json:"palettes,omitempty"`
	Config    map[string]any `json:"config,omitempty"`
	LastState map[string]any `json:"lastState,omitempty"`
	Address   string         `json:"address"`
	Port      int            `json:"port"`
}

// toEngineDevice projects a controller-level WLEDDevice down to the minimal
// handle the wled engine needs to perform HTTP.
func toEngineDevice(d WLEDDevice) wledpkg.Device {
	return wledpkg.Device{
		ID:      d.ID,
		Host:    d.Host,
		Address: d.Address,
		Port:    d.Port,
	}
}

type WLEDController struct {
	logger                   *log.Logger
	persistence              *StatePersistenceManager
	generalTabPersistence    *GeneralTabStatePersistenceManager
	dmxLiveLayoutPersistence *DMXFixtureLiveLayoutPersistenceManager
	dmxPersistence           *DMXPersistenceManager
	network                  *NetworkManager
	wled                     *wledpkg.Engine
	console                  *console.Bus

	mu                sync.RWMutex
	importingConfig   atomic.Bool // suppresses periodic persist while ImportConfigurationBackup runs
	settings          ControllerSettings
	devices           map[string]WLEDDevice
	generalTabState   GeneralTabState
	dmxState          DMXState
	dmxPersistEnabled bool // false when dmx.json failed to load — avoids overwriting fixtures on disk
	updated           time.Time

	rootCtx context.Context
	cancel  context.CancelFunc

	dmxLiveMu            sync.Mutex
	dmxLiveOpMu          sync.Mutex // serializes start/stop/reconcile
	dmxLiveUSBWG         sync.WaitGroup
	dmxLiveArtWG         sync.WaitGroup
	dmxLiveRunning       bool
	dmxLiveErr           string
	dmxLiveFixID         string
	dmxLiveUniverses     map[string]*dmxUniverseLiveRuntime
	dmxLivePatchLog      time.Time
	dmxPartyRunning      bool
	dmxPartyCancel       context.CancelFunc
	dmxPartyWG           sync.WaitGroup
	partyOwnedByUniverse map[string][512]bool
	partyAudioMu         sync.Mutex
	partyAudioCapture    *audio.Capture
}

func NewWLEDController(logger *log.Logger) *WLEDController {
	if logger == nil {
		logger = log.Default()
	}
	bus := console.NewBus(500)
	return &WLEDController{
		logger:                   logger,
		persistence:              NewStatePersistenceManager(),
		generalTabPersistence:    NewGeneralTabStatePersistenceManager(),
		dmxPersistence:           NewDMXPersistenceManager(),
		dmxLiveLayoutPersistence: NewDMXFixtureLiveLayoutPersistenceManager(),
		network:                  NewNetworkManager(logger),
		wled:                     wledpkg.NewEngine(logger, bus),
		console:                  bus,
		settings:                 DefaultControllerSettings(),
		devices:                  map[string]WLEDDevice{},
		generalTabState:          defaultGeneralTabState(),
		dmxState:                 defaultDMXState(),
		updated:                  time.Now(),
	}
}

// Console exposes the live transport console bus so the UI service can query
// recent entries.
func (c *WLEDController) Console() *console.Bus {
	return c.console
}

func (c *WLEDController) syncSimulatedDeviceLocked() {
	if c.settings.WLED.Enabled && c.settings.WLED.Testing.SimulateWLED {
		base := newSimulatedWLEDDevice()
		if existing, ok := c.devices[simulatedWLEDDeviceID]; ok {
			if strings.TrimSpace(existing.Name) != "" {
				base.Name = existing.Name
			}
			if len(existing.LastState) > 0 {
				base.LastState = cloneJSONMap(existing.LastState)
			}
			base.Provisioned = existing.Provisioned
			base.Ignored = existing.Ignored
			if existing.Info != nil {
				base.Info = cloneJSONMap(existing.Info)
			}
			base.LastSeen = time.Now()
		}
		c.devices[simulatedWLEDDeviceID] = base
		return
	}
	delete(c.devices, simulatedWLEDDeviceID)
}

func (c *WLEDController) applyWLEDState(ctx context.Context, device WLEDDevice, state map[string]any) error {
	c.mu.RLock()
	settings := c.settings
	c.mu.RUnlock()
	if isSimulatedWLED(device, settings) {
		if c.console != nil {
			c.console.Info(console.TransportWLED, device.ID, "simulated device — state applied locally")
		}
		return nil
	}
	return c.wled.ApplyState(ctx, toEngineDevice(device), state)
}

func (c *WLEDController) applyStateToAllDevices(ctx context.Context, devices []WLEDDevice, state map[string]any) map[string]string {
	results := make(map[string]string, len(devices))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, device := range devices {
		device := device
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := c.applyWLEDState(ctx, device, state)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				results[device.ID] = err.Error()
				return
			}
			results[device.ID] = "ok"
		}()
	}
	wg.Wait()
	return results
}

func (c *WLEDController) getWLEDState(ctx context.Context, device WLEDDevice) (map[string]any, error) {
	c.mu.RLock()
	settings := c.settings
	latest, ok := c.devices[device.ID]
	c.mu.RUnlock()
	if isSimulatedWLED(device, settings) && ok {
		out := cloneJSONMap(latest.LastState)
		if len(out) == 0 {
			out = defaultSimulatedState()
		}
		return out, nil
	}
	return c.wled.GetState(ctx, toEngineDevice(device))
}

func (c *WLEDController) getWLEDFullJSON(ctx context.Context, device WLEDDevice) (map[string]any, error) {
	c.mu.RLock()
	settings := c.settings
	latest, ok := c.devices[device.ID]
	c.mu.RUnlock()
	if isSimulatedWLED(device, settings) && ok {
		return buildSimulatedFullJSON(latest), nil
	}
	return c.wled.GetFullJSON(ctx, toEngineDevice(device))
}

func (c *WLEDController) getWLEDConfig(ctx context.Context, device WLEDDevice) (map[string]any, error) {
	c.mu.RLock()
	settings := c.settings
	c.mu.RUnlock()
	if isSimulatedWLED(device, settings) {
		return map[string]any{}, nil
	}
	return c.wled.GetConfig(ctx, toEngineDevice(device))
}

func (c *WLEDController) provisionWLED(ctx context.Context, device WLEDDevice, cfgPatch map[string]any, initialState map[string]any) error {
	c.mu.RLock()
	settings := c.settings
	c.mu.RUnlock()
	if isSimulatedWLED(device, settings) {
		return nil
	}
	return c.wled.Provision(ctx, toEngineDevice(device), cfgPatch, initialState)
}

func (c *WLEDController) Start(ctx context.Context) error {
	loaded, err := c.persistence.Load()
	if err != nil {
		c.logger.Printf("state load failed, using defaults: %v", err)
		loaded = persistentState{
			Version:  persistentStateVersion,
			SavedAt:  time.Now(),
			Settings: DefaultControllerSettings(),
			Devices:  map[string]WLEDDevice{},
		}
	}
	generalTab, err := c.generalTabPersistence.Load()
	if err != nil {
		c.logger.Printf("general tab state load failed, using defaults: %v", err)
		generalTab = defaultGeneralTabState()
	}
	dmxState, err := c.dmxPersistence.Load()
	dmxPersistEnabled := err == nil
	if err != nil {
		c.logger.Printf("dmx state load failed, using defaults (existing dmx.json will not be overwritten until you change DMX data): %v", err)
		dmxState = defaultDMXState()
	}

	normDMX := normalizeDMXState(dmxState)
	normDMX.Party = stripDMXPartyRuntimeForPersistence(normalizeDMXPartyState(normDMX.Party))
	normDMX.Party.Config.Enabled = false
	oldUSB := strings.TrimSpace(normDMX.SelectedUSBDeviceID)
	normDMX.SelectedUSBDeviceID = dmx.CanonicalizePersistedDMXUSBSelectionID(oldUSB)

	c.mu.Lock()
	c.settings = mergeWithDefaults(loaded.Settings)
	c.settings.DMX.UniverseInterfaces = normalizeDMXUniverseInterfaces(
		c.settings.DMX.UniverseInterfaces,
		normDMX.Universes,
		normDMX.SelectedUSBDeviceID,
		c.settings.DMX.ArtNet,
	)
	c.devices = loaded.Devices
	c.generalTabState = clampGeneralTabState(generalTab)
	c.dmxState = normDMX
	c.dmxPersistEnabled = dmxPersistEnabled
	c.syncSimulatedDeviceLocked()
	c.updated = time.Now()
	c.mu.Unlock()

	c.StopDMXParty()

	if dmxPersistEnabled && normDMX.SelectedUSBDeviceID != oldUSB && normDMX.SelectedUSBDeviceID != "" {
		if err := c.persistDMX(); err != nil {
			c.logger.Printf("dmx: persist migrated usb selection: %v", err)
		}
	}

	runCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel
	c.rootCtx = runCtx

	// Start the WLED transport engine only when the component is enabled in
	// settings. The engine owns a goroutine + channels and is rebooted on
	// toggle via SaveSettings.
	c.mu.RLock()
	wledEnabled := c.settings.WLED.Enabled
	c.mu.RUnlock()
	if wledEnabled {
		c.wled.Start(runCtx)
	}

	go c.persistenceLoop(runCtx)
	go c.healthLoop(runCtx)
	go c.recallWLEDDevicePresetsOnBoot(runCtx)

	return nil
}

func (c *WLEDController) Stop() {
	c.StopDMXLive()
	c.wled.Stop()
	if c.cancel != nil {
		c.cancel()
	}
	if err := c.persist(); err != nil {
		c.logger.Printf("persist during shutdown failed: %v", err)
	}
	if err := c.persistDMX(); err != nil {
		c.logger.Printf("persist dmx during shutdown failed: %v", err)
	}
}

func (c *WLEDController) Snapshot() ControllerSnapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()

	devices := make([]WLEDDevice, 0, len(c.devices))
	if c.settings.WLED.Enabled {
		for _, device := range c.devices {
			if device.Ignored {
				continue
			}
			devices = append(devices, device)
		}
	}
	slices.SortFunc(devices, func(a, b WLEDDevice) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})

	return ControllerSnapshot{
		Settings:        c.settings,
		Devices:         devices,
		GeneralTabState: c.generalTabState,
		PersistencePath: c.persistence.Path(),
		UpdatedAt:       c.updated,
		Capabilities:    c.network.controllerCapabilities(),
	}
}

func (c *WLEDController) SaveSettings(settings ControllerSettings) error {
	merged := mergeWithDefaults(settings)
	c.mu.Lock()
	wledWas := c.settings.WLED.Enabled
	legacyUSB := strings.TrimSpace(c.dmxState.SelectedUSBDeviceID)
	universes := normalizeDMXUniverses(c.dmxState.Universes)
	merged.DMX.UniverseInterfaces = normalizeDMXUniverseInterfaces(
		merged.DMX.UniverseInterfaces,
		universes,
		legacyUSB,
		merged.DMX.ArtNet,
	)
	c.settings = merged
	c.syncSimulatedDeviceLocked()
	c.updated = time.Now()
	c.mu.Unlock()

	// Mirror WLED toggle onto the engine lifecycle: start it when the user
	// enables WLED, stop and close its channels when they disable it.
	wledNow := merged.WLED.Enabled
	switch {
	case wledNow && !wledWas:
		ctx := c.rootCtx
		if ctx == nil {
			ctx = context.Background()
		}
		c.wled.Start(ctx)
	case !wledNow && wledWas:
		c.wled.Stop()
	}

	if !merged.DMX.Enabled {
		c.StopDMXLive()
	} else if err := c.reconcileDMXLiveAdapters(); err != nil {
		c.logger.Printf("dmx live reconcile after settings save: %v", err)
	}
	return c.persist()
}

func (c *WLEDController) ApplyNetwork(ctx context.Context) NetworkApplyResult {
	c.mu.RLock()
	settings := c.settings
	c.mu.RUnlock()

	result := c.network.Apply(ctx, settings)
	c.touch()
	return result
}

func (c *WLEDController) wledEnabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.settings.WLED.Enabled
}

func (c *WLEDController) dmxEnabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.settings.DMX.Enabled
}

func (c *WLEDController) SetDeviceState(ctx context.Context, deviceID string, state map[string]any) error {
	if !c.wledEnabled() {
		return fmt.Errorf("wled component is disabled in settings")
	}
	c.mu.RLock()
	device, ok := c.devices[deviceID]
	c.mu.RUnlock()
	if !ok {
		return fmt.Errorf("unknown device: %s", deviceID)
	}
	if device.Ignored {
		return fmt.Errorf("device is ignored: %s", deviceID)
	}
	if isNoOpStatePatch(device.LastState, state) {
		return nil
	}

	if err := c.applyWLEDState(ctx, device, state); err != nil {
		return err
	}

	c.mu.Lock()
	device.LastSeen = time.Now()
	device.Online = true
	if device.Info == nil {
		device.Info = map[string]any{}
	}
	for k, v := range state {
		if k == "on" || k == "bri" || k == "ps" {
			device.Info[k] = v
		}
	}
	device.LastState = mergeStateIntoLastState(device.LastState, state)
	c.devices[deviceID] = device
	c.updated = time.Now()
	c.mu.Unlock()

	return c.persist()
}

func (c *WLEDController) SetGlobalState(ctx context.Context, state map[string]any) map[string]string {
	if !c.wledEnabled() {
		return map[string]string{}
	}
	c.mu.RLock()
	devices := make([]WLEDDevice, 0, len(c.devices))
	for _, d := range c.devices {
		if d.Ignored {
			continue
		}
		if d.Online {
			devices = append(devices, d)
		}
	}
	c.mu.RUnlock()

	results := c.applyStateToAllDevices(ctx, devices, state)

	c.mu.Lock()
	c.generalTabState = mergeGeneralTabState(c.generalTabState, state)
	for id, d := range c.devices {
		if d.Ignored {
			continue
		}
		latest := d
		if results[id] == "ok" {
			latest.LastSeen = time.Now()
			latest.Online = true
			if latest.Info == nil {
				latest.Info = map[string]any{}
			}
			for k, v := range state {
				if k == "on" || k == "bri" || k == "ps" {
					latest.Info[k] = v
				}
			}
		}
		latest.LastState = mergeStateIntoLastState(latest.LastState, state)
		c.devices[id] = latest
	}
	c.updated = time.Now()
	c.mu.Unlock()

	if err := c.generalTabPersistence.Save(c.generalTabState); err != nil {
		c.logger.Printf("persist general tab state failed: %v", err)
	}
	if err := c.persist(); err != nil {
		c.logger.Printf("persist after global state failed: %v", err)
	}
	return results
}

func (c *WLEDController) ProvisionDevice(ctx context.Context, deviceID string) error {
	c.mu.RLock()
	device, ok := c.devices[deviceID]
	settings := c.settings.WLED
	c.mu.RUnlock()
	if !settings.Enabled {
		return fmt.Errorf("wled component is disabled in settings")
	}
	if !ok {
		return fmt.Errorf("unknown device: %s", deviceID)
	}
	if device.Ignored {
		return fmt.Errorf("device is ignored: %s", deviceID)
	}

	if err := c.provisionWLED(ctx, device, settings.Provisioning.DefaultConfigPatch, settings.Provisioning.DefaultStatePayload); err != nil {
		return err
	}

	c.mu.Lock()
	device.Provisioned = true
	device.Online = true
	device.LastSeen = time.Now()
	device.LastState = mergeStateIntoLastState(device.LastState, settings.Provisioning.DefaultStatePayload)
	c.devices[deviceID] = device
	c.updated = time.Now()
	c.mu.Unlock()

	return c.persist()
}

func (c *WLEDController) RefreshDevice(ctx context.Context, deviceID string) error {
	if !c.wledEnabled() {
		return fmt.Errorf("wled component is disabled in settings")
	}
	c.mu.RLock()
	device, ok := c.devices[deviceID]
	c.mu.RUnlock()
	if !ok {
		return fmt.Errorf("unknown device: %s", deviceID)
	}
	if device.Ignored {
		return fmt.Errorf("device is ignored: %s", deviceID)
	}

	state, err := c.getWLEDState(ctx, device)
	if err != nil {
		c.mu.Lock()
		device.Online = false
		c.devices[deviceID] = device
		c.updated = time.Now()
		c.mu.Unlock()
		return err
	}

	c.mu.Lock()
	device.Online = true
	device.LastSeen = time.Now()
	if device.Info == nil {
		device.Info = map[string]any{}
	}
	if v, ok := state["on"]; ok {
		device.Info["on"] = v
	}
	if v, ok := state["bri"]; ok {
		device.Info["bri"] = v
	}
	device.LastState = mergeStateIntoLastState(device.LastState, state)
	c.devices[deviceID] = device
	c.updated = time.Now()
	c.mu.Unlock()

	return c.persist()
}

func (c *WLEDController) GetDeviceDetail(ctx context.Context, deviceID string) WLEDDeviceDetail {
	c.mu.RLock()
	device, ok := c.devices[deviceID]
	lastCopy := cloneJSONMap(device.LastState)
	addr := device.Address
	port := device.Port
	online := device.Online
	ignored := device.Ignored
	wledEnabled := c.settings.WLED.Enabled
	c.mu.RUnlock()

	effectiveAddr := wledhttp.HostForHTTP(device.Host, addr)

	detail := WLEDDeviceDetail{
		Online:    online,
		Address:   effectiveAddr,
		Port:      port,
		LastState: lastCopy,
	}
	if !wledEnabled {
		detail.Online = false
		detail.Error = "wled component is disabled in settings"
		return detail
	}
	if !ok {
		detail.Error = fmt.Sprintf("unknown device: %s", deviceID)
		detail.Online = false
		return detail
	}
	if ignored {
		detail.Online = false
		detail.Error = "device is ignored; use Settings → Ignored devices to restore"
		return detail
	}

	full, err := c.getWLEDFullJSON(ctx, device)
	if err != nil {
		detail.Online = false
		detail.Error = err.Error()
		return detail
	}
	detail.Online = true
	detail.Error = ""
	if s, ok := full["state"].(map[string]any); ok {
		detail.State = s
	}
	if inf, ok := full["info"].(map[string]any); ok {
		detail.Info = inf
	}
	if eff, ok := full["effects"].([]any); ok {
		detail.Effects = stringifyAnySlice(eff)
	}
	if pal, ok := full["palettes"].([]any); ok {
		detail.Palettes = stringifyAnySlice(pal)
	}
	if cfg, err := c.getWLEDConfig(ctx, device); err != nil {
		c.logger.Printf("cfg fetch for %s: %v", deviceID, err)
	} else {
		detail.Config = cfg
	}
	return detail
}

func (c *WLEDController) RemoveDevice(deviceID string) error {
	if !c.wledEnabled() {
		return fmt.Errorf("wled component is disabled in settings")
	}
	c.mu.Lock()
	delete(c.devices, deviceID)
	c.syncSimulatedDeviceLocked()
	c.updated = time.Now()
	c.mu.Unlock()
	return c.persist()
}

func (c *WLEDController) IgnoredDevices() []WLEDDevice {
	if !c.wledEnabled() {
		return []WLEDDevice{}
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]WLEDDevice, 0)
	for _, d := range c.devices {
		if d.Ignored {
			out = append(out, d)
		}
	}
	slices.SortFunc(out, func(a, b WLEDDevice) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})
	return out
}

func (c *WLEDController) SetDeviceIgnored(deviceID string, ignored bool) error {
	if !c.wledEnabled() {
		return fmt.Errorf("wled component is disabled in settings")
	}
	c.mu.Lock()
	device, ok := c.devices[deviceID]
	if !ok {
		c.mu.Unlock()
		return fmt.Errorf("unknown device: %s", deviceID)
	}
	device.Ignored = ignored
	c.devices[deviceID] = device
	c.updated = time.Now()
	c.mu.Unlock()
	return c.persist()
}

func simulatedUSBDMXDevice() serial2.USBSerialDevice {
	return serial2.USBSerialDevice{
		ID:          simulatedUSBDMXDeviceID,
		Path:        simulatedUSBDMXPath,
		Name:        simulatedUSBDMXName,
		Description: "In-process USB DMX simulator",
	}
}

func (c *WLEDController) listUSBSerialDevicesWithSimulators() []serial2.USBSerialDevice {
	devices := serial2.ListUSBSerialDevices()
	c.mu.RLock()
	simUSB := c.settings.DMX.Testing.SimulateUSBDMX
	c.mu.RUnlock()
	if simUSB {
		devices = append(devices, simulatedUSBDMXDevice())
	}
	slices.SortFunc(devices, func(a, b serial2.USBSerialDevice) int {
		nameCmp := strings.Compare(strings.ToLower(strings.TrimSpace(a.Name)), strings.ToLower(strings.TrimSpace(b.Name)))
		if nameCmp != 0 {
			return nameCmp
		}
		return strings.Compare(strings.ToLower(strings.TrimSpace(a.ID)), strings.ToLower(strings.TrimSpace(b.ID)))
	})
	return devices
}

func (c *WLEDController) RenameDevice(ctx context.Context, deviceID, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("name cannot be empty")
	}
	c.mu.RLock()
	device, ok := c.devices[deviceID]
	settings := c.settings
	c.mu.RUnlock()
	if !settings.WLED.Enabled {
		return fmt.Errorf("wled component is disabled in settings")
	}
	if !ok {
		return fmt.Errorf("unknown device: %s", deviceID)
	}
	if device.Ignored {
		return fmt.Errorf("device is ignored: %s", deviceID)
	}

	if isSimulatedWLED(device, settings) {
		c.mu.Lock()
		d := c.devices[deviceID]
		d.Name = name
		c.devices[deviceID] = d
		c.updated = time.Now()
		c.mu.Unlock()
		return c.persist()
	}

	patch := map[string]any{"id": map[string]any{"name": name}}
	if err := c.wled.ApplyCfgPatch(ctx, toEngineDevice(device), patch); err != nil {
		return err
	}
	c.mu.Lock()
	d := c.devices[deviceID]
	d.Name = name
	if d.Info == nil {
		d.Info = map[string]any{}
	}
	d.Info["name"] = name
	c.devices[deviceID] = d
	c.updated = time.Now()
	c.mu.Unlock()
	return c.persist()
}

func (c *WLEDController) GetDMXState() DMXState {
	c.mu.RLock()
	st := cloneDMXState(c.dmxState)
	c.mu.RUnlock()

	liveUniverses, legacy := c.liveUniversesSnapshot()
	if liveUniverses != nil {
		st.LiveUniverses = liveUniverses
		st.LiveUniverse = legacy
	}
	return st
}

func (c *WLEDController) CreateDMXFixture(input UpsertDMXFixtureInput) (DMXFixture, error) {
	if !c.dmxEnabled() {
		return DMXFixture{}, fmt.Errorf("dmx component is disabled in settings")
	}
	fixture, err := buildDMXFixtureForCreate(input, c.dmxState.Fixtures)
	if err != nil {
		return DMXFixture{}, err
	}
	c.mu.Lock()
	c.dmxState.Fixtures = append(c.dmxState.Fixtures, fixture)
	c.dmxState = normalizeDMXState(c.dmxState)
	c.dmxPersistEnabled = true
	c.updated = time.Now()
	c.mu.Unlock()
	if err := c.persistDMX(); err != nil {
		return DMXFixture{}, err
	}
	return fixture, nil
}

func (c *WLEDController) UpdateDMXFixture(input UpsertDMXFixtureInput) (DMXFixture, error) {
	if !c.dmxEnabled() {
		return DMXFixture{}, fmt.Errorf("dmx component is disabled in settings")
	}
	id := strings.TrimSpace(input.ID)
	if id == "" {
		return DMXFixture{}, fmt.Errorf("fixture id is required")
	}
	c.mu.Lock()
	idx := -1
	for i := range c.dmxState.Fixtures {
		if c.dmxState.Fixtures[i].ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		c.mu.Unlock()
		return DMXFixture{}, fmt.Errorf("unknown fixture: %s", id)
	}
	updated, err := buildDMXFixtureForUpdate(c.dmxState.Fixtures[idx], input, c.dmxState.Fixtures)
	if err != nil {
		c.mu.Unlock()
		return DMXFixture{}, err
	}
	c.dmxState.Fixtures[idx] = updated
	c.dmxState = normalizeDMXState(c.dmxState)
	c.dmxPersistEnabled = true
	c.updated = time.Now()
	c.mu.Unlock()
	if err := c.persistDMX(); err != nil {
		return DMXFixture{}, err
	}
	return updated, nil
}

func (c *WLEDController) DeleteDMXFixture(id string) error {
	if !c.dmxEnabled() {
		return fmt.Errorf("dmx component is disabled in settings")
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("fixture id is required")
	}
	c.mu.Lock()
	next := make([]DMXFixture, 0, len(c.dmxState.Fixtures))
	found := false
	for _, fixture := range c.dmxState.Fixtures {
		if fixture.ID == id {
			found = true
			continue
		}
		next = append(next, fixture)
	}
	if !found {
		c.mu.Unlock()
		return fmt.Errorf("unknown fixture: %s", id)
	}
	c.dmxState.Fixtures = next
	c.dmxState = normalizeDMXState(c.dmxState)
	c.dmxPersistEnabled = true
	c.updated = time.Now()
	c.mu.Unlock()
	return c.persistDMX()
}

func (c *WLEDController) ListUSBSerialDevices() []USBSerialDevice {
	return c.listUSBSerialDevicesWithSimulators()
}

func (c *WLEDController) SetSelectedUSBSerialDevice(deviceID string) error {
	return c.SetDMXUniverseUSBDevice(DefaultDMXUniverseID, deviceID)
}

const dmxLiveFrameHz = 44
const dmxLivePatchConsoleInterval = 400 * time.Millisecond
const dmxAdapterQueueDepth = 2

func (c *WLEDController) dmxLiveUSBDisplayName(openPath string) string {
	for _, dev := range serial2.ListUSBSerialDevices() {
		pw := serial2.SerialPortForDMXWrite(strings.TrimSpace(dev.Path))
		if pw != openPath && strings.TrimSpace(dev.Path) != openPath {
			continue
		}
		if n := strings.TrimSpace(dev.Name); n != "" {
			return n
		}
		if n := strings.TrimSpace(dev.Description); n != "" {
			return n
		}
	}
	if openPath != "" {
		return filepath.Base(openPath)
	}
	return ""
}

// StartDMXLive starts DMX output workers and opens adapter channels.
func (c *WLEDController) StartDMXLive(fixtureID string) error {
	c.dmxLiveOpMu.Lock()
	defer c.dmxLiveOpMu.Unlock()
	c.mu.RLock()
	dmxSettings := c.settings.DMX
	fixtures := append([]DMXFixture(nil), c.dmxState.Fixtures...)
	c.mu.RUnlock()
	if !dmxSettings.Enabled {
		return fmt.Errorf("dmx component is disabled in settings")
	}

	c.dmxLiveMu.Lock()
	if c.dmxLiveRunning {
		c.dmxLiveMu.Unlock()
		return fmt.Errorf("DMX live output is already running")
	}
	c.dmxLiveRunning = true
	c.dmxLiveErr = ""
	c.dmxLiveFixID = strings.TrimSpace(fixtureID)
	c.ensureDMXLiveUniversesLocked()
	for id := range c.dmxLiveUniverses {
		for i := range c.dmxLiveUniverses[id].buf {
			c.dmxLiveUniverses[id].buf[i] = 0
		}
	}
	c.dmxLiveMu.Unlock()

	reconcileErr := c.reconcileDMXLiveAdaptersLocked()
	c.dmxLiveMu.Lock()
	hasAdapter := c.hasAnyDMXLiveAdapterLocked()
	if hasAdapter {
		updates := buildDMXLiveInitUpdates(fixtures)
		if len(updates) > 0 {
			c.applyDMXLiveUpdatesLocked(updates)
		}
		c.fanOutAllDMXLiveUniversesLocked()
	}
	c.dmxLiveMu.Unlock()
	if !hasAdapter {
		c.stopDMXLiveLocked()
		if reconcileErr != nil {
			return reconcileErr
		}
		return fmt.Errorf("no active DMX adapters; enable USB transport and select USB, and/or enable Art-Net")
	}
	if reconcileErr != nil {
		c.logger.Printf("dmx live: started with partial adapters: %v", reconcileErr)
	}
	return nil
}

func queueLatestDMXFrame(ch chan [512]byte, frame [512]byte) {
	if ch == nil {
		return
	}
	select {
	case ch <- frame:
		return
	default:
	}
	select {
	case <-ch:
	default:
	}
	select {
	case ch <- frame:
	default:
	}
}

func (c *WLEDController) setDMXLiveError(msg string) {
	msg = strings.TrimSpace(msg)
	if msg == "" {
		return
	}
	c.dmxLiveMu.Lock()
	c.dmxLiveErr = msg
	c.dmxLiveMu.Unlock()
}

func (c *WLEDController) reconcileDMXLiveAdapters() error {
	c.dmxLiveOpMu.Lock()
	defer c.dmxLiveOpMu.Unlock()
	return c.reconcileDMXLiveAdaptersLocked()
}

func (c *WLEDController) dmxLiveUSBWorker(frameCh <-chan [512]byte, port serial.Port, path string, enttecPro bool) {
	defer c.dmxLiveUSBWG.Done()
	defer func() { _ = port.Close() }()
	defer func() {
		if c.console != nil {
			c.console.Info(console.TransportUSBDMX, path, "USB DMX worker stopped")
		}
	}()
	frameInterval := time.Second / dmxLiveFrameHz
	ticker := time.NewTicker(frameInterval)
	defer ticker.Stop()

	// Throttle console publishes to one summary per second per worker;
	// emitting at the 44Hz frame rate would drown the console.
	const consoleInterval = time.Second
	var lastConsoleAt time.Time

	rawFrame := make([]byte, 513)
	rawFrame[0] = 0
	var latest [512]byte
	for {
		select {
		case next, ok := <-frameCh:
			if !ok {
				return
			}
			latest = next
		case <-ticker.C:
			var out []byte
			if enttecPro {
				out = dmx.BuildEnttecProSendDMXPacket(latest)
			} else {
				copy(rawFrame[1:], latest[:])
				out = rawFrame
			}
			if _, err := port.Write(out); err != nil {
				c.logger.Printf("dmx usb write (%s): %v", path, err)
				c.setDMXLiveError(fmt.Sprintf("usb write (%s): %v", path, err))
				if c.console != nil {
					c.console.Error(console.TransportUSBDMX, path, "USB write failed", err.Error())
				}
				if c.requestDMXUSBReconnect(path, err) {
					return
				}
				continue
			}
			frameSummary := dmxFrameSummary(latest)
			if c.console != nil {
				now := time.Now()
				if now.Sub(lastConsoleAt) >= consoleInterval {
					lastConsoleAt = now
					packetLabel := "513 bytes"
					if enttecPro {
						packetLabel = "518 bytes Enttec Pro"
					}
					c.logger.Printf("dmx live: usb frame sent path=%s hz=%d %s", path, dmxLiveFrameHz, frameSummary)
					c.console.Out(console.TransportUSBDMX, path,
						fmt.Sprintf("DMX frame sent (%dHz, %s)", dmxLiveFrameHz, packetLabel),
						frameSummary)
				}
			}
		}
	}
}

const dmxLiveUSBReconnectMinInterval = 2 * time.Second

func isRecoverableDMXUSBWriteError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(msg, "device not configured")
}

func (c *WLEDController) requestDMXUSBReconnect(path string, cause error) bool {
	if !isRecoverableDMXUSBWriteError(cause) {
		return false
	}
	now := time.Now()
	c.dmxLiveMu.Lock()
	var universeID string
	for id, rt := range c.dmxLiveUniverses {
		if rt.usbPath == path {
			universeID = id
			if !rt.usbRecoverAt.IsZero() && now.Before(rt.usbRecoverAt) {
				c.dmxLiveMu.Unlock()
				return false
			}
			rt.usbRecoverAt = now.Add(dmxLiveUSBReconnectMinInterval)
			break
		}
	}
	if universeID == "" || !c.dmxLiveRunning {
		c.dmxLiveMu.Unlock()
		return false
	}
	c.dmxLiveMu.Unlock()

	c.logger.Printf("dmx live: usb reconnect requested for %s (universe %s) after write error: %v", path, universeID, cause)
	go func() {
		c.dmxLiveOpMu.Lock()
		defer c.dmxLiveOpMu.Unlock()
		c.stopDMXUSBAdapterForUniverseAndWait(universeID)
		if err := c.startDMXUSBAdapterForUniverse(universeID); err != nil {
			c.logger.Printf("dmx live: usb reconnect failed for %s: %v", path, err)
			c.setDMXLiveError("usb reconnect failed: " + err.Error())
			return
		}
		c.logger.Printf("dmx live: usb reconnect succeeded for %s", path)
	}()
	return true
}

func (c *WLEDController) dmxLiveUSBSimulatorWorker(frameCh <-chan [512]byte, path string) {
	defer c.dmxLiveUSBWG.Done()
	defer func() {
		if c.console != nil {
			c.console.Info(console.TransportUSBDMX, path, "USB DMX simulator worker stopped")
		}
	}()
	hz := dmxLiveFrameHz
	ticker := time.NewTicker(time.Second / time.Duration(hz))
	defer ticker.Stop()

	const consoleInterval = time.Second
	var lastConsoleAt time.Time

	var latest [512]byte
	for {
		select {
		case next, ok := <-frameCh:
			if !ok {
				return
			}
			latest = next
		case <-ticker.C:
			if c.console != nil {
				now := time.Now()
				if now.Sub(lastConsoleAt) >= consoleInterval {
					lastConsoleAt = now
					c.console.Out(
						console.TransportUSBDMX,
						path,
						fmt.Sprintf("Simulated DMX frame sent (%dHz, 513 bytes)", hz),
						dmxFrameSummary(latest),
					)
				}
			}
		}
	}
}

func (c *WLEDController) dmxLiveArtNetWorker(frameCh <-chan [512]byte, conn *net.UDPConn, settings ArtNetSettings, target string) {
	defer c.dmxLiveArtWG.Done()
	defer func() { _ = conn.Close() }()
	defer func() {
		if c.console != nil {
			c.console.Info(console.TransportArtNet, target, "Art-Net worker stopped")
		}
	}()
	hz := settings.RefreshHz
	if hz <= 0 {
		hz = dmxLiveFrameHz
	}
	ticker := time.NewTicker(time.Second / time.Duration(hz))
	defer ticker.Stop()

	const consoleInterval = time.Second
	var lastConsoleAt time.Time

	var latest [512]byte
	var seq byte = 1
	for {
		select {
		case next, ok := <-frameCh:
			if !ok {
				return
			}
			latest = next
		case <-ticker.C:
			packet := dmx.BuildArtDMXPacket(latest, seq, settings.Net, settings.Subnet, settings.Universe)
			if _, err := conn.Write(packet); err != nil {
				c.logger.Printf("dmx artnet write (%s): %v", target, err)
				c.setDMXLiveError(fmt.Sprintf("artnet write (%s): %v", target, err))
				if c.console != nil {
					c.console.Error(console.TransportArtNet, target, "Art-Net write failed", err.Error())
				}
			} else if c.console != nil {
				now := time.Now()
				if now.Sub(lastConsoleAt) >= consoleInterval {
					lastConsoleAt = now
					frameSummary := dmxFrameSummary(latest)
					c.logger.Printf("dmx live: artnet frame sent target=%s seq=%d net=%d subnet=%d universe=%d hz=%d %s",
						target, seq, settings.Net, settings.Subnet, settings.Universe, hz, frameSummary)
					c.console.Out(console.TransportArtNet, target,
						fmt.Sprintf("ArtDmx seq=%d net=%d subnet=%d universe=%d (%d bytes)", seq, settings.Net, settings.Subnet, settings.Universe, len(packet)),
						frameSummary)
				}
			}
			seq++
			if seq == 0 {
				seq = 1
			}
		}
	}
}

func (c *WLEDController) dmxLiveArtNetSimulatorWorker(frameCh <-chan [512]byte, settings ArtNetSettings, target string) {
	defer c.dmxLiveArtWG.Done()
	defer func() {
		if c.console != nil {
			c.console.Info(console.TransportArtNet, target, "Art-Net simulator worker stopped")
		}
	}()
	hz := settings.RefreshHz
	if hz <= 0 {
		hz = dmxLiveFrameHz
	}
	ticker := time.NewTicker(time.Second / time.Duration(hz))
	defer ticker.Stop()

	const consoleInterval = time.Second
	var lastConsoleAt time.Time

	var latest [512]byte
	var seq byte = 1
	for {
		select {
		case next, ok := <-frameCh:
			if !ok {
				return
			}
			latest = next
		case <-ticker.C:
			if c.console != nil {
				now := time.Now()
				if now.Sub(lastConsoleAt) >= consoleInterval {
					lastConsoleAt = now
					c.console.Out(
						console.TransportArtNet,
						target,
						fmt.Sprintf("Simulated ArtDmx seq=%d net=%d subnet=%d universe=%d", seq, settings.Net, settings.Subnet, settings.Universe),
						dmxFrameSummary(latest),
					)
				}
			}
			seq++
			if seq == 0 {
				seq = 1
			}
		}
	}
}

// dmxFrameSummary returns the first 16 channels for the console detail line.
func dmxFrameSummary(frame [512]byte) string {
	const previewLen = 16
	parts := make([]string, 0, previewLen)
	for i := 0; i < previewLen; i++ {
		parts = append(parts, fmt.Sprintf("%d", frame[i]))
	}
	return "ch1-" + fmt.Sprintf("%d=[%s]", previewLen, strings.Join(parts, ","))
}

// StopDMXLive stops streaming and closes all adapter channels.
func (c *WLEDController) StopDMXLive() {
	c.dmxLiveOpMu.Lock()
	defer c.dmxLiveOpMu.Unlock()
	c.stopDMXLiveLocked()
}

func (c *WLEDController) stopDMXLiveLocked() {
	c.stopDMXPartyWithReason("")
	c.dmxLiveMu.Lock()
	c.stopAllDMXLiveAdaptersLocked()
	c.dmxLiveUniverses = nil
	c.dmxLiveRunning = false
	c.dmxLiveErr = ""
	c.dmxLiveFixID = ""
	c.dmxLiveMu.Unlock()
	c.dmxLiveUSBWG.Wait()
	c.dmxLiveArtWG.Wait()
}

// ApplyDMXLivePatch merges channel updates and asynchronously fans out the latest frame to active adapters.
func (c *WLEDController) ApplyDMXLivePatch(updates []dmx.DMXOutputUpdate) error {
	if !c.dmxEnabled() {
		return fmt.Errorf("dmx component is disabled in settings")
	}
	c.mu.Lock()
	fixtures := append([]DMXFixture(nil), c.dmxState.Fixtures...)
	universes := normalizeDMXUniverses(c.dmxState.Universes)
	c.mu.Unlock()
	updates = expandDMXUpdatesToSlaves(fixtures, updates, nil)
	c.dmxLiveMu.Lock()
	defer c.dmxLiveMu.Unlock()
	if !c.dmxLiveRunning || !c.hasAnyDMXLiveAdapterLocked() {
		return fmt.Errorf("DMX live output is not running")
	}
	const sampleLimit = 8
	changedCount := 0
	samples := make([]string, 0, sampleLimit)
	changedUniverses := make(map[string]struct{})
	for _, u := range updates {
		universeID := resolveUniverseIDForUpdate(u.UniverseID)
		if !universeKnown(universes, universeID) {
			continue
		}
		addr := u.Address
		if addr < 1 || addr > 512 {
			continue
		}
		if c.dmxPartyRunning && c.partyOwnedAddrLocked(universeID, addr) {
			continue
		}
		v := u.Value
		if v < 0 {
			v = 0
		}
		if v > 255 {
			v = 255
		}
		next := byte(v)
		rt := c.dmxLiveRuntime(universeID)
		idx := addr - 1
		if rt.buf[idx] == next {
			continue
		}
		rt.buf[idx] = next
		changedUniverses[universeID] = struct{}{}
		changedCount++
		if len(samples) < sampleLimit {
			samples = append(samples, fmt.Sprintf("%s:ch%d=%d", universeID, addr, next))
		}
	}
	for universeID := range changedUniverses {
		c.fanOutUniverseFrameLocked(universeID)
	}
	if c.console != nil && changedCount > 0 {
		now := time.Now()
		if now.Sub(c.dmxLivePatchLog) >= dmxLivePatchConsoleInterval {
			c.dmxLivePatchLog = now
			detail := strings.Join(samples, ", ")
			if changedCount > len(samples) {
				detail += fmt.Sprintf(", +%d more", changedCount-len(samples))
			}
			summary := fmt.Sprintf("Live patch applied (%d channel updates)", changedCount)
			paths, _ := c.collectDMXLiveStatusPaths()
			for _, target := range paths {
				if strings.Contains(target, "artnet") || strings.HasPrefix(target, "sim://artnet") {
					c.console.Out(console.TransportArtNet, target, summary, detail)
				} else {
					c.console.Out(console.TransportUSBDMX, target, summary, detail)
				}
			}
		}
	}
	return nil
}

func universeKnown(universes []DMXUniverse, universeID string) bool {
	for _, u := range universes {
		if u.ID == universeID {
			return true
		}
	}
	return false
}

func (c *WLEDController) applyDMXLiveUpdatesLocked(updates []dmx.DMXOutputUpdate) int {
	changedCount := 0
	for _, u := range updates {
		universeID := resolveUniverseIDForUpdate(u.UniverseID)
		addr := u.Address
		if addr < 1 || addr > 512 {
			continue
		}
		v := clampDMXByte(u.Value)
		next := byte(v)
		rt := c.dmxLiveRuntime(universeID)
		idx := addr - 1
		if rt.buf[idx] == next {
			continue
		}
		rt.buf[idx] = next
		changedCount++
	}
	return changedCount
}

// GetDMXLiveStatus returns connection metadata for the UI.
func (c *WLEDController) GetDMXLiveStatus() dmx.DMXLiveStatus {
	if !c.dmxEnabled() {
		return dmx.DMXLiveStatus{
			Connected: false,
			Error:     "dmx component is disabled in settings",
		}
	}
	c.dmxLiveMu.Lock()
	defer c.dmxLiveMu.Unlock()

	paths, names := c.collectDMXLiveStatusPaths()
	return dmx.DMXLiveStatus{
		Connected:  c.dmxLiveRunning && c.hasAnyDMXLiveAdapterLocked(),
		Error:      c.dmxLiveErr,
		DevicePath: strings.Join(paths, " | "),
		DeviceName: strings.Join(names, " | "),
		FixtureID:  c.dmxLiveFixID,
	}
}

func (c *WLEDController) persistenceLoop(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := c.persist(); err != nil {
				c.logger.Printf("periodic persist failed: %v", err)
			}
			if err := c.persistDMX(); err != nil {
				c.logger.Printf("periodic dmx persist failed: %v", err)
			}
		}
	}
}

// recallWLEDDevicePresetsOnBoot tells each known WLED unit to load a preset from its own
// flash (HTTP JSON "ps") instead of replaying merged LastState from the desktop session.
func (c *WLEDController) recallWLEDDevicePresetsOnBoot(ctx context.Context) {
	if !c.wledEnabled() {
		return
	}
	select {
	case <-time.After(2 * time.Second):
	case <-ctx.Done():
		return
	}

	c.mu.RLock()
	list := make([]WLEDDevice, 0, len(c.devices))
	for _, d := range c.devices {
		if d.Ignored {
			continue
		}
		list = append(list, d)
	}
	c.mu.RUnlock()

	restoreCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	for _, device := range list {
		ps := wledBootPresetSlot(device.LastState)
		payload := map[string]any{"ps": ps}
		if err := c.applyWLEDState(restoreCtx, device, payload); err != nil {
			c.logger.Printf("wled boot preset recall for %s failed: %v", device.ID, err)
			continue
		}
		c.mu.Lock()
		latest := c.devices[device.ID]
		latest.Online = true
		latest.LastSeen = time.Now()
		if latest.Info == nil {
			latest.Info = map[string]any{}
		}
		latest.LastState = mergeStateIntoLastState(latest.LastState, payload)
		c.devices[device.ID] = latest
		c.updated = time.Now()
		c.mu.Unlock()
	}
	if err := c.persist(); err != nil {
		c.logger.Printf("persist after boot preset recall failed: %v", err)
	}
}

// wledBootPresetSlot picks the WLED preset index to recall on startup (1–250).
// If LastState remembers a recent "ps" value, that wins; otherwise slot 1 is used.
func wledBootPresetSlot(lastState map[string]any) int {
	const fallback = 1
	if lastState != nil {
		if v, ok := lastState["ps"]; ok {
			if n, ok := intFromAny(v); ok && n >= 1 && n <= 250 {
				return n
			}
		}
	}
	return fallback
}

func (c *WLEDController) healthLoop(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.checkKnownDevices(ctx)
		}
	}
}

func (c *WLEDController) checkKnownDevices(ctx context.Context) {
	if !c.wledEnabled() {
		return
	}
	c.mu.RLock()
	devices := make([]WLEDDevice, 0, len(c.devices))
	for _, device := range c.devices {
		devices = append(devices, device)
	}
	c.mu.RUnlock()

	for _, device := range devices {
		state, err := c.getWLEDState(ctx, device)
		c.mu.Lock()
		latest := c.devices[device.ID]
		if latest.Ignored {
			c.mu.Unlock()
			continue
		}
		if err != nil {
			latest.Online = false
			c.devices[device.ID] = latest
			c.mu.Unlock()
			continue
		}

		latest.Online = true
		latest.LastSeen = time.Now()
		if latest.Info == nil {
			latest.Info = map[string]any{}
		}
		if on, ok := state["on"]; ok {
			latest.Info["on"] = on
		}
		if bri, ok := state["bri"]; ok {
			latest.Info["bri"] = bri
		}
		latest.LastState = mergeStateIntoLastState(latest.LastState, state)
		c.devices[device.ID] = latest
		c.updated = time.Now()
		c.mu.Unlock()
	}
}

func (c *WLEDController) touch() {
	c.mu.Lock()
	c.updated = time.Now()
	c.mu.Unlock()
}

func (c *WLEDController) persist() error {
	if c.importingConfig.Load() {
		return nil
	}
	c.mu.RLock()
	state := persistentState{
		Version:  persistentStateVersion,
		SavedAt:  time.Now(),
		Settings: c.settings,
		Devices:  cloneDeviceMap(c.devices),
	}
	c.mu.RUnlock()
	return c.persistence.Save(state)
}

func (c *WLEDController) persistDMX() error {
	if c.importingConfig.Load() {
		return nil
	}
	c.mu.RLock()
	if !c.dmxPersistEnabled {
		c.mu.RUnlock()
		return nil
	}
	state := cloneDMXState(c.dmxState)
	c.mu.RUnlock()
	state.Party = stripDMXPartyRuntimeForPersistence(state.Party)
	return c.dmxPersistence.Save(state)
}

func cloneDeviceMap(in map[string]WLEDDevice) map[string]WLEDDevice {
	out := make(map[string]WLEDDevice, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}

func cloneDMXState(in DMXState) DMXState {
	out := DMXState{
		Universes:           normalizeDMXUniverses(in.Universes),
		Fixtures:            make([]DMXFixture, 0, len(in.Fixtures)),
		SelectedUSBDeviceID: strings.TrimSpace(in.SelectedUSBDeviceID),
		Party:               normalizeDMXPartyState(in.Party),
	}
	out.Party.Config.FixtureIDs = append([]string(nil), out.Party.Config.FixtureIDs...)
	out.Party.Config.WLEDDeviceIDs = append([]string(nil), out.Party.Config.WLEDDeviceIDs...)
	for _, fixture := range in.Fixtures {
		cp := fixture
		cp.Brand = strings.TrimSpace(cp.Brand)
		cp.Name = strings.TrimSpace(cp.Name)
		cp.UniverseID = normalizeFixtureUniverseID(cp.UniverseID, out.Universes)
		cp.Party = normalizeFixtureParty(cp.Party)
		if len(cp.Party.ChannelWeights) > 0 {
			wm := make(map[string]int, len(cp.Party.ChannelWeights))
			for k, v := range cp.Party.ChannelWeights {
				wm[k] = v
			}
			cp.Party.ChannelWeights = wm
		}
		if cp.Channels == nil {
			cp.Channels = []DMXChannel{}
		} else {
			cp.Channels = append([]DMXChannel(nil), cp.Channels...)
		}
		out.Fixtures = append(out.Fixtures, cp)
	}
	slices.SortFunc(out.Fixtures, func(a, b DMXFixture) int {
		nameA := strings.ToLower(strings.TrimSpace(a.Name))
		nameB := strings.ToLower(strings.TrimSpace(b.Name))
		if cmp := strings.Compare(nameA, nameB); cmp != 0 {
			return cmp
		}
		return strings.Compare(a.ID, b.ID)
	})
	return out
}

func DefaultControllerSettings() ControllerSettings {
	return ControllerSettings{
		AccessPoint: AccessPointSettings{
			Enabled:       true,
			Connection:    "wled-controller-ap",
			InterfaceName: "wlan0",
			SSID:          "WLED-Controller-Net",
			Password:      "wled-control",
			Channel:       6,
		},
		WLED: WLEDSettings{
			Enabled: true,
			Provisioning: ProvisioningSettings{
				AutoProvision:       false,
				DefaultStatePayload: map[string]any{"on": true, "bri": 180},
				DefaultConfigPatch:  map[string]any{},
			},
			Testing: TestingSettings{
				SimulateWLED: false,
			},
			Debug: WLEDDebugSettings{
				ShowInfo: false,
			},
		},
		DMX: DMXSettings{
			Enabled: true,
			USB: USBTransportSettings{
				Enabled: boolPtr(true),
			},
			ArtNet: ArtNetSettings{
				Enabled:    false,
				TargetHost: "255.255.255.255",
				Port:       6454,
				Net:        0,
				Subnet:     0,
				Universe:   0,
				RefreshHz:  dmxLiveFrameHz,
			},
			Testing: DMXTestingSettings{
				SimulateUSBDMX: false,
				SimulateArtNet: false,
			},
		},
	}
}

func mergeWithDefaults(in ControllerSettings) ControllerSettings {
	defaults := DefaultControllerSettings()
	out := in

	if out.WLED.Provisioning.DefaultStatePayload == nil && out.Provisioning.DefaultStatePayload != nil {
		out.WLED.Provisioning = out.Provisioning
	}
	if !out.WLED.Testing.SimulateWLED && out.Testing.SimulateWLED {
		out.WLED.Testing = out.Testing
	}
	hasWLEDConfig := out.WLED.Enabled ||
		out.WLED.Provisioning.DefaultStatePayload != nil ||
		out.WLED.Provisioning.DefaultConfigPatch != nil ||
		out.WLED.Testing.SimulateWLED
	if !hasWLEDConfig {
		out.WLED.Enabled = defaults.WLED.Enabled
	}
	hasDMXConfig := out.DMX.Enabled ||
		out.DMX.USB.Enabled != nil ||
		out.DMX.ArtNet.Enabled ||
		strings.TrimSpace(out.DMX.ArtNet.TargetHost) != "" ||
		out.DMX.ArtNet.Port > 0 ||
		out.DMX.ArtNet.Net > 0 ||
		out.DMX.ArtNet.Subnet > 0 ||
		out.DMX.ArtNet.Universe > 0 ||
		out.DMX.ArtNet.RefreshHz > 0 ||
		out.DMX.Testing.SimulateUSBDMX ||
		out.DMX.Testing.SimulateArtNet
	if !hasDMXConfig {
		out.DMX.Enabled = defaults.DMX.Enabled
	}
	if out.DMX.USB.Enabled == nil {
		out.DMX.USB.Enabled = boolPtr(isDMXUSBEnabled(defaults.DMX))
	}

	if out.AccessPoint.Connection == "" {
		out.AccessPoint.Connection = defaults.AccessPoint.Connection
	}
	if out.AccessPoint.InterfaceName == "" {
		out.AccessPoint.InterfaceName = defaults.AccessPoint.InterfaceName
	}
	if out.AccessPoint.SSID == "" {
		out.AccessPoint.SSID = defaults.AccessPoint.SSID
	}
	if out.AccessPoint.Password == "" {
		out.AccessPoint.Password = defaults.AccessPoint.Password
	}
	if out.AccessPoint.Channel <= 0 {
		out.AccessPoint.Channel = defaults.AccessPoint.Channel
	}
	clampAccessPointTo24GHz(&out.AccessPoint)
	if out.WLED.Provisioning.DefaultStatePayload == nil {
		out.WLED.Provisioning.DefaultStatePayload = cloneJSONMap(defaults.WLED.Provisioning.DefaultStatePayload)
	}
	if out.WLED.Provisioning.DefaultConfigPatch == nil {
		out.WLED.Provisioning.DefaultConfigPatch = cloneJSONMap(defaults.WLED.Provisioning.DefaultConfigPatch)
	}
	if strings.TrimSpace(out.DMX.ArtNet.TargetHost) == "" {
		out.DMX.ArtNet.TargetHost = defaults.DMX.ArtNet.TargetHost
	}
	if out.DMX.ArtNet.Port <= 0 {
		out.DMX.ArtNet.Port = defaults.DMX.ArtNet.Port
	}
	if out.DMX.ArtNet.RefreshHz <= 0 {
		out.DMX.ArtNet.RefreshHz = defaults.DMX.ArtNet.RefreshHz
	}
	clampArtNetSettings(&out.DMX.ArtNet)
	out.DMX.UniverseInterfaces = clampDMXUniverseInterfaces(out.DMX.UniverseInterfaces)
	if !out.WLED.Enabled {
		out.AccessPoint.Enabled = false
	}
	// Clear legacy v2 fields before persistence.
	out.Discovery = legacyDiscoverySettings{}
	out.Provisioning = ProvisioningSettings{}
	out.Testing = TestingSettings{}
	return out
}

func boolPtr(v bool) *bool {
	return &v
}

func isDMXUSBEnabled(settings DMXSettings) bool {
	if settings.USB.Enabled == nil {
		return true
	}
	return *settings.USB.Enabled
}

// clampAccessPointTo24GHz coerces the AP Wi‑Fi channel into the 2.4 GHz band (channels 1–14).
// Invalid values (e.g. 5 GHz channels) are replaced with defaultAP24Channel.
func clampAccessPointTo24GHz(ap *AccessPointSettings) {
	if ap == nil {
		return
	}
	if ap.Channel < ap24MinChannel || ap.Channel > ap24MaxChannel {
		ap.Channel = defaultAP24Channel
	}
}

func clampArtNetSettings(art *ArtNetSettings) {
	if art == nil {
		return
	}
	if strings.TrimSpace(art.TargetHost) == "" {
		art.TargetHost = "255.255.255.255"
	}
	if art.Port <= 0 || art.Port > 65535 {
		art.Port = 6454
	}
	if art.Net < 0 {
		art.Net = 0
	}
	if art.Net > 127 {
		art.Net = 127
	}
	if art.Subnet < 0 {
		art.Subnet = 0
	}
	if art.Subnet > 15 {
		art.Subnet = 15
	}
	if art.Universe < 0 {
		art.Universe = 0
	}
	if art.Universe > 15 {
		art.Universe = 15
	}
	if art.RefreshHz <= 0 {
		art.RefreshHz = dmxLiveFrameHz
	}
	if art.RefreshHz > 50 {
		art.RefreshHz = 50
	}
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func cloneJSONMap(m map[string]any) map[string]any {
	if m == nil {
		return nil
	}
	encoded, err := json.Marshal(m)
	if err != nil {
		return nil
	}
	var out map[string]any
	if err := json.Unmarshal(encoded, &out); err != nil {
		return nil
	}
	return out
}

func mergeStateIntoLastState(last map[string]any, patch map[string]any) map[string]any {
	if patch == nil {
		return cloneJSONMap(last)
	}
	base := cloneJSONMap(last)
	if base == nil {
		base = map[string]any{}
	}
	for k, v := range patch {
		if k == "on" && v == "t" {
			continue
		}
		if k == "seg" {
			base["seg"] = mergeSegJSON(base["seg"], v)
			continue
		}
		base[k] = v
	}
	return base
}

func mergeSegJSON(existing any, patch any) any {
	patchArr, ok := patch.([]any)
	if !ok || len(patchArr) == 0 {
		return patch
	}
	patchSeg, ok := patchArr[0].(map[string]any)
	if !ok {
		return patch
	}
	existArr, ok := existing.([]any)
	if !ok || len(existArr) == 0 {
		return patch
	}
	first, ok := existArr[0].(map[string]any)
	if !ok {
		return patch
	}
	merged := cloneJSONMap(first)
	for k, v := range patchSeg {
		merged[k] = v
	}
	out := make([]any, len(existArr))
	out[0] = merged
	for i := 1; i < len(existArr); i++ {
		out[i] = existArr[i]
	}
	return out
}

func stringifyAnySlice(items []any) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		switch v := item.(type) {
		case string:
			out = append(out, v)
		default:
			out = append(out, fmt.Sprint(v))
		}
	}
	return out
}

func defaultDMXState() DMXState {
	return DMXState{
		Universes:           defaultDMXUniverses(),
		Fixtures:            []DMXFixture{},
		SelectedUSBDeviceID: "",
		Party:               defaultDMXPartyState(),
	}
}

func normalizeDMXState(st DMXState) DMXState {
	normalized := cloneDMXState(st)
	normalized.LiveUniverse = nil
	normalized.LiveUniverses = nil
	normalized.Universes = normalizeDMXUniverses(normalized.Universes)
	for i := range normalized.Fixtures {
		normalized.Fixtures[i].Type = normalizeFixtureType(normalized.Fixtures[i].Type)
		normalized.Fixtures[i].UniverseID = normalizeFixtureUniverseID(normalized.Fixtures[i].UniverseID, normalized.Universes)
		addr := normalized.Fixtures[i].DMXAddress
		if addr < 1 || addr > 512 {
			addr = 1
		}
		normalized.Fixtures[i].DMXAddress = addr
		normalized.Fixtures[i].Channels = sanitizeDMXChannels(normalized.Fixtures[i].DMXAddress, normalized.Fixtures[i].Channels)
	}
	normalized.Fixtures = sanitizeMasterSlaveRelationships(normalized.Fixtures)
	normalized.Party = normalizeDMXPartyState(normalized.Party)
	return normalized
}

func normalizeFixtureType(t DMXFixtureType) DMXFixtureType {
	switch t {
	case DMXFixtureTypeColorChanger,
		DMXFixtureTypeDimmer,
		DMXFixtureTypeEffect,
		DMXFixtureTypeFan,
		DMXFixtureTypeFlower,
		DMXFixtureTypeHazer,
		DMXFixtureTypeLaser,
		DMXFixtureTypeLEDBarBeams,
		DMXFixtureTypeLEDBarPixels,
		DMXFixtureTypeMovingHead,
		DMXFixtureTypeOther,
		DMXFixtureTypeScanner,
		DMXFixtureTypeSmoke,
		DMXFixtureTypeStrobe:
		return t
	default:
		return DMXFixtureTypeMovingHead
	}
}

func sanitizeDMXChannels(dmxAddress int, in []DMXChannel) []DMXChannel {
	addr := dmxAddress
	if addr < 1 || addr > 512 {
		addr = 1
	}
	maxOff := 512 - addr + 1
	if len(in) == 0 {
		return []DMXChannel{defaultDMXChannel()}
	}
	out := make([]DMXChannel, 0, len(in))
	used := make(map[int]struct{}, len(in))
	for _, ch := range in {
		n := ch.Channel
		if n < 1 || n > maxOff {
			continue
		}
		if _, ok := used[n]; ok {
			continue
		}
		used[n] = struct{}{}
		out = append(out, DMXChannel{
			Channel:      n,
			Type:         normalizeDMXChannelType(ch.Type),
			DefaultValue: sanitizeDMXChannelDefaultValue(ch.DefaultValue),
			Properties:   sanitizeDMXChannelProperties(ch.Properties),
		})
	}
	if len(out) == 0 {
		out = append(out, defaultDMXChannel())
	}
	slices.SortFunc(out, func(a, b DMXChannel) int {
		if a.Channel < b.Channel {
			return -1
		}
		if a.Channel > b.Channel {
			return 1
		}
		return strings.Compare(strings.ToLower(a.Type), strings.ToLower(b.Type))
	})
	return out
}

func buildDMXFixtureForCreate(input UpsertDMXFixtureInput, fixtures []DMXFixture) (DMXFixture, error) {
	base := DMXFixture{
		ID:        fmt.Sprintf("fixture-%d", time.Now().UnixNano()),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	return buildDMXFixtureForUpdate(base, input, fixtures)
}

func buildDMXFixtureForUpdate(existing DMXFixture, input UpsertDMXFixtureInput, fixtures []DMXFixture) (DMXFixture, error) {
	fixtureType := normalizeFixtureType(input.Type)
	brand := strings.TrimSpace(input.Brand)
	name := strings.TrimSpace(input.Name)
	if brand == "" {
		return DMXFixture{}, fmt.Errorf("fixture brand is required")
	}
	if name == "" {
		return DMXFixture{}, fmt.Errorf("fixture name is required")
	}
	if input.MaxPan < 0 || input.MaxPan > 720 {
		return DMXFixture{}, fmt.Errorf("max pan must be between 0 and 720")
	}
	if input.MaxTilt < 0 || input.MaxTilt > 360 {
		return DMXFixture{}, fmt.Errorf("max tilt must be between 0 and 360")
	}
	addr := input.DMXAddress
	if addr < 1 {
		if existing.DMXAddress >= 1 && existing.DMXAddress <= 512 {
			addr = existing.DMXAddress
		} else {
			addr = 1
		}
	}
	if addr < 1 || addr > 512 {
		return DMXFixture{}, fmt.Errorf("dmx address must be between 1 and 512")
	}
	channels, err := validateDMXChannels(addr, input.Channels)
	if err != nil {
		return DMXFixture{}, err
	}
	fixture := existing
	if fixture.ID == "" {
		fixture.ID = fmt.Sprintf("fixture-%d", time.Now().UnixNano())
	}
	if fixture.CreatedAt.IsZero() {
		fixture.CreatedAt = time.Now()
	}
	fixture.UpdatedAt = time.Now()
	fixture.Type = fixtureType
	fixture.Brand = brand
	fixture.Name = name
	fixture.UniverseID = normalizeFixtureUniverseID(input.UniverseID, nil)
	if strings.TrimSpace(fixture.UniverseID) == "" && strings.TrimSpace(existing.UniverseID) != "" {
		fixture.UniverseID = normalizeFixtureUniverseID(existing.UniverseID, nil)
	}
	fixture.DMXAddress = addr
	fixture.MovingHead = MovingHeadConfig{
		MaxPan:  input.MaxPan,
		MaxTilt: input.MaxTilt,
	}
	fixture.Party = normalizeFixtureParty(input.Party)
	fixture.Channels = channels
	masterID, err := validateMasterFixtureID(fixtures, fixture.ID, input.MasterFixtureID)
	if err != nil {
		return DMXFixture{}, err
	}
	fixture.MasterFixtureID = masterID
	return fixture, nil
}

func validateDMXChannels(dmxAddress int, channels []DMXChannel) ([]DMXChannel, error) {
	if len(channels) == 0 {
		return nil, fmt.Errorf("at least one DMX channel is required")
	}
	if len(channels) > 1024 {
		return nil, fmt.Errorf("too many channels")
	}
	used := make(map[int]struct{}, len(channels))
	out := make([]DMXChannel, 0, len(channels))
	maxOff := 512 - dmxAddress + 1
	for _, ch := range channels {
		if ch.Channel < 1 || ch.Channel > maxOff {
			return nil, fmt.Errorf("channel offset %d must be between 1 and %d for dmx address %d", ch.Channel, maxOff, dmxAddress)
		}
		if _, exists := used[ch.Channel]; exists {
			return nil, fmt.Errorf("channel offset %d is duplicated", ch.Channel)
		}
		used[ch.Channel] = struct{}{}
		out = append(out, DMXChannel{
			Channel:      ch.Channel,
			Type:         normalizeDMXChannelType(ch.Type),
			DefaultValue: sanitizeDMXChannelDefaultValue(ch.DefaultValue),
			Properties:   sanitizeDMXChannelProperties(ch.Properties),
		})
	}
	slices.SortFunc(out, func(a, b DMXChannel) int {
		if a.Channel < b.Channel {
			return -1
		}
		if a.Channel > b.Channel {
			return 1
		}
		return 0
	})
	return out, nil
}

func defaultDMXChannel() DMXChannel {
	return DMXChannel{
		Channel: 1,
		Type:    "pan",
		Properties: map[string]any{
			"min": 0,
			"max": 255,
		},
	}
}

func normalizeDMXChannelType(v string) string {
	t := strings.TrimSpace(v)
	if t == "" {
		return "custom"
	}
	return t
}

func sanitizeDMXChannelProperties(in map[string]any) map[string]any {
	props := cloneJSONMap(in)
	if props == nil {
		props = map[string]any{}
	}
	return props
}

func sanitizeDMXChannelDefaultValue(in *int) *int {
	if in == nil {
		return nil
	}
	v := *in
	if v < 0 {
		v = 0
	}
	if v > 255 {
		v = 255
	}
	return &v
}

func defaultGeneralTabState() GeneralTabState {
	return GeneralTabState{
		On:  true,
		Bri: 200,
		RGB: [3]int{255, 169, 87},
		FX:  0,
		Pal: 0,
		SX:  128,
		IX:  128,
	}
}

func clampGeneralTabState(st GeneralTabState) GeneralTabState {
	clamp255 := func(v int) int {
		if v < 0 {
			return 0
		}
		if v > 255 {
			return 255
		}
		return v
	}
	if st.FX < 0 {
		st.FX = 0
	}
	if st.Pal < 0 {
		st.Pal = 0
	}
	st.Bri = clamp255(st.Bri)
	st.SX = clamp255(st.SX)
	st.IX = clamp255(st.IX)
	st.RGB[0] = clamp255(st.RGB[0])
	st.RGB[1] = clamp255(st.RGB[1])
	st.RGB[2] = clamp255(st.RGB[2])
	return st
}

func mergeGeneralTabState(current GeneralTabState, patch map[string]any) GeneralTabState {
	next := current
	if on, ok := patch["on"].(bool); ok {
		next.On = on
	}
	if bri, ok := intFromAny(patch["bri"]); ok {
		next.Bri = bri
	}
	segArr, ok := patch["seg"].([]any)
	if !ok || len(segArr) == 0 {
		return clampGeneralTabState(next)
	}
	seg, ok := segArr[0].(map[string]any)
	if !ok {
		return clampGeneralTabState(next)
	}
	if fx, ok := intFromAny(seg["fx"]); ok {
		next.FX = fx
	}
	if pal, ok := intFromAny(seg["pal"]); ok {
		next.Pal = pal
	}
	if sx, ok := intFromAny(seg["sx"]); ok {
		next.SX = sx
	}
	if ix, ok := intFromAny(seg["ix"]); ok {
		next.IX = ix
	}
	if rgb, ok := rgbFromSegColor(seg["col"]); ok {
		next.RGB = rgb
	}
	return clampGeneralTabState(next)
}

func intFromAny(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int8:
		return int(n), true
	case int16:
		return int(n), true
	case int32:
		return int(n), true
	case int64:
		return int(n), true
	case float32:
		return int(n), true
	case float64:
		return int(n), true
	default:
		return 0, false
	}
}

func rgbFromSegColor(v any) ([3]int, bool) {
	out := [3]int{}
	col, ok := v.([]any)
	if !ok || len(col) == 0 {
		return out, false
	}
	first, ok := col[0].([]any)
	if !ok || len(first) < 3 {
		return out, false
	}
	r, okR := intFromAny(first[0])
	g, okG := intFromAny(first[1])
	b, okB := intFromAny(first[2])
	if !okR || !okG || !okB {
		return out, false
	}
	out[0], out[1], out[2] = r, g, b
	return out, true
}

func isNoOpStatePatch(last map[string]any, patch map[string]any) bool {
	if len(patch) == 0 {
		return true
	}
	if v, ok := patch["on"]; ok {
		if s, ok := v.(string); ok && s == "t" {
			return false
		}
	}
	return isStatePatchSatisfiedByState(last, patch)
}

func isStatePatchSatisfiedByState(state map[string]any, patch map[string]any) bool {
	for key, value := range patch {
		if key == "seg" {
			patchSegList, ok := value.([]any)
			if !ok {
				continue
			}
			stateSegList, _ := state["seg"].([]any)
			for _, segRaw := range patchSegList {
				segPatch, ok := segRaw.(map[string]any)
				if !ok {
					continue
				}
				segID, ok := intFromAny(segPatch["id"])
				if !ok || segID < 0 {
					continue
				}
				var stateSeg map[string]any
				for _, s := range stateSegList {
					candidate, ok := s.(map[string]any)
					if !ok {
						continue
					}
					candidateID, ok := intFromAny(candidate["id"])
					if ok && candidateID == segID {
						stateSeg = candidate
						break
					}
				}
				if stateSeg == nil {
					return false
				}
				for segKey, segValue := range segPatch {
					if segKey == "id" {
						continue
					}
					if !jsonEqual(stateSeg[segKey], segValue) {
						return false
					}
				}
			}
			continue
		}
		if !jsonEqual(state[key], value) {
			return false
		}
	}
	return true
}

func jsonEqual(a any, b any) bool {
	ab, errA := json.Marshal(a)
	bb, errB := json.Marshal(b)
	if errA != nil || errB != nil {
		return false
	}
	return bytes.Equal(ab, bb)
}

func defaultSimulatedState() map[string]any {
	return cloneJSONMap(newSimulatedWLEDDevice().LastState)
}

func buildSimulatedFullJSON(device WLEDDevice) map[string]any {
	state := cloneJSONMap(device.LastState)
	if len(state) == 0 {
		state = defaultSimulatedState()
	}
	if _, ok := state["seg"]; !ok {
		state["seg"] = []any{map[string]any{
			"id": 0, "start": 0, "stop": 149, "len": 150,
			"col": []any{[]any{255, 160, 0}},
		}}
	}
	return map[string]any{
		"state": state,
		"info": map[string]any{
			"name": device.Name,
			"ver":  "0.14.0-sim",
			"mac":  simulatedWLEDDeviceID,
		},
		"effects": []any{"Solid", "Blink", "Breathe", "Wipe", "Wipe Random", "Random Colors", "Sweep", "Dynamic", "Colorloop", "Rainbow",
			"Scan", "Dual Scan", "Fade", "Chase", "Chase Rainbow", "Running", "Saw", "Twinkle", "Dissolve", "Dissolve Rnd",
			"Sparkle", "Dark Sparkle", "Sparkle+", "Strobe", "Strobe Rainbow", "Mega Strobe", "Blink Rainbow", "Android", "Chase", "Chase Random",
			"Chase Rainbow", "Chase Flash", "Chase Flash Rnd", "Rainbow Runner", "Colorful", "Traffic Light", "Sweep Random", "Running 2", "Red & Blue", "Stream",
			"Scanner", "Lighthouse", "Fireworks", "Rain", "Merry Christmas", "Fire Flicker", "Gradient", "Loading", "In Out", "In In",
			"Out Out", "Out In", "Circus", "Halloween", "Tri Chase", "Tri Wipe", "Tri Fade", "Lightning", "ICU", "Multi Comet",
			"Dual Scanner", "Stream 2", "Oscillate", "Pride 2015", "Juggle", "Palette", "Fire 2012", "Colorwaves", "BPM", "Fill Noise", "Noise 1",
			"Noise 2", "Noise 3", "Noise 4", "Colortwinkle", "Lake", "Meteor", "Smooth Meteor", "Railway", "Ripple"},
		"palettes": []any{"Default", "Random Cycle", "Primary Color", "Based on Primary", "Set Colors", "Based on Set", "Party", "Cloud", "Lava", "Ocean",
			"Forest", "Rainbow", "Rainbow Bands", "Sunset", "Rivendell", "Breeze", "Red & Blue", "Yellowout", "Analogous", "Splash",
			"Pastel", "Sunset 2", "Beech", "Vintage", "Departure", "Landscape", "Beach", "Sherbet", "Hult", "Hult 64",
			"Drywet", "Jul", "Grintage", "Rewhi", "Tertiary", "Fire", "Icefire", "Cyane", "Light Pink", "Autumn",
			"Magenta", "Magred", "Yelmag", "Yelblu", "Orange & Teal", "Tiamat", "April Night"},
	}
}
