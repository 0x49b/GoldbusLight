package service

import (
	"context"
	"errors"
	"fmt"
	"goldbus"
	"goldbus/internal/console"
	ctrlpkg "goldbus/internal/controller"
	"goldbus/internal/dmx"
	"goldbus/internal/license"
	"os"
	"strings"
	"time"
)

// Service timeout constants for operations
const (
	TimeoutNetworkApply = 20 * time.Second
	TimeoutDiscovery    = 10 * time.Second
	TimeoutDeviceOp     = 5 * time.Second
	TimeoutDeviceDetail = 8 * time.Second
	TimeoutProvision    = 8 * time.Second
)

type GoldbusLightService struct {
	controller                 *ctrlpkg.WLEDController
	openDetachedConsoleWindow  func() error
	closeDetachedConsoleWindow func() error
	isConsoleWindowDetached    func() bool
	backupCallbacks            ConfigurationBackupCallbacks
}

type ConsoleWindowCallbacks struct {
	Open       func() error
	Close      func() error
	IsDetached func() bool
}

// ConfigurationBackupCallbacks prompts for backup file paths in the GUI layer.
type ConfigurationBackupCallbacks struct {
	PromptSavePath func(suggestedFilename string) (path string, err error)
	PromptOpenPath func() (path string, err error)
	// PromptSaveFixturePath asks for a destination when exporting a single DMX
	// fixture config. Optional; falls back to PromptSavePath when nil.
	PromptSaveFixturePath func(suggestedFilename string) (path string, err error)
}

func NewGreetService(controller *ctrlpkg.WLEDController, callbacks ConsoleWindowCallbacks, backup ConfigurationBackupCallbacks) *GoldbusLightService {
	return &GoldbusLightService{
		controller:                 controller,
		openDetachedConsoleWindow:  callbacks.Open,
		closeDetachedConsoleWindow: callbacks.Close,
		isConsoleWindowDetached:    callbacks.IsDetached,
		backupCallbacks:            backup,
	}
}

// withController executes a function with the controller if it's available
func (g *GoldbusLightService) withController(fn func(*ctrlpkg.WLEDController) error) error {
	controller, err := g.requireController()
	if err != nil {
		return err
	}
	return fn(controller)
}

// withControllerResult executes a function with the controller and returns a result
func withControllerResult[T any](g *GoldbusLightService, fn func(*ctrlpkg.WLEDController) (T, error)) (T, error) {
	var zero T
	controller, err := g.requireController()
	if err != nil {
		return zero, err
	}
	return fn(controller)
}

// withControllerValue executes a function with the controller and returns a value without error
func withControllerValue[T any](g *GoldbusLightService, fn func(*ctrlpkg.WLEDController) T) (T, error) {
	var zero T
	controller, err := g.requireController()
	if err != nil {
		return zero, err
	}
	return fn(controller), nil
}

func (g *GoldbusLightService) Greet(name string) string {
	return "Hello " + name + "!"
}

func (g *GoldbusLightService) AppVersion() string {
	return goldbus.AppVersion
}

func (g *GoldbusLightService) GetLicenseInfo() (license.LicenseInfo, error) {
	return withControllerValue(g, func(c *ctrlpkg.WLEDController) license.LicenseInfo {
		return c.LicenseInfo()
	})
}

func (g *GoldbusLightService) ActivateLicense(key string) (license.LicenseInfo, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (license.LicenseInfo, error) {
		return c.ActivateLicense(key)
	})
}

func (g *GoldbusLightService) DeactivateLicense() (license.LicenseInfo, error) {
	return withControllerValue(g, func(c *ctrlpkg.WLEDController) license.LicenseInfo {
		return c.DeactivateLicense()
	})
}

func (g *GoldbusLightService) GetControllerSnapshot() (ctrlpkg.ControllerSnapshot, error) {
	return withControllerValue(g, func(c *ctrlpkg.WLEDController) ctrlpkg.ControllerSnapshot {
		return c.Snapshot()
	})
}

