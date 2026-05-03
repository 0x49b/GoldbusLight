package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/hashicorp/mdns"
)

const (
	defaultStateFileName = "state.json"
)

type AccessPointSettings struct {
	Enabled       bool   `json:"enabled"`
	Connection    string `json:"connection"`
	InterfaceName string `json:"interfaceName"`
	SSID          string `json:"ssid"`
	Password      string `json:"password"`
	Channel       int    `json:"channel"`
}

type UpstreamSettings struct {
	AutoConnect   bool   `json:"autoConnect"`
	InterfaceName string `json:"interfaceName"`
	SSID          string `json:"ssid"`
	Password      string `json:"password"`
}

type BridgeSettings struct {
	Enabled           bool   `json:"enabled"`
	APInterface       string `json:"apInterface"`
	UpstreamInterface string `json:"upstreamInterface"`
}

type DiscoverySettings struct {
	Enabled         bool     `json:"enabled"`
	ServiceTypes    []string `json:"serviceTypes"`
	IntervalSeconds int      `json:"intervalSeconds"`
	QueryTimeoutMS  int      `json:"queryTimeoutMs"`
}

type ProvisioningSettings struct {
	AutoProvision       bool           `json:"autoProvision"`
	DefaultStatePayload map[string]any `json:"defaultStatePayload"`
	DefaultConfigPatch  map[string]any `json:"defaultConfigPatch"`
}

