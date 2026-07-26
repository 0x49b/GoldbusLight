package controller

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const configurationBackupVersion = 1

// ConfigurationBackupExtension is the suggested suffix for exported backup files.
func ConfigurationBackupExtension() string {
	return ".goldbus-backup.json"
}

var (
	ErrConfigurationBackupCancelled = errors.New("configuration backup cancelled")
)

// ConfigurationBackup bundles persisted controller data for transfer between hosts.
type ConfigurationBackup struct {
	Version    int                        `json:"version"`
	ExportedAt time.Time                  `json:"exportedAt"`
	AppVersion string                     `json:"appVersion,omitempty"`
	Files      map[string]json.RawMessage `json:"files"`
}

// ExportConfigurationBackup flushes current state to disk and returns a portable JSON bundle.
func (c *WLEDController) ExportConfigurationBackup(appVersion string) ([]byte, error) {
	c.mu.RLock()
	generalTab := c.generalTabState
	stateToBackup := persistentState{
		Version:        persistentStateVersion,
		SavedAt:        time.Now().UTC(),
		Settings:       c.settings,
		Devices:        cloneDeviceMap(c.devices),
		Scenes:         cloneLightingScenes(c.scenes),
		ActiveSceneID:  c.activeSceneID,
		DefaultSceneID: c.defaultSceneID,
		PartySceneID:   c.partySceneID,
	}
	c.mu.RUnlock()

	if err := c.persist(); err != nil {
		return nil, fmt.Errorf("persist state: %w", err)
	}
	if err := c.persistDMXForBackup(); err != nil {
		return nil, fmt.Errorf("persist dmx: %w", err)
	}
	if err := c.generalTabPersistence.Save(generalTab); err != nil {
		return nil, fmt.Errorf("persist general tab: %w", err)
	}

	files, err := c.readConfigurationBackupFiles()
	if err != nil {
		return nil, err
	}

	stateRaw, err := json.MarshalIndent(stateToBackup, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal state: %w", err)
	}
	files[defaultStateFileName] = stateRaw

	dmxRaw, err := c.marshalDMXStateForBackup()
	if err != nil {
		return nil, fmt.Errorf("marshal dmx: %w", err)
	}
	files[dmxStateFileName] = dmxRaw

	bundle := ConfigurationBackup{
		Version:    configurationBackupVersion,
		ExportedAt: time.Now().UTC(),
		AppVersion: strings.TrimSpace(appVersion),
		Files:      files,
	}
	return json.MarshalIndent(bundle, "", "  ")
}

// ImportConfigurationBackup replaces on-disk configuration and reloads the running controller.
func (c *WLEDController) ImportConfigurationBackup(data []byte) error {
	var bundle ConfigurationBackup
	if err := json.Unmarshal(data, &bundle); err != nil {
		return fmt.Errorf("parse backup: %w", err)
	}
	if bundle.Version < 1 || bundle.Version > configurationBackupVersion {
		return fmt.Errorf("unsupported backup version %d", bundle.Version)
	}
	if len(bundle.Files) == 0 {
		return fmt.Errorf("backup contains no files")
	}

	c.importingConfig.Store(true)
	defer c.importingConfig.Store(false)

	paths := configurationBackupFilePaths(c)
	for name, path := range paths {
		raw, ok := bundle.Files[name]
		if !ok {
			if name == dmxFixtureLiveLayoutsFileName {
				raw = json.RawMessage(`{"version":1,"layouts":{}}`)
			} else {
				return fmt.Errorf("backup missing %s", name)
			}
		}
		if err := validateBackupFileJSON(name, raw); err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return fmt.Errorf("create config dir: %w", err)
		}
		payload := append([]byte(nil), raw...)
		if err := os.WriteFile(path, payload, 0o600); err != nil {
			return fmt.Errorf("write %s: %w", name, err)
		}
	}

	c.StopDMXParty()
	c.StopDMXLive()

	if err := c.reloadFromImportBundle(bundle); err != nil {
		return err
	}

	return nil
}