func (g *GoldbusLightService) DefaultControllerSettings() (ctrlpkg.ControllerSettings, error) {
	return withControllerValue(g, func(c *ctrlpkg.WLEDController) ctrlpkg.ControllerSettings {
		return c.Snapshot().Settings
	})
}

func (g *GoldbusLightService) SaveControllerSettings(settings ctrlpkg.ControllerSettings) (ctrlpkg.ControllerSnapshot, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.ControllerSnapshot, error) {
		if err := c.SaveSettings(settings); err != nil {
			return ctrlpkg.ControllerSnapshot{}, err
		}
		return c.Snapshot(), nil
	})
}

func (g *GoldbusLightService) ApplyNetworkSettings() (ctrlpkg.NetworkApplyResult, error) {
	return withControllerValue(g, func(c *ctrlpkg.WLEDController) ctrlpkg.NetworkApplyResult {
		ctx, cancel := context.WithTimeout(context.Background(), TimeoutNetworkApply)
		defer cancel()
		return c.ApplyNetwork(ctx)
	})
}

func (g *GoldbusLightService) DiscoverDevicesNow() ([]ctrlpkg.WLEDDevice, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) ([]ctrlpkg.WLEDDevice, error) {
		ctx, cancel := context.WithTimeout(context.Background(), TimeoutDiscovery)
		defer cancel()
		return c.DiscoverNow(ctx)
	})
}

func (g *GoldbusLightService) SetDeviceState(deviceID string, state map[string]any) (ctrlpkg.ControllerSnapshot, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.ControllerSnapshot, error) {
		ctx, cancel := context.WithTimeout(context.Background(), TimeoutDeviceOp)
		defer cancel()
		if err := c.SetDeviceState(ctx, deviceID, state); err != nil {
			return ctrlpkg.ControllerSnapshot{}, err
		}
		return c.Snapshot(), nil
	})
}

func (g *GoldbusLightService) SetGlobalState(state map[string]any) (map[string]string, error) {
	return withControllerValue(g, func(c *ctrlpkg.WLEDController) map[string]string {
		if !c.Snapshot().Settings.WLED.Enabled {
			return nil
		}
		ctx, cancel := context.WithTimeout(context.Background(), TimeoutDeviceOp)
		defer cancel()
		return c.SetGlobalState(ctx, state)
	})
}

func (g *GoldbusLightService) ProvisionDevice(deviceID string) (ctrlpkg.ControllerSnapshot, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.ControllerSnapshot, error) {
		ctx, cancel := context.WithTimeout(context.Background(), TimeoutProvision)
		defer cancel()
		if err := c.ProvisionDevice(ctx, deviceID); err != nil {
			return ctrlpkg.ControllerSnapshot{}, err
		}
		return c.Snapshot(), nil
	})
}

func (g *GoldbusLightService) RefreshDevice(deviceID string) (ctrlpkg.ControllerSnapshot, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.ControllerSnapshot, error) {
		ctx, cancel := context.WithTimeout(context.Background(), TimeoutDeviceOp)
		defer cancel()
		if err := c.RefreshDevice(ctx, deviceID); err != nil {
			return ctrlpkg.ControllerSnapshot{}, err
		}
		return c.Snapshot(), nil
	})
}

func (g *GoldbusLightService) GetDeviceDetail(deviceID string) (ctrlpkg.WLEDDeviceDetail, error) {
	return withControllerValue(g, func(c *ctrlpkg.WLEDController) ctrlpkg.WLEDDeviceDetail {
		ctx, cancel := context.WithTimeout(context.Background(), TimeoutDeviceDetail)
		defer cancel()
		return c.GetDeviceDetail(ctx, deviceID)
	})
}

func (g *GoldbusLightService) RemoveDevice(deviceID string) (ctrlpkg.ControllerSnapshot, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.ControllerSnapshot, error) {
		if err := c.RemoveDevice(deviceID); err != nil {
			return ctrlpkg.ControllerSnapshot{}, err
		}
		return c.Snapshot(), nil
	})
}

