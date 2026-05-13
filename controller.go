package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"goldbus/internal/discovery"
	"goldbus/internal/dmx"
	"goldbus/internal/network"
	serial2 "goldbus/internal/serial"
	"goldbus/internal/wledhttp"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/grandcat/zeroconf"
	"go.bug.st/serial"
)

const (
	defaultStateFileName    = "state.json"
	generalTabStateFileName = "general-tab-state.json"
	dmxStateFileName        = "dmx.json"
	simulatedWLEDDeviceID   = "sim:wled"

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

type DiscoverySettings struct {
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

type ControllerSettings struct {
	AccessPoint  AccessPointSettings  `json:"accessPoint"`
	Discovery    DiscoverySettings    `json:"discovery"`
	Provisioning ProvisioningSettings `json:"provisioning"`
	Testing      TestingSettings      `json:"testing"`
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
	return settings.Testing.SimulateWLED && device.ID == simulatedWLEDDeviceID
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

const persistentStateVersion = 2

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
	DMXFixtureTypeMovingHead DMXFixtureType = "movingHead"
)

type DMXChannel struct {
	Channel    int            `json:"channel"`
	Type       string         `json:"type"`
	Properties map[string]any `json:"properties,omitempty"`
}

type MovingHeadConfig struct {
	MaxPan  int `json:"maxPan"`
	MaxTilt int `json:"maxTilt"`
}

type DMXFixture struct {
	ID         string           `json:"id"`
	Type       DMXFixtureType   `json:"type"`
	Brand      string           `json:"brand"`
	Name       string           `json:"name"`
	DMXAddress int              `json:"dmxAddress"`
	MovingHead MovingHeadConfig `json:"movingHead"`
	Channels   []DMXChannel     `json:"channels"`
	CreatedAt  time.Time        `json:"createdAt"`
	UpdatedAt  time.Time        `json:"updatedAt"`
}

type DMXState struct {
	Fixtures            []DMXFixture `json:"fixtures"`
	SelectedUSBDeviceID string       `json:"selectedUSBDeviceId"`
}

type USBSerialDevice = serial2.USBSerialDevice

type UpsertDMXFixtureInput struct {
	ID         string         `json:"id,omitempty"`
	Type       DMXFixtureType `json:"type"`
	Brand      string         `json:"brand"`
	Name       string         `json:"name"`
	DMXAddress int            `json:"dmxAddress"`
	MaxPan     int            `json:"maxPan"`
	MaxTilt    int            `json:"maxTilt"`
	Channels   []DMXChannel   `json:"channels"`
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

type discoveredDevice = discovery.DiscoveredDevice

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
	if state.Settings.AccessPoint.SSID == "" {
		state.Settings = mergeWithDefaults(state.Settings)
	}
	if state.Version < 2 {
		state.Settings.Discovery.PassiveBrowse = true
		if state.Settings.Discovery.PollIntervalSecondsWhenApEnabled <= 0 {
			state.Settings.Discovery.PollIntervalSecondsWhenApEnabled = 5
		}
		state.Version = persistentStateVersion
	}
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

type DiscoveryEngine struct {
	logger *log.Logger
}

func NewDiscoveryEngine(logger *log.Logger) *DiscoveryEngine {
	return &DiscoveryEngine{logger: logger}
}

func toDiscoverySettings(s DiscoverySettings) discovery.Settings {
	return discovery.Settings{
		Enabled:        s.Enabled,
		ServiceTypes:   slices.Clone(s.ServiceTypes),
		QueryTimeoutMS: s.QueryTimeoutMS,
		BindInterface:  s.BindInterface,
		PassiveBrowse:  s.PassiveBrowse,
		SubnetProbe:    s.SubnetProbe,
	}
}

func toDiscoveryControllerSettings(s ControllerSettings) discovery.ControllerSettings {
	return discovery.ControllerSettings{
		Discovery: toDiscoverySettings(s.Discovery),
		AccessPoint: discovery.AccessPointSettings{
			Enabled:       s.AccessPoint.Enabled,
			InterfaceName: s.AccessPoint.InterfaceName,
		},
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

type WLEDEngine struct {
	client *http.Client
}

func NewWLEDEngine() *WLEDEngine {
	return &WLEDEngine{
		client: &http.Client{Timeout: 4 * time.Second},
	}
}

func (w *WLEDEngine) InspectDevice(ctx context.Context, device discoveredDevice) (WLEDDevice, error) {
	base := wledhttp.BaseHTTPURL(device.Host, device.Address, device.Port)
	var payload struct {
		Info struct {
			Name string `json:"name"`
			Mac  string `json:"mac"`
			Ver  string `json:"ver"`
		} `json:"info"`
		State map[string]any `json:"state"`
	}
	if err := w.requestJSON(ctx, http.MethodGet, base+"/json", nil, &payload); err != nil {
		return WLEDDevice{}, err
	}

	id := strings.TrimSpace(payload.Info.Mac)
	if id == "" {
		id = fmt.Sprintf("%s:%d", device.Address, device.Port)
	}
	name := strings.TrimSpace(payload.Info.Name)
	if name == "" {
		name = strings.TrimSuffix(device.Host, ".")
	}
	if name == "" {
		name = device.Address
	}

	info := map[string]any{
		"version": payload.Info.Ver,
	}
	for k, v := range payload.State {
		if k == "bri" || k == "on" {
			info[k] = v
		}
	}

	lastState := make(map[string]any, len(payload.State))
	for k, v := range payload.State {
		lastState[k] = v
	}

	return WLEDDevice{
		ID:          id,
		Name:        name,
		Host:        device.Host,
		Address:     device.Address,
		Port:        device.Port,
		LastSeen:    time.Now(),
		Online:      true,
		Provisioned: false,
		Info:        info,
		LastState:   lastState,
	}, nil
}

func (w *WLEDEngine) GetState(ctx context.Context, device WLEDDevice) (map[string]any, error) {
	var payload map[string]any
	if err := w.requestJSONWithDeviceFallback(ctx, device, http.MethodGet, "/json/state", nil, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func (w *WLEDEngine) ProvisionDevice(ctx context.Context, device WLEDDevice, cfgPatch map[string]any, initialState map[string]any) error {
	// Reachability check via cfg endpoint (documented at kno.wled.ge).
	var cfg map[string]any
	if err := w.requestJSONWithDeviceFallback(ctx, device, http.MethodGet, "/json/cfg", nil, &cfg); err != nil {
		return err
	}
	if len(cfgPatch) > 0 {
		if err := w.requestJSONWithDeviceFallback(ctx, device, http.MethodPost, "/json/cfg", cfgPatch, nil); err != nil {
			return err
		}
	}
	if len(initialState) > 0 {
		if err := w.requestJSONWithDeviceFallback(ctx, device, http.MethodPost, "/json/state", initialState, nil); err != nil {
			return err
		}
	}
	return nil
}

func (w *WLEDEngine) ApplyState(ctx context.Context, device WLEDDevice, state map[string]any) error {
	return w.requestJSONWithDeviceFallback(ctx, device, http.MethodPost, "/json/state", state, nil)
}

func (w *WLEDEngine) GetFullJSON(ctx context.Context, device WLEDDevice) (map[string]any, error) {
	var payload map[string]any
	if err := w.requestJSONWithDeviceFallback(ctx, device, http.MethodGet, "/json", nil, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func (w *WLEDEngine) GetConfig(ctx context.Context, device WLEDDevice) (map[string]any, error) {
	var payload map[string]any
	if err := w.requestJSONWithDeviceFallback(ctx, device, http.MethodGet, "/json/cfg", nil, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

// ApplyCfgPatch POSTs a partial cfg object (see WLED JSON API /json/cfg).
func (w *WLEDEngine) ApplyCfgPatch(ctx context.Context, device WLEDDevice, patch map[string]any) error {
	return w.requestJSONWithDeviceFallback(ctx, device, http.MethodPost, "/json/cfg", patch, nil)
}

func (w *WLEDEngine) ApplyStateToAll(ctx context.Context, devices []WLEDDevice, state map[string]any) map[string]string {
	results := make(map[string]string, len(devices))
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, device := range devices {
		device := device
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := w.ApplyState(ctx, device, state)
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

func (w *WLEDEngine) requestJSON(ctx context.Context, method, endpoint string, payload any, out any) error {
	var body *bytes.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(encoded)
	} else {
		body = bytes.NewReader(nil)
	}

	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := w.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected status %d for %s", resp.StatusCode, endpoint)
	}
	if out == nil {
		return nil
	}
	err = json.NewDecoder(resp.Body).Decode(out)
	if err != nil {
		return err
	}
	return nil
}

func (w *WLEDEngine) requestJSONWithDeviceFallback(ctx context.Context, device WLEDDevice, method, apiPath string, payload any, out any) error {
	primaryBase := wledhttp.BaseHTTPURL(device.Host, device.Address, device.Port)
	primaryEndpoint := primaryBase + apiPath
	primaryHost := wledhttp.HostForHTTP(device.Host, device.Address)
	fallbackHost := strings.TrimSpace(device.Address)

	// .local resolution can intermittently stall and consume most timeout budget.
	// Prefer direct IP first for hot paths and detail reads when an address is known.
	ipFirstAllowed := (method == http.MethodPost && apiPath == "/json/state") ||
		(method == http.MethodGet && (apiPath == "/json" || apiPath == "/json/cfg" || apiPath == "/json/state"))
	if ipFirstAllowed && fallbackHost != "" && !strings.EqualFold(primaryHost, fallbackHost) {
		fastEndpoint := "http://" + net.JoinHostPort(fallbackHost, fmt.Sprintf("%d", device.Port)) + apiPath
		if err := w.requestJSON(ctx, method, fastEndpoint, payload, out); err == nil {
			return nil
		}
		// If IP-first fails, continue with existing strategy below.
	}

	err := w.requestJSON(ctx, method, primaryEndpoint, payload, out)
	if err == nil {
		return nil
	}
	if fallbackHost == "" || strings.EqualFold(primaryHost, fallbackHost) {
		return err
	}
	if !shouldRetryWithAddressFallback(err) {
		return err
	}
	fallbackBase := "http://" + net.JoinHostPort(fallbackHost, fmt.Sprintf("%d", device.Port))
	fallbackEndpoint := fallbackBase + apiPath
	if fallbackErr := w.requestJSON(ctx, method, fallbackEndpoint, payload, out); fallbackErr != nil {
		return fallbackErr
	}
	return nil
}

func shouldRetryWithAddressFallback(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "deadline exceeded") || strings.Contains(msg, "timeout") {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr)
}

type WLEDController struct {
	logger                *log.Logger
	persistence           *StatePersistenceManager
	generalTabPersistence *GeneralTabStatePersistenceManager
	dmxPersistence        *DMXPersistenceManager
	network               *NetworkManager
	discovery             *DiscoveryEngine
	wled                  *WLEDEngine

	mu              sync.RWMutex
	settings        ControllerSettings
	devices         map[string]WLEDDevice
	generalTabState GeneralTabState
	dmxState        DMXState
	updated         time.Time

	probeMu     sync.Mutex
	probeRecent map[string]time.Time

	cancel context.CancelFunc

	dmxLiveMu         sync.Mutex
	dmxLivePort       serial.Port
	dmxLiveCancel     context.CancelFunc
	dmxLiveWG         sync.WaitGroup
	dmxLiveBuf        [512]byte
	dmxLiveErr        string
	dmxLivePath       string
	dmxLiveDeviceName string
	dmxLiveFixID      string
}

func NewWLEDController(logger *log.Logger) *WLEDController {
	if logger == nil {
		logger = log.Default()
	}
	return &WLEDController{
		logger:                logger,
		persistence:           NewStatePersistenceManager(),
		generalTabPersistence: NewGeneralTabStatePersistenceManager(),
		dmxPersistence:        NewDMXPersistenceManager(),
		network:               NewNetworkManager(logger),
		discovery:             NewDiscoveryEngine(logger),
		wled:                  NewWLEDEngine(),
		settings:              DefaultControllerSettings(),
		devices:               map[string]WLEDDevice{},
		generalTabState:       defaultGeneralTabState(),
		dmxState:              defaultDMXState(),
		updated:               time.Now(),
	}
}

func (c *WLEDController) syncSimulatedDeviceLocked() {
	if c.settings.Testing.SimulateWLED {
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
		return nil
	}
	err := c.wled.ApplyState(ctx, device, state)
	return err
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
	return c.wled.GetState(ctx, device)
}

func (c *WLEDController) getWLEDFullJSON(ctx context.Context, device WLEDDevice) (map[string]any, error) {
	c.mu.RLock()
	settings := c.settings
	latest, ok := c.devices[device.ID]
	c.mu.RUnlock()
	if isSimulatedWLED(device, settings) && ok {
		return buildSimulatedFullJSON(latest), nil
	}
	return c.wled.GetFullJSON(ctx, device)
}

func (c *WLEDController) getWLEDConfig(ctx context.Context, device WLEDDevice) (map[string]any, error) {
	c.mu.RLock()
	settings := c.settings
	c.mu.RUnlock()
	if isSimulatedWLED(device, settings) {
		return map[string]any{}, nil
	}
	return c.wled.GetConfig(ctx, device)
}

func (c *WLEDController) provisionWLED(ctx context.Context, device WLEDDevice, cfgPatch map[string]any, initialState map[string]any) error {
	c.mu.RLock()
	settings := c.settings
	c.mu.RUnlock()
	if isSimulatedWLED(device, settings) {
		return nil
	}
	return c.wled.ProvisionDevice(ctx, device, cfgPatch, initialState)
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
	if err != nil {
		c.logger.Printf("dmx state load failed, using defaults: %v", err)
		dmxState = defaultDMXState()
	}

	normDMX := normalizeDMXState(dmxState)
	oldUSB := strings.TrimSpace(normDMX.SelectedUSBDeviceID)
	normDMX.SelectedUSBDeviceID = dmx.CanonicalizePersistedDMXUSBSelectionID(oldUSB)

	c.mu.Lock()
	c.settings = mergeWithDefaults(loaded.Settings)
	c.devices = loaded.Devices
	c.generalTabState = clampGeneralTabState(generalTab)
	c.dmxState = normDMX
	c.syncSimulatedDeviceLocked()
	c.updated = time.Now()
	c.mu.Unlock()

	if normDMX.SelectedUSBDeviceID != oldUSB && normDMX.SelectedUSBDeviceID != "" {
		if err := c.persistDMX(); err != nil {
			c.logger.Printf("dmx: persist migrated usb selection: %v", err)
		}
	}

	runCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel

	go c.discoveryLoop(runCtx)
	go c.discoveryBrowseLoop(runCtx)
	go c.subnetProbeLoop(runCtx)
	go c.persistenceLoop(runCtx)
	go c.healthLoop(runCtx)
	go c.restoreLastStatesOnBoot(runCtx)

	return nil
}

func (c *WLEDController) Stop() {
	c.StopDMXLive()
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
	for _, device := range c.devices {
		if device.Ignored {
			continue
		}
		devices = append(devices, device)
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
	c.mu.Lock()
	c.settings = mergeWithDefaults(settings)
	c.syncSimulatedDeviceLocked()
	c.updated = time.Now()
	c.mu.Unlock()
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

func (c *WLEDController) DiscoverNow(ctx context.Context) ([]WLEDDevice, error) {
	c.mu.RLock()
	settings := c.settings.Discovery
	full := c.settings
	enabled := settings.Enabled
	c.mu.RUnlock()
	if !enabled {
		return nil, fmt.Errorf("discovery is disabled in settings")
	}

	iface := discovery.ResolveDiscoveryNetInterface(c.logger, toDiscoveryControllerSettings(full))
	found, err := discovery.DiscoverOnce(ctx, discovery.DiscoveryRunParams{
		Settings:  toDiscoverySettings(settings),
		BindIface: iface,
		Logger:    c.logger,
	})
	if err != nil {
		return nil, err
	}

	for _, candidate := range found {
		c.maybeProcessDiscovered(ctx, candidate, false)
	}
	return c.Snapshot().Devices, c.persist()
}

func (c *WLEDController) SetDeviceState(ctx context.Context, deviceID string, state map[string]any) error {
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
	settings := c.settings.Provisioning
	c.mu.RUnlock()
	if !ok {
		return fmt.Errorf("unknown device: %s", deviceID)
	}
	if device.Ignored {
		return fmt.Errorf("device is ignored: %s", deviceID)
	}

	if err := c.provisionWLED(ctx, device, settings.DefaultConfigPatch, settings.DefaultStatePayload); err != nil {
		return err
	}

	c.mu.Lock()
	device.Provisioned = true
	device.Online = true
	device.LastSeen = time.Now()
	device.LastState = mergeStateIntoLastState(device.LastState, settings.DefaultStatePayload)
	c.devices[deviceID] = device
	c.updated = time.Now()
	c.mu.Unlock()

	return c.persist()
}

func (c *WLEDController) RefreshDevice(ctx context.Context, deviceID string) error {
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
	c.mu.RUnlock()

	effectiveAddr := wledhttp.HostForHTTP(device.Host, addr)

	detail := WLEDDeviceDetail{
		Online:    online,
		Address:   effectiveAddr,
		Port:      port,
		LastState: lastCopy,
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
	c.mu.Lock()
	delete(c.devices, deviceID)
	c.syncSimulatedDeviceLocked()
	c.updated = time.Now()
	c.mu.Unlock()
	return c.persist()
}

func (c *WLEDController) IgnoredDevices() []WLEDDevice {
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

func (c *WLEDController) RenameDevice(ctx context.Context, deviceID, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("name cannot be empty")
	}
	c.mu.RLock()
	device, ok := c.devices[deviceID]
	settings := c.settings
	c.mu.RUnlock()
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
	if err := c.wled.ApplyCfgPatch(ctx, device, patch); err != nil {
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
	defer c.mu.RUnlock()
	return cloneDMXState(c.dmxState)
}

func (c *WLEDController) CreateDMXFixture(input UpsertDMXFixtureInput) (DMXFixture, error) {
	fixture, err := buildDMXFixtureForCreate(input)
	if err != nil {
		return DMXFixture{}, err
	}
	c.mu.Lock()
	c.dmxState.Fixtures = append(c.dmxState.Fixtures, fixture)
	c.dmxState = normalizeDMXState(c.dmxState)
	c.updated = time.Now()
	c.mu.Unlock()
	if err := c.persistDMX(); err != nil {
		return DMXFixture{}, err
	}
	return fixture, nil
}

func (c *WLEDController) UpdateDMXFixture(input UpsertDMXFixtureInput) (DMXFixture, error) {
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
	updated, err := buildDMXFixtureForUpdate(c.dmxState.Fixtures[idx], input)
	if err != nil {
		c.mu.Unlock()
		return DMXFixture{}, err
	}
	c.dmxState.Fixtures[idx] = updated
	c.dmxState = normalizeDMXState(c.dmxState)
	c.updated = time.Now()
	c.mu.Unlock()
	if err := c.persistDMX(); err != nil {
		return DMXFixture{}, err
	}
	return updated, nil
}

func (c *WLEDController) DeleteDMXFixture(id string) error {
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
	c.updated = time.Now()
	c.mu.Unlock()
	return c.persistDMX()
}

func (c *WLEDController) ListUSBSerialDevices() []USBSerialDevice {
	return serial2.ListUSBSerialDevices()
}

func (c *WLEDController) SetSelectedUSBSerialDevice(deviceID string) error {
	deviceID = strings.TrimSpace(deviceID)
	if deviceID != "" {
		dev, ok := dmx.PickUSBSerialDevice(deviceID, serial2.ListUSBSerialDevices())
		if !ok {
			return fmt.Errorf("selected usb serial device is not currently attached: %s", deviceID)
		}
		deviceID = dev.ID
	}
	c.mu.Lock()
	c.dmxState.SelectedUSBDeviceID = deviceID
	c.dmxState = normalizeDMXState(c.dmxState)
	c.updated = time.Now()
	c.mu.Unlock()
	return c.persistDMX()
}

const dmxLiveFrameHz = 44

func (c *WLEDController) resolveSelectedUSBPath() (string, error) {
	c.mu.RLock()
	deviceID := strings.TrimSpace(c.dmxState.SelectedUSBDeviceID)
	c.mu.RUnlock()
	if deviceID == "" {
		return "", fmt.Errorf("no USB DMX device selected; choose one in Settings")
	}
	dev, ok := dmx.PickUSBSerialDevice(deviceID, serial2.ListUSBSerialDevices())
	if !ok {
		return "", fmt.Errorf("selected USB serial device is not currently attached")
	}
	if strings.TrimSpace(dev.Path) == "" {
		return "", fmt.Errorf("selected USB device has no path")
	}
	return dev.Path, nil
}

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

// StartDMXLive opens the configured USB serial port and streams a DMX universe.
func (c *WLEDController) StartDMXLive(fixtureID string) error {
	path, err := c.resolveSelectedUSBPath()
	if err != nil {
		return err
	}
	rawPath := path
	path = serial2.SerialPortForDMXWrite(path)
	if path != rawPath {
		c.logger.Printf("dmx live: using %s for transmit (configured path was %s)", path, rawPath)
	}

	mode := &serial.Mode{BaudRate: 250000, DataBits: 8, Parity: serial.NoParity, StopBits: serial.TwoStopBits}

	c.dmxLiveMu.Lock()
	if c.dmxLivePort != nil {
		c.dmxLiveMu.Unlock()
		return fmt.Errorf("DMX live output is already running")
	}
	port, err := serial.Open(path, mode)
	if err != nil {
		c.dmxLiveErr = err.Error()
		c.dmxLiveDeviceName = ""
		c.dmxLiveMu.Unlock()
		return fmt.Errorf("open serial port: %w", err)
	}
	_ = port.SetReadTimeout(50 * time.Millisecond)

	for i := range c.dmxLiveBuf {
		c.dmxLiveBuf[i] = 0
	}
	c.dmxLiveErr = ""
	c.dmxLivePath = path
	c.dmxLiveDeviceName = c.dmxLiveUSBDisplayName(path)
	c.dmxLiveFixID = strings.TrimSpace(fixtureID)

	ctx, cancel := context.WithCancel(context.Background())
	c.dmxLiveCancel = cancel
	c.dmxLivePort = port

	c.dmxLiveWG.Add(1)
	go c.dmxLiveSendLoop(ctx, port)
	c.dmxLiveMu.Unlock()

	c.logger.Printf("dmx live: started on %s", path)
	return nil
}

func (c *WLEDController) dmxLiveSendLoop(ctx context.Context, port serial.Port) {
	defer c.dmxLiveWG.Done()
	frameInterval := time.Second / dmxLiveFrameHz
	ticker := time.NewTicker(frameInterval)
	defer ticker.Stop()

	frame := make([]byte, 513)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.dmxLiveMu.Lock()
			copy(frame[1:], c.dmxLiveBuf[:])
			c.dmxLiveMu.Unlock()

			frame[0] = 0
			if _, err := port.Write(frame); err != nil {
				c.logger.Printf("dmx live: write: %v", err)
				c.dmxLiveMu.Lock()
				c.dmxLiveErr = err.Error()
				c.dmxLiveMu.Unlock()
			}
		}
	}
}

// StopDMXLive stops streaming and closes the serial port.
func (c *WLEDController) StopDMXLive() {
	c.dmxLiveMu.Lock()
	cancel := c.dmxLiveCancel
	port := c.dmxLivePort
	c.dmxLiveCancel = nil
	c.dmxLivePort = nil
	c.dmxLivePath = ""
	c.dmxLiveDeviceName = ""
	c.dmxLiveFixID = ""
	c.dmxLiveMu.Unlock()

	if cancel != nil {
		cancel()
	}
	c.dmxLiveWG.Wait()

	if port != nil {
		_ = port.Close()
		c.logger.Printf("dmx live: stopped")
	}
}

// ApplyDMXLivePatch merges channel updates into the live universe buffer.
func (c *WLEDController) ApplyDMXLivePatch(updates []dmx.DMXOutputUpdate) error {
	c.dmxLiveMu.Lock()
	defer c.dmxLiveMu.Unlock()
	if c.dmxLivePort == nil {
		return fmt.Errorf("DMX live output is not running")
	}
	for _, u := range updates {
		addr := u.Address
		if addr < 1 || addr > 512 {
			continue
		}
		v := u.Value
		if v < 0 {
			v = 0
		}
		if v > 255 {
			v = 255
		}
		c.dmxLiveBuf[addr-1] = byte(v)
	}
	return nil
}

// GetDMXLiveStatus returns connection metadata for the UI.
func (c *WLEDController) GetDMXLiveStatus() dmx.DMXLiveStatus {
	c.dmxLiveMu.Lock()
	defer c.dmxLiveMu.Unlock()
	return dmx.DMXLiveStatus{
		Connected:  c.dmxLivePort != nil,
		Error:      c.dmxLiveErr,
		DevicePath: c.dmxLivePath,
		DeviceName: c.dmxLiveDeviceName,
		FixtureID:  c.dmxLiveFixID,
	}
}

func (c *WLEDController) consumeInspectThrottle(candidate discoveredDevice) bool {
	const ttl = 8 * time.Second
	key := discovery.ProbeDedupeKey(candidate.Host, candidate.Address, candidate.Port)
	c.probeMu.Lock()
	defer c.probeMu.Unlock()
	if c.probeRecent == nil {
		c.probeRecent = make(map[string]time.Time)
	}
	now := time.Now()
	if t, ok := c.probeRecent[key]; ok && now.Sub(t) < ttl {
		return false
	}
	c.probeRecent[key] = now
	if len(c.probeRecent) > 384 {
		for k, t := range c.probeRecent {
			if now.Sub(t) > ttl*6 {
				delete(c.probeRecent, k)
			}
		}
	}
	return true
}

func (c *WLEDController) maybeProcessDiscovered(ctx context.Context, candidate discoveredDevice, respectThrottle bool) {
	if respectThrottle && !c.consumeInspectThrottle(candidate) {
		return
	}
	c.processDiscoveredCandidate(ctx, candidate)
}

func (c *WLEDController) effectiveDiscoveryInterval() time.Duration {
	c.mu.RLock()
	defer c.mu.RUnlock()
	base := c.settings.Discovery.IntervalSeconds
	if base <= 0 {
		base = 15
	}
	d := time.Duration(base) * time.Second
	if !c.settings.AccessPoint.Enabled {
		return d
	}
	fast := c.settings.Discovery.PollIntervalSecondsWhenApEnabled
	if fast <= 0 {
		return d
	}
	fastDur := time.Duration(fast) * time.Second
	if fastDur < d {
		return fastDur
	}
	return d
}

func (c *WLEDController) discoveryBrowseLoop(ctx context.Context) {
	var workers sync.WaitGroup
	var activeCancel context.CancelFunc
	lastSig := ""

	stopWorkers := func() {
		if activeCancel != nil {
			activeCancel()
			workers.Wait()
			activeCancel = nil
		}
	}

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	defer stopWorkers()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.mu.RLock()
			settings := c.settings
			c.mu.RUnlock()

			sig := discovery.DiscoveryBrowseSignature(toDiscoveryControllerSettings(settings))
			if sig == "" {
				stopWorkers()
				lastSig = ""
				continue
			}
			if sig == lastSig && activeCancel != nil {
				continue
			}

			stopWorkers()
			browseCtx, cancel := context.WithCancel(ctx)
			activeCancel = cancel
			lastSig = sig

			iface := discovery.ResolveDiscoveryNetInterface(c.logger, toDiscoveryControllerSettings(settings))
			for _, svc := range discovery.ServiceTypesOrDefault(settings.Discovery.ServiceTypes) {
				svc := svc
				workers.Add(1)
				go func() {
					defer workers.Done()
					c.zeroconfBrowseService(browseCtx, iface, svc)
				}()
			}
		}
	}
}

func (c *WLEDController) zeroconfBrowseService(ctx context.Context, iface *net.Interface, svc string) {
	opts := discovery.ZeroconfClientOptions(iface)
	resolver, err := zeroconf.NewResolver(opts...)
	if err != nil {
		c.logger.Printf("zeroconf resolver %s: %v", svc, err)
		return
	}
	entries := make(chan *zeroconf.ServiceEntry, 64)
	if err := resolver.Browse(ctx, svc, "local.", entries); err != nil {
		c.logger.Printf("zeroconf browse %s: %v", svc, err)
		return
	}
	for {
		select {
		case <-ctx.Done():
			return
		case ent, ok := <-entries:
			if !ok {
				return
			}
			if ent == nil {
				continue
			}
			candidate := discovery.DiscoveredFromZeroconf(ent)
			if !discovery.IsWLEDCandidate(svc, candidate) {
				continue
			}
			c.maybeProcessDiscovered(ctx, candidate, true)
		}
	}
}

func (c *WLEDController) subnetProbeLoop(ctx context.Context) {
	ticker := time.NewTicker(120 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			probeCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
			c.subnetProbeOnce(probeCtx)
			cancel()
		}
	}
}

func (c *WLEDController) subnetProbeOnce(ctx context.Context) {
	c.mu.RLock()
	settings := c.settings
	c.mu.RUnlock()
	disc := settings.Discovery
	if !disc.Enabled || !disc.SubnetProbe || !settings.AccessPoint.Enabled {
		return
	}
	iface := discovery.ResolveDiscoveryNetInterface(c.logger, toDiscoveryControllerSettings(settings))
	if iface == nil {
		return
	}
	targets := discovery.IPv4ProbeTargets(iface)
	if len(targets) == 0 {
		return
	}

	sem := make(chan struct{}, 40)
	var wg sync.WaitGroup
	for _, ip := range targets {
		ip := ip
		wg.Add(1)
		go func() {
			defer wg.Done()
			select {
			case <-ctx.Done():
				return
			case sem <- struct{}{}:
			}
			defer func() { <-sem }()
			c.maybeProcessDiscovered(ctx, discoveredDevice{
				Name:    ip,
				Host:    "",
				Address: ip,
				Port:    80,
			}, true)
		}()
	}
	wg.Wait()
}

func (c *WLEDController) discoveryLoop(ctx context.Context) {
	delay := time.Duration(0)
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
			c.discoverAndProvision(ctx)
			delay = c.effectiveDiscoveryInterval()
		}
	}
}

func (c *WLEDController) discoverAndProvision(ctx context.Context) {
	c.mu.RLock()
	discoverySettings := c.settings.Discovery
	fullSettings := c.settings
	c.mu.RUnlock()
	if !discoverySettings.Enabled {
		return
	}

	iface := discovery.ResolveDiscoveryNetInterface(c.logger, toDiscoveryControllerSettings(fullSettings))
	devices, err := discovery.DiscoverOnce(ctx, discovery.DiscoveryRunParams{
		Settings:  toDiscoverySettings(discoverySettings),
		BindIface: iface,
		Logger:    c.logger,
	})
	if err != nil {
		c.logger.Printf("discovery failed: %v", err)
		return
	}
	for _, candidate := range devices {
		c.maybeProcessDiscovered(ctx, candidate, true)
	}
	if err := c.persist(); err != nil {
		c.logger.Printf("persist after discovery failed: %v", err)
	}
}

func (c *WLEDController) processDiscoveredCandidate(ctx context.Context, candidate discoveredDevice) {
	device, err := c.wled.InspectDevice(ctx, candidate)
	if err != nil {
		c.logger.Printf("inspect device %s failed: %v", candidate.Address, err)
		return
	}

	c.mu.RLock()
	if existing, ok := c.devices[device.ID]; ok && existing.Ignored {
		c.mu.RUnlock()
		return
	}
	c.mu.RUnlock()

	c.mu.Lock()
	existing, hasExisting := c.devices[device.ID]
	restoreState := cloneJSONMap(nil)
	if hasExisting {
		if existing.Provisioned {
			device.Provisioned = true
		}
		if len(existing.LastState) > 0 {
			device.LastState = cloneJSONMap(existing.LastState)
			restoreState = cloneJSONMap(existing.LastState)
		}
	}
	c.devices[device.ID] = device
	settings := c.settings.Provisioning
	c.updated = time.Now()
	c.mu.Unlock()

	if len(restoreState) > 0 {
		if err := c.applyWLEDState(ctx, device, restoreState); err != nil {
			c.logger.Printf("restore last state to %s failed: %v", device.ID, err)
		} else {
			c.mu.Lock()
			if latest, ok := c.devices[device.ID]; ok {
				latest.Online = true
				latest.LastSeen = time.Now()
				if latest.Info == nil {
					latest.Info = map[string]any{}
				}
				if v, ok := restoreState["on"]; ok {
					latest.Info["on"] = v
				}
				if v, ok := restoreState["bri"]; ok {
					latest.Info["bri"] = v
				}
				c.devices[device.ID] = latest
				c.updated = time.Now()
			}
			c.mu.Unlock()
			if err := c.persist(); err != nil {
				c.logger.Printf("persist after reconnect restore failed: %v", err)
			}
		}
	}

	if settings.AutoProvision && !device.Provisioned {
		if err := c.provisionWLED(ctx, device, settings.DefaultConfigPatch, settings.DefaultStatePayload); err == nil {
			c.mu.Lock()
			device.Provisioned = true
			c.devices[device.ID] = device
			c.updated = time.Now()
			c.mu.Unlock()
		}
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

func (c *WLEDController) restoreLastStatesOnBoot(ctx context.Context) {
	select {
	case <-time.After(2 * time.Second):
	case <-ctx.Done():
		return
	}

	c.mu.RLock()
	list := make([]WLEDDevice, 0, len(c.devices))
	for _, d := range c.devices {
		if d.Ignored || len(d.LastState) == 0 {
			continue
		}
		list = append(list, d)
	}
	c.mu.RUnlock()

	restoreCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	for _, device := range list {
		state := cloneJSONMap(device.LastState)
		if len(state) == 0 {
			continue
		}
		if err := c.applyWLEDState(restoreCtx, device, state); err != nil {
			c.logger.Printf("boot restore for %s failed: %v", device.ID, err)
			continue
		}
		c.mu.Lock()
		latest := c.devices[device.ID]
		latest.Online = true
		latest.LastSeen = time.Now()
		if latest.Info == nil {
			latest.Info = map[string]any{}
		}
		if v, ok := state["on"]; ok {
			latest.Info["on"] = v
		}
		if v, ok := state["bri"]; ok {
			latest.Info["bri"] = v
		}
		c.devices[device.ID] = latest
		c.updated = time.Now()
		c.mu.Unlock()
	}
	if err := c.persist(); err != nil {
		c.logger.Printf("persist after boot restore failed: %v", err)
	}
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
	c.mu.RLock()
	state := cloneDMXState(c.dmxState)
	c.mu.RUnlock()
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
		Fixtures:            make([]DMXFixture, 0, len(in.Fixtures)),
		SelectedUSBDeviceID: strings.TrimSpace(in.SelectedUSBDeviceID),
	}
	for _, fixture := range in.Fixtures {
		cp := fixture
		cp.Brand = strings.TrimSpace(cp.Brand)
		cp.Name = strings.TrimSpace(cp.Name)
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
		Discovery: DiscoverySettings{
			Enabled:                          true,
			ServiceTypes:                     []string{"_wled._tcp", "_http._tcp"},
			IntervalSeconds:                  15,
			QueryTimeoutMS:                   2000,
			BindInterface:                    "",
			PassiveBrowse:                    true,
			SubnetProbe:                      false,
			PollIntervalSecondsWhenApEnabled: 5,
		},
		Provisioning: ProvisioningSettings{
			AutoProvision:       false,
			DefaultStatePayload: map[string]any{"on": true, "bri": 180},
			DefaultConfigPatch:  map[string]any{},
		},
	}
}

func mergeWithDefaults(in ControllerSettings) ControllerSettings {
	defaults := DefaultControllerSettings()
	out := in

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
	if len(out.Discovery.ServiceTypes) == 0 {
		out.Discovery.ServiceTypes = defaults.Discovery.ServiceTypes
	}
	if out.Discovery.IntervalSeconds <= 0 {
		out.Discovery.IntervalSeconds = defaults.Discovery.IntervalSeconds
	}
	if out.Discovery.QueryTimeoutMS <= 0 {
		out.Discovery.QueryTimeoutMS = defaults.Discovery.QueryTimeoutMS
	}
	if out.Discovery.PollIntervalSecondsWhenApEnabled < 0 {
		out.Discovery.PollIntervalSecondsWhenApEnabled = defaults.Discovery.PollIntervalSecondsWhenApEnabled
	}
	if out.Provisioning.DefaultStatePayload == nil {
		out.Provisioning.DefaultStatePayload = defaults.Provisioning.DefaultStatePayload
	}
	if out.Provisioning.DefaultConfigPatch == nil {
		out.Provisioning.DefaultConfigPatch = defaults.Provisioning.DefaultConfigPatch
	}
	return out
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
		Fixtures:            []DMXFixture{},
		SelectedUSBDeviceID: "",
	}
}

func normalizeDMXState(st DMXState) DMXState {
	normalized := cloneDMXState(st)
	for i := range normalized.Fixtures {
		normalized.Fixtures[i].Type = normalizeFixtureType(normalized.Fixtures[i].Type)
		addr := normalized.Fixtures[i].DMXAddress
		if addr < 1 || addr > 512 {
			addr = 1
		}
		normalized.Fixtures[i].DMXAddress = addr
		normalized.Fixtures[i].Channels = sanitizeDMXChannels(normalized.Fixtures[i].DMXAddress, normalized.Fixtures[i].Channels)
	}
	return normalized
}

func normalizeFixtureType(t DMXFixtureType) DMXFixtureType {
	switch t {
	case DMXFixtureTypeMovingHead:
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
			Channel:    n,
			Type:       normalizeDMXChannelType(ch.Type),
			Properties: sanitizeDMXChannelProperties(ch.Properties),
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

func buildDMXFixtureForCreate(input UpsertDMXFixtureInput) (DMXFixture, error) {
	base := DMXFixture{
		ID:        fmt.Sprintf("fixture-%d", time.Now().UnixNano()),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	return buildDMXFixtureForUpdate(base, input)
}

func buildDMXFixtureForUpdate(existing DMXFixture, input UpsertDMXFixtureInput) (DMXFixture, error) {
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
	fixture.DMXAddress = addr
	fixture.MovingHead = MovingHeadConfig{
		MaxPan:  input.MaxPan,
		MaxTilt: input.MaxTilt,
	}
	fixture.Channels = channels
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
			Channel:    ch.Channel,
			Type:       normalizeDMXChannelType(ch.Type),
			Properties: sanitizeDMXChannelProperties(ch.Properties),
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