type ControllerSettings struct {
	AccessPoint  AccessPointSettings  `json:"accessPoint"`
	Upstream     UpstreamSettings     `json:"upstream"`
	Bridge       BridgeSettings       `json:"bridge"`
	Discovery    DiscoverySettings    `json:"discovery"`
	Provisioning ProvisioningSettings `json:"provisioning"`
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

type persistentState struct {
	Version  int                   `json:"version"`
	SavedAt  time.Time             `json:"savedAt"`
	Settings ControllerSettings    `json:"settings"`
	Devices  map[string]WLEDDevice `json:"devices"`
}

type ControllerSnapshot struct {
	Settings        ControllerSettings     `json:"settings"`
	Devices         []WLEDDevice           `json:"devices"`
	PersistencePath string                 `json:"persistencePath"`
	UpdatedAt       time.Time              `json:"updatedAt"`
	Capabilities    ControllerCapabilities `json:"capabilities"`
}

type ControllerCapabilities struct {
	// NetworkBackendID identifies which integration is active (e.g. "nmcli", "darwin", "netsh", "stub").
	NetworkBackendID string `json:"networkBackendId"`
	// NetworkBackendLabel is a human-readable description for the UI.
	NetworkBackendLabel string `json:"networkBackendLabel"`
	// NetworkControlAvailable is true when this OS exposes working CLI tools for scan/connect (partial features may still be unavailable).
	NetworkControlAvailable bool `json:"networkControlAvailable"`
	// NetworkCliName is the primary host CLI for Wi-Fi on this platform (e.g. nmcli, netsh, networksetup).
	NetworkCliName string `json:"networkCliName"`
	// NetworkCliUnavailableReason is non-empty when NetworkControlAvailable is false; explains which binary or requirement is missing.
	NetworkCliUnavailableReason string `json:"networkCliUnavailableReason,omitempty"`
	// NmcliAvailable is true only when Linux nmcli (NetworkManager) is present and used.
	NmcliAvailable bool `json:"nmcliAvailable"`
}

type WiFiNetwork struct {
	SSID     string `json:"ssid"`
	Signal   int    `json:"signal"`
	Security string `json:"security"`
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

type discoveredDevice struct {
	Name    string
	Host    string
	Address string
	Port    int
}

type StatePersistenceManager struct {
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

func (s *StatePersistenceManager) Path() string {
	return s.path
}

func (s *StatePersistenceManager) Load() (persistentState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	defaultState := persistentState{
		Version:  1,
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

	state.SavedAt = time.Now()
	payload, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, payload, 0o600)
}

type NetworkManager struct {
	logger  *log.Logger
	backend networkBackend
}

func NewNetworkManager(logger *log.Logger) *NetworkManager {
	return &NetworkManager{
		logger:  logger,
		backend: selectNetworkBackend(logger),
	}
}

func (n *NetworkManager) controllerCapabilities() ControllerCapabilities {
	b := n.backend
	nmcli := b.id() == "nmcli" && b.available()
	reason := ""
	if !b.available() {
		reason = b.unavailableHint()
	}
	return ControllerCapabilities{
		NetworkBackendID:            b.id(),
		NetworkBackendLabel:         b.label(),
		NetworkControlAvailable:     b.available(),
		NetworkCliName:              b.primaryCLI(),
		NetworkCliUnavailableReason: reason,
		NmcliAvailable:              nmcli,
	}
}

func (n *NetworkManager) Apply(ctx context.Context, settings ControllerSettings) NetworkApplyResult {
	return n.backend.apply(ctx, settings)
}

func (n *NetworkManager) ScanUpstreamNetworks(ctx context.Context, iface string) ([]WiFiNetwork, error) {
	return n.backend.scanWiFi(ctx, iface)
}

type DiscoveryEngine struct {
	logger *log.Logger
}

func NewDiscoveryEngine(logger *log.Logger) *DiscoveryEngine {
	return &DiscoveryEngine{logger: logger}
}

func (d *DiscoveryEngine) DiscoverOnce(ctx context.Context, settings DiscoverySettings) ([]discoveredDevice, error) {
	serviceTypes := settings.ServiceTypes
	if len(serviceTypes) == 0 {
		serviceTypes = []string{"_wled._tcp", "_http._tcp"}
	}

	timeout := time.Duration(settings.QueryTimeoutMS) * time.Millisecond
	if timeout <= 0 {
		timeout = 2 * time.Second
	}

	known := map[string]discoveredDevice{}
	for _, serviceType := range serviceTypes {
		serviceType := serviceType
		entries := make(chan *mdns.ServiceEntry, 64)
		var wg sync.WaitGroup
		var mu sync.Mutex

		wg.Add(1)
		go func() {
			defer wg.Done()
			for entry := range entries {
				candidate := toDiscoveredDevice(entry)
				if !isWLEDCandidate(serviceType, candidate) {
					continue
				}
				key := fmt.Sprintf("%s:%d", candidate.Address, candidate.Port)
				mu.Lock()
				known[key] = candidate
				mu.Unlock()
			}
		}()

		queryCtx, cancel := context.WithTimeout(ctx, timeout+500*time.Millisecond)
		err := mdns.QueryContext(queryCtx, &mdns.QueryParam{
			Service: serviceType,
			Domain:  "local",
			Timeout: timeout,
			Entries: entries,
		})
		cancel()
		close(entries)
		wg.Wait()
		if err != nil {
			d.logger.Printf("mdns query failed for %s: %v", serviceType, err)
		}
	}

	found := make([]discoveredDevice, 0, len(known))
	for _, device := range known {
		found = append(found, device)
	}
	slices.SortFunc(found, func(a, b discoveredDevice) int {
		return strings.Compare(a.Address, b.Address)
	})
	return found, nil
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
	base := fmt.Sprintf("http://%s:%d", device.Address, device.Port)
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
	base := fmt.Sprintf("http://%s:%d", device.Address, device.Port)
	var payload map[string]any
	if err := w.requestJSON(ctx, http.MethodGet, base+"/json/state", nil, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func (w *WLEDEngine) ProvisionDevice(ctx context.Context, device WLEDDevice, cfgPatch map[string]any, initialState map[string]any) error {
	base := fmt.Sprintf("http://%s:%d", device.Address, device.Port)
	// Reachability check via cfg endpoint (documented at kno.wled.ge).
	var cfg map[string]any
	if err := w.requestJSON(ctx, http.MethodGet, base+"/json/cfg", nil, &cfg); err != nil {
		return err
	}
	if len(cfgPatch) > 0 {
		if err := w.requestJSON(ctx, http.MethodPost, base+"/json/cfg", cfgPatch, nil); err != nil {
			return err
		}
	}
	if len(initialState) > 0 {
		if err := w.requestJSON(ctx, http.MethodPost, base+"/json/state", initialState, nil); err != nil {
			return err
		}
	}
	return nil
}

func (w *WLEDEngine) ApplyState(ctx context.Context, device WLEDDevice, state map[string]any) error {
	base := fmt.Sprintf("http://%s:%d", device.Address, device.Port)
	return w.requestJSON(ctx, http.MethodPost, base+"/json/state", state, nil)
}

func (w *WLEDEngine) GetFullJSON(ctx context.Context, device WLEDDevice) (map[string]any, error) {
	base := fmt.Sprintf("http://%s:%d", device.Address, device.Port)
	var payload map[string]any
	if err := w.requestJSON(ctx, http.MethodGet, base+"/json", nil, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func (w *WLEDEngine) GetConfig(ctx context.Context, device WLEDDevice) (map[string]any, error) {
	base := fmt.Sprintf("http://%s:%d", device.Address, device.Port)
	var payload map[string]any
	if err := w.requestJSON(ctx, http.MethodGet, base+"/json/cfg", nil, &payload); err != nil {
		return nil, err
	}
	return payload, nil
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
	return json.NewDecoder(resp.Body).Decode(out)
}

type WLEDController struct {
	logger      *log.Logger
	persistence *StatePersistenceManager
	network     *NetworkManager
	discovery   *DiscoveryEngine
	wled        *WLEDEngine

	mu       sync.RWMutex
	settings ControllerSettings
	devices  map[string]WLEDDevice
	updated  time.Time

	cancel context.CancelFunc
}

func NewWLEDController(logger *log.Logger) *WLEDController {
	if logger == nil {
		logger = log.Default()
	}
	return &WLEDController{
		logger:      logger,
		persistence: NewStatePersistenceManager(),
		network:     NewNetworkManager(logger),
		discovery:   NewDiscoveryEngine(logger),
		wled:        NewWLEDEngine(),
		settings:    DefaultControllerSettings(),
		devices:     map[string]WLEDDevice{},
		updated:     time.Now(),
	}
}

func (c *WLEDController) Start(ctx context.Context) error {
	loaded, err := c.persistence.Load()
	if err != nil {
		c.logger.Printf("state load failed, using defaults: %v", err)
		loaded = persistentState{
			Version:  1,
			SavedAt:  time.Now(),
			Settings: DefaultControllerSettings(),
			Devices:  map[string]WLEDDevice{},
		}
	}

	c.mu.Lock()
	c.settings = mergeWithDefaults(loaded.Settings)
	c.devices = loaded.Devices
	c.updated = time.Now()
	c.mu.Unlock()

	runCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel

	go c.discoveryLoop(runCtx)
	go c.persistenceLoop(runCtx)
	go c.healthLoop(runCtx)
	go c.restoreLastStatesOnBoot(runCtx)

	return nil
}

func (c *WLEDController) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
	if err := c.persist(); err != nil {
		c.logger.Printf("persist during shutdown failed: %v", err)
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
		PersistencePath: c.persistence.Path(),
		UpdatedAt:       c.updated,
		Capabilities: c.network.controllerCapabilities(),
	}
}

func (c *WLEDController) SaveSettings(settings ControllerSettings) error {
	c.mu.Lock()
	c.settings = mergeWithDefaults(settings)
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

func (c *WLEDController) ScanUpstreamNetworks(ctx context.Context) ([]WiFiNetwork, error) {
	c.mu.RLock()
	iface := c.settings.Upstream.InterfaceName
	c.mu.RUnlock()
	return c.network.ScanUpstreamNetworks(ctx, iface)
}

func (c *WLEDController) DiscoverNow(ctx context.Context) ([]WLEDDevice, error) {
	c.mu.RLock()
	settings := c.settings.Discovery
	c.mu.RUnlock()

	found, err := c.discovery.DiscoverOnce(ctx, settings)
	if err != nil {
		return nil, err
	}

	for _, candidate := range found {
		c.processDiscoveredCandidate(ctx, candidate)
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

	if err := c.wled.ApplyState(ctx, device, state); err != nil {
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

	results := c.wled.ApplyStateToAll(ctx, devices, state)

	c.mu.Lock()
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

	if err := c.wled.ProvisionDevice(ctx, device, settings.DefaultConfigPatch, settings.DefaultStatePayload); err != nil {
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

	state, err := c.wled.GetState(ctx, device)
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

	detail := WLEDDeviceDetail{
		Online:    online,
		Address:   addr,
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

	full, err := c.wled.GetFullJSON(ctx, device)
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
	if cfg, err := c.wled.GetConfig(ctx, device); err != nil {
		c.logger.Printf("cfg fetch for %s: %v", deviceID, err)
	} else {
		detail.Config = cfg
	}
	return detail
}

func (c *WLEDController) RemoveDevice(deviceID string) error {
	c.mu.Lock()
	delete(c.devices, deviceID)
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

func (c *WLEDController) discoveryLoop(ctx context.Context) {
	c.discoverAndProvision(ctx)
	ticker := time.NewTicker(c.discoveryInterval())
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.discoverAndProvision(ctx)
		}
	}
}

func (c *WLEDController) discoverAndProvision(ctx context.Context) {
	c.mu.RLock()
	discoverySettings := c.settings.Discovery
	c.mu.RUnlock()
	if !discoverySettings.Enabled {
		return
	}

	devices, err := c.discovery.DiscoverOnce(ctx, discoverySettings)
	if err != nil {
		c.logger.Printf("discovery failed: %v", err)
		return
	}
	for _, candidate := range devices {
		c.processDiscoveredCandidate(ctx, candidate)
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
		if err := c.wled.ApplyState(ctx, device, restoreState); err != nil {
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
		if err := c.wled.ProvisionDevice(ctx, device, settings.DefaultConfigPatch, settings.DefaultStatePayload); err == nil {
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
		if err := c.wled.ApplyState(restoreCtx, device, state); err != nil {
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
		state, err := c.wled.GetState(ctx, device)
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

func (c *WLEDController) discoveryInterval() time.Duration {
	c.mu.RLock()
	defer c.mu.RUnlock()
	seconds := c.settings.Discovery.IntervalSeconds
	if seconds <= 0 {
		seconds = 15
	}
	return time.Duration(seconds) * time.Second
}

func (c *WLEDController) touch() {
	c.mu.Lock()
	c.updated = time.Now()
	c.mu.Unlock()
}

func (c *WLEDController) persist() error {
	c.mu.RLock()
	state := persistentState{
		Version:  1,
		SavedAt:  time.Now(),
		Settings: c.settings,
		Devices:  cloneDeviceMap(c.devices),
	}
	c.mu.RUnlock()
	return c.persistence.Save(state)
}

func cloneDeviceMap(in map[string]WLEDDevice) map[string]WLEDDevice {
	out := make(map[string]WLEDDevice, len(in))
	for key, value := range in {
		out[key] = value
	}
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
		Upstream: UpstreamSettings{
			AutoConnect:   false,
			InterfaceName: "wlan1",
		},
		Bridge: BridgeSettings{
			Enabled:           true,
			APInterface:       "wlan0",
			UpstreamInterface: "wlan1",
		},
		Discovery: DiscoverySettings{
			Enabled:         true,
			ServiceTypes:    []string{"_wled._tcp", "_http._tcp"},
			IntervalSeconds: 15,
			QueryTimeoutMS:  2000,
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
	if out.Upstream.InterfaceName == "" {
		out.Upstream.InterfaceName = defaults.Upstream.InterfaceName
	}
	if out.Bridge.APInterface == "" {
		out.Bridge.APInterface = defaults.Bridge.APInterface
	}
	if out.Bridge.UpstreamInterface == "" {
		out.Bridge.UpstreamInterface = defaults.Bridge.UpstreamInterface
	}
	if len(out.Discovery.ServiceTypes) == 0 {
		out.Discovery.ServiceTypes = defaults.Discovery.ServiceTypes
	}
	if out.Discovery.IntervalSeconds <= 0 {
		out.Discovery.IntervalSeconds = defaults.Discovery.IntervalSeconds
	}
	if out.Discovery.QueryTimeoutMS <= 0 {
		out.Discovery.QueryTimeoutMS = defaults.Discovery.QueryTimeoutMS
	}
	if out.Provisioning.DefaultStatePayload == nil {
		out.Provisioning.DefaultStatePayload = defaults.Provisioning.DefaultStatePayload
	}
	if out.Provisioning.DefaultConfigPatch == nil {
		out.Provisioning.DefaultConfigPatch = defaults.Provisioning.DefaultConfigPatch
	}
	return out
}

func toDiscoveredDevice(entry *mdns.ServiceEntry) discoveredDevice {
	host := strings.TrimSuffix(entry.Host, ".")
	address := host
	if entry.AddrV4 != nil {
		address = entry.AddrV4.String()
	}
	name := strings.TrimSuffix(entry.Name, ".")
	if name == "" {
		name = host
	}
	port := entry.Port
	if port == 0 {
		port = 80
	}
	return discoveredDevice{
		Name:    name,
		Host:    host,
		Address: address,
		Port:    port,
	}
}

func isWLEDCandidate(serviceType string, device discoveredDevice) bool {
	if serviceType == "_wled._tcp" {
		return true
	}
	haystack := strings.ToLower(device.Name + " " + device.Host + " " + device.Address)
	return strings.Contains(haystack, "wled")
}

func parseSignal(raw string) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	var value int
	if _, err := fmt.Sscanf(raw, "%d", &value); err != nil {
		return 0
	}
	return value
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