func (g *GoldbusLightService) GetIgnoredDevices() ([]ctrlpkg.WLEDDevice, error) {
	return withControllerValue(g, func(c *ctrlpkg.WLEDController) []ctrlpkg.WLEDDevice {
		return c.IgnoredDevices()
	})
}

func (g *GoldbusLightService) SetDeviceIgnored(deviceID string, ignored bool) (ctrlpkg.ControllerSnapshot, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.ControllerSnapshot, error) {
		if err := c.SetDeviceIgnored(deviceID, ignored); err != nil {
			return ctrlpkg.ControllerSnapshot{}, err
		}
		return c.Snapshot(), nil
	})
}

func (g *GoldbusLightService) RenameDevice(deviceID string, name string) (ctrlpkg.ControllerSnapshot, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.ControllerSnapshot, error) {
		ctx, cancel := context.WithTimeout(context.Background(), TimeoutDeviceDetail)
		defer cancel()
		if err := c.RenameDevice(ctx, deviceID, name); err != nil {
			return ctrlpkg.ControllerSnapshot{}, err
		}
		return c.Snapshot(), nil
	})
}

func (g *GoldbusLightService) ControllerSummary() (string, error) {
	return withControllerValue(g, func(c *ctrlpkg.WLEDController) string {
		snapshot := c.Snapshot()
		return fmt.Sprintf("Devices: %d, persistence: %s", len(snapshot.Devices), snapshot.PersistencePath)
	})
}

func (g *GoldbusLightService) GetDMXState() (ctrlpkg.DMXState, error) {
	return withControllerValue(g, func(c *ctrlpkg.WLEDController) ctrlpkg.DMXState {
		return c.GetDMXState()
	})
}

func (g *GoldbusLightService) GetDMXFixtureLiveLayoutJSON(fixtureID string) (string, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (string, error) {
		return c.GetDMXFixtureLiveLayoutJSON(fixtureID)
	})
}

func (g *GoldbusLightService) SetDMXFixtureLiveLayoutJSON(fixtureID string, layoutJSON string) error {
	return g.withController(func(c *ctrlpkg.WLEDController) error {
		return c.SetDMXFixtureLiveLayoutJSON(fixtureID, layoutJSON)
	})
}

func (g *GoldbusLightService) GetDMXPartyState() (ctrlpkg.DMXPartyState, error) {
	return withControllerValue(g, func(c *ctrlpkg.WLEDController) ctrlpkg.DMXPartyState {
		return c.GetDMXPartyState()
	})
}

func (g *GoldbusLightService) SetDMXPartyConfig(config ctrlpkg.DMXPartyConfig) (ctrlpkg.DMXPartyState, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.DMXPartyState, error) {
		return c.SetDMXPartyConfig(config)
	})
}

func (g *GoldbusLightService) StartDMXParty() error {
	return g.withController(func(c *ctrlpkg.WLEDController) error {
		return c.StartDMXParty()
	})
}

func (g *GoldbusLightService) StopDMXParty() {
	_ = g.withController(func(c *ctrlpkg.WLEDController) error {
		c.StopDMXParty()
		return nil
	})
}

func (g *GoldbusLightService) DMXEmergencyStop() error {
	return g.withController(func(c *ctrlpkg.WLEDController) error {
		return c.DMXEmergencyStop()
	})
}

func (g *GoldbusLightService) ListDMXPartyAudioInputDevices() ([]ctrlpkg.DMXPartyAudioInputDevice, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) ([]ctrlpkg.DMXPartyAudioInputDevice, error) {
		return c.ListDMXPartyAudioInputDevices()
	})
}

func (g *GoldbusLightService) CreateDMXFixture(input ctrlpkg.UpsertDMXFixtureInput) (ctrlpkg.DMXFixture, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.DMXFixture, error) {
		return c.CreateDMXFixture(input)
	})
}