func configurationBackupFilePaths(c *WLEDController) map[string]string {
	return map[string]string{
		defaultStateFileName:          c.persistence.Path(),
		dmxStateFileName:              c.dmxPersistence.Path(),
		generalTabStateFileName:       c.generalTabPersistence.Path(),
		dmxFixtureLiveLayoutsFileName: c.dmxLiveLayoutPersistence.Path(),
	}
}

func readJSONFileRaw(path string) (json.RawMessage, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return json.RawMessage("{}"), nil
		}
		return nil, err
	}
	trim := strings.TrimSpace(string(data))
	if trim == "" {
		return json.RawMessage("{}"), nil
	}
	if !json.Valid(data) {
		return nil, fmt.Errorf("invalid json in %s", path)
	}
	return json.RawMessage(data), nil
}

func validateBackupFileJSON(name string, raw json.RawMessage) error {
	if len(raw) == 0 {
		return fmt.Errorf("%s is empty", name)
	}
	if !json.Valid(raw) {
		return fmt.Errorf("%s is not valid json", name)
	}
	var probe any
	if err := json.Unmarshal(raw, &probe); err != nil {
		return fmt.Errorf("%s: %w", name, err)
	}
	switch probe.(type) {
	case map[string]any, []any:
		return nil
	default:
		return fmt.Errorf("%s must be a json object or array", name)
	}
}

func (c *WLEDController) reloadFromPersistence() error {
	loaded, err := c.persistence.Load()
	if err != nil {
		return fmt.Errorf("load state: %w", err)
	}
	generalTab, err := c.generalTabPersistence.Load()
	if err != nil {
		return fmt.Errorf("load general tab: %w", err)
	}
	dmxState, err := c.dmxPersistence.Load()
	dmxPersistEnabled := err == nil
	if err != nil {
		return fmt.Errorf("load dmx: %w", err)
	}

	normDMX := normalizeDMXState(dmxState)
	normDMX.Party = stripDMXPartyRuntimeForPersistence(normalizeDMXPartyState(normDMX.Party))
	normDMX.Party.Config.Enabled = false

	c.mu.Lock()
	wledWas := c.settings.WLED.Enabled
	c.settings = mergeWithDefaults(loaded.Settings)
	c.devices = loaded.Devices
	c.scenes = normalizeLightingScenes(loaded.Scenes)
	c.activeSceneID = strings.TrimSpace(loaded.ActiveSceneID)
	if c.activeSceneID != "" {
		if _, _, ok := c.findSceneLocked(c.activeSceneID); !ok {
			c.activeSceneID = ""
		}
	}
	c.defaultSceneID = strings.TrimSpace(loaded.DefaultSceneID)
	if c.defaultSceneID != "" {
		if _, _, ok := c.findSceneLocked(c.defaultSceneID); !ok {
			c.defaultSceneID = ""
		}
	}
	c.partySceneID = strings.TrimSpace(loaded.PartySceneID)
	if c.partySceneID != "" {
		if _, _, ok := c.findSceneLocked(c.partySceneID); !ok {
			c.partySceneID = ""
		}
	}
	c.generalTabState = clampGeneralTabState(generalTab)
	c.dmxState = normDMX
	c.dmxPersistEnabled = dmxPersistEnabled
	c.syncSimulatedDeviceLocked()
	c.updated = time.Now()
	wledNow := c.settings.WLED.Enabled
	dmxEnabled := c.settings.DMX.Enabled
	c.mu.Unlock()

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

	c.mu.Lock()
	c.dmxPersistEnabled = true
	c.mu.Unlock()

	if !dmxEnabled {
		c.StopDMXLive()
	} else if err := c.EnsureDMXLiveOutput(); err != nil {
		c.logger.Printf("dmx live ensure after import: %v", err)
	}

	return nil
}