func (g *GoldbusLightService) UpdateDMXFixture(input ctrlpkg.UpsertDMXFixtureInput) (ctrlpkg.DMXFixture, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.DMXFixture, error) {
		return c.UpdateDMXFixture(input)
	})
}

func (g *GoldbusLightService) DeleteDMXFixture(id string) error {
	return g.withController(func(c *ctrlpkg.WLEDController) error {
		return c.DeleteDMXFixture(id)
	})
}

func (g *GoldbusLightService) ListUSBSerialDevices() ([]ctrlpkg.USBSerialDevice, error) {
	return withControllerValue(g, func(c *ctrlpkg.WLEDController) []ctrlpkg.USBSerialDevice {
		return c.ListUSBSerialDevices()
	})
}

func (g *GoldbusLightService) SetSelectedUSBSerialDevice(deviceID string) (ctrlpkg.DMXState, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.DMXState, error) {
		if err := c.SetSelectedUSBSerialDevice(deviceID); err != nil {
			return ctrlpkg.DMXState{}, err
		}
		return c.GetDMXState(), nil
	})
}

func (g *GoldbusLightService) CreateDMXUniverse(name string) (ctrlpkg.DMXUniverse, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.DMXUniverse, error) {
		return c.CreateDMXUniverse(name)
	})
}

func (g *GoldbusLightService) DeleteDMXUniverse(universeID string) error {
	return g.withController(func(c *ctrlpkg.WLEDController) error {
		return c.DeleteDMXUniverse(universeID)
	})
}

func (g *GoldbusLightService) SetDMXUniverseUSBDevice(universeID, deviceID string) (ctrlpkg.DMXState, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.DMXState, error) {
		if err := c.SetDMXUniverseUSBDevice(universeID, deviceID); err != nil {
			return ctrlpkg.DMXState{}, err
		}
		return c.GetDMXState(), nil
	})
}

func (g *GoldbusLightService) StartDMXLive(fixtureID string) error {
	return g.withController(func(c *ctrlpkg.WLEDController) error {
		return c.StartDMXLive(fixtureID)
	})
}

func (g *GoldbusLightService) StopDMXLive() {
	_ = g.withController(func(c *ctrlpkg.WLEDController) error {
		c.StopDMXLive()
		return nil
	})
}

func (g *GoldbusLightService) ApplyDMXLivePatch(updates []dmx.DMXOutputUpdate) error {
	return g.withController(func(c *ctrlpkg.WLEDController) error {
		return c.ApplyDMXLivePatch(updates)
	})
}

func (g *GoldbusLightService) GetDMXLiveStatus() (dmx.DMXLiveStatus, error) {
	return withControllerValue(g, func(c *ctrlpkg.WLEDController) dmx.DMXLiveStatus {
		return c.GetDMXLiveStatus()
	})
}

// ListConsoleEntries returns transport console entries with ID greater than
// afterID, capped at limit. Used by the Settings → Console tab.
func (g *GoldbusLightService) ListConsoleEntries(afterID int64, limit int) ([]console.Entry, error) {
	controller, err := g.requireController()
	if err != nil {
		return nil, err
	}
	bus := controller.Console()
	if bus == nil {
		return []console.Entry{}, nil
	}
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	return bus.List(afterID, limit), nil
}

// ClearConsoleEntries empties the live transport console buffer.
func (g *GoldbusLightService) ClearConsoleEntries() error {
	controller, err := g.requireController()
	if err != nil {
		return err
	}
	if bus := controller.Console(); bus != nil {
		bus.Clear()
	}
	return nil
}

// OpenDetachedConsoleWindow opens (or focuses) the detached Console window.
func (g *GoldbusLightService) OpenDetachedConsoleWindow() error {
	if g.openDetachedConsoleWindow == nil {
		return errors.New("detached console window is unavailable")
	}
	return g.openDetachedConsoleWindow()
}

// CloseDetachedConsoleWindow closes the detached Console window if open.
func (g *GoldbusLightService) CloseDetachedConsoleWindow() error {
	if g.closeDetachedConsoleWindow == nil {
		return nil
	}
	return g.closeDetachedConsoleWindow()
}

// IsConsoleWindowDetached reports whether the detached Console window is open.
func (g *GoldbusLightService) IsConsoleWindowDetached() bool {
	if g.isConsoleWindowDetached == nil {
		return false
	}
	return g.isConsoleWindowDetached()
}

// ExportConfigurationBackup prompts for a destination file and writes the full configuration bundle.
func (g *GoldbusLightService) ExportConfigurationBackup() (string, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (string, error) {
		if g.backupCallbacks.PromptSavePath == nil {
			return "", errors.New("configuration backup export is unavailable")
		}
		data, err := c.ExportConfigurationBackup(goldbus.AppVersion)
		if err != nil {
			return "", err
		}
		suggested := "goldbus-config-" + time.Now().UTC().Format("20060102-150405") + ctrlpkg.ConfigurationBackupExtension()
		path, err := g.backupCallbacks.PromptSavePath(suggested)
		if err != nil {
			return "", err
		}
		path = strings.TrimSpace(path)
		if path == "" {
			return "", ctrlpkg.ErrConfigurationBackupCancelled
		}
		if err := os.WriteFile(path, data, 0o600); err != nil {
			return "", fmt.Errorf("write backup: %w", err)
		}
		return path, nil
	})
}

// ExportDMXFixtureConfig prompts for a destination file and writes the provided
// fixture configuration JSON to it. The contents are produced by the GUI layer.
// Returns the chosen path, or ErrConfigurationBackupCancelled when dismissed.
func (g *GoldbusLightService) ExportDMXFixtureConfig(suggestedFilename string, contents string) (string, error) {
	if err := g.withController(func(c *ctrlpkg.WLEDController) error {
		return c.RequireLicenseFeature(license.FeatureFixtureExport)
	}); err != nil {
		return "", err
	}
	prompt := g.backupCallbacks.PromptSaveFixturePath
	if prompt == nil {
		prompt = g.backupCallbacks.PromptSavePath
	}
	if prompt == nil {
		return "", errors.New("fixture export is unavailable")
	}
	suggested := strings.TrimSpace(suggestedFilename)
	if suggested == "" {
		suggested = "dmx-fixture.json"
	}
	path, err := prompt(suggested)
	if err != nil {
		return "", err
	}
	path = strings.TrimSpace(path)
	if path == "" {
		return "", ctrlpkg.ErrConfigurationBackupCancelled
	}
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		return "", fmt.Errorf("write fixture config: %w", err)
	}
	return path, nil
}

// ImportConfigurationBackup prompts for a backup file and restores all persisted configuration.
func (g *GoldbusLightService) ImportConfigurationBackup() (ctrlpkg.ControllerSnapshot, error) {
	return withControllerResult(g, func(c *ctrlpkg.WLEDController) (ctrlpkg.ControllerSnapshot, error) {
		if g.backupCallbacks.PromptOpenPath == nil {
			return ctrlpkg.ControllerSnapshot{}, errors.New("configuration backup import is unavailable")
		}
		path, err := g.backupCallbacks.PromptOpenPath()
		if err != nil {
			return ctrlpkg.ControllerSnapshot{}, err
		}
		path = strings.TrimSpace(path)
		if path == "" {
			return ctrlpkg.ControllerSnapshot{}, ctrlpkg.ErrConfigurationBackupCancelled
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return ctrlpkg.ControllerSnapshot{}, fmt.Errorf("read backup: %w", err)
		}
		if err := c.ImportConfigurationBackup(data); err != nil {
			return ctrlpkg.ControllerSnapshot{}, err
		}
		return c.Snapshot(), nil
	})
}

func (g *GoldbusLightService) requireController() (*ctrlpkg.WLEDController, error) {
	if g.controller == nil {
		return nil, errors.New("controller is not initialized")
	}
	return g.controller, nil
}