// reloadFromImportBundle applies persisted state/general tab from disk and DMX from the backup bundle.
// DMX is taken from the bundle (not re-read from disk) so a concurrent periodic persist cannot
// overwrite dmx.json with stale in-memory fixtures between the import write and this reload.
func (c *WLEDController) reloadFromImportBundle(bundle ConfigurationBackup) error {
	rawState, ok := bundle.Files[defaultStateFileName]
	if !ok {
		return fmt.Errorf("backup missing %s", defaultStateFileName)
	}
	var loaded persistentState
	if err := json.Unmarshal(rawState, &loaded); err != nil {
		return fmt.Errorf("parse state from backup: %w", err)
	}

	generalTab, err := c.generalTabPersistence.Load()
	if err != nil {
		return fmt.Errorf("load general tab: %w", err)
	}
	rawDMX, ok := bundle.Files[dmxStateFileName]
	if !ok {
		return fmt.Errorf("backup missing %s", dmxStateFileName)
	}
	var dmxState DMXState
	if err := json.Unmarshal(rawDMX, &dmxState); err != nil {
		return fmt.Errorf("parse dmx from backup: %w", err)
	}

	normDMX := normalizeDMXState(dmxState)
	normDMX.Party = stripDMXPartyRuntimeForPersistence(normalizeDMXPartyState(normDMX.Party))
	normDMX.Party.Config.Enabled = false

	c.mu.Lock()
	wledWas := c.settings.WLED.Enabled
	c.settings = mergeWithDefaults(loaded.Settings)
	c.devices = loaded.Devices
	c.scenes = normalizeLightingScenes(loaded.Scenes)
	c.activeSceneID = strings.TrimSpace(loaded.ActiveSceneID)
	if c.activeSceneID != "" {
		if _, _, ok := c.findSceneLocked(c.activeSceneID); !ok {
			c.activeSceneID = ""
		}
	}
	c.defaultSceneID = strings.TrimSpace(loaded.DefaultSceneID)
	if c.defaultSceneID != "" {
		if _, _, ok := c.findSceneLocked(c.defaultSceneID); !ok {
			c.defaultSceneID = ""
		}
	}
	c.generalTabState = clampGeneralTabState(generalTab)
	c.dmxState = normDMX
	c.dmxPersistEnabled = true
	c.syncSimulatedDeviceLocked()
	c.updated = time.Now()
	wledNow := c.settings.WLED.Enabled
	dmxEnabled := c.settings.DMX.Enabled
	c.mu.Unlock()

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

	if !dmxEnabled {
		c.StopDMXLive()
	} else if err := c.EnsureDMXLiveOutput(); err != nil {
		c.logger.Printf("dmx live ensure after import: %v", err)
	}

	if err := c.persistDMXForBackup(); err != nil {
		return fmt.Errorf("persist dmx after import: %w", err)
	}
	return nil
}

// persistDMXForBackup writes the in-memory DMX state even when dmx.json previously failed to load.
func (c *WLEDController) persistDMXForBackup() error {
	c.mu.RLock()
	state := cloneDMXState(c.dmxState)
	c.mu.RUnlock()
	state.Party = stripDMXPartyRuntimeForPersistence(state.Party)
	return c.dmxPersistence.Save(state)
}

func (c *WLEDController) marshalDMXStateForBackup() (json.RawMessage, error) {
	c.mu.RLock()
	state := cloneDMXState(c.dmxState)
	c.mu.RUnlock()
	state.Party = stripDMXPartyRuntimeForPersistence(normalizeDMXPartyState(state.Party))
	payload, err := json.MarshalIndent(normalizeDMXState(state), "", "  ")
	if err != nil {
		return nil, err
	}
	return json.RawMessage(payload), nil
}

func (c *WLEDController) readConfigurationBackupFiles() (map[string]json.RawMessage, error) {
	files := make(map[string]json.RawMessage, 4)
	for name, path := range configurationBackupFilePaths(c) {
		raw, err := readJSONFileRaw(path)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", name, err)
		}
		files[name] = raw
	}
	return files, nil
}
