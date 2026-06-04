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
	Version    int                       `json:"version"`
	ExportedAt time.Time                 `json:"exportedAt"`
	AppVersion string                    `json:"appVersion,omitempty"`
	Files      map[string]json.RawMessage `json:"files"`
}

// ExportConfigurationBackup flushes current state to disk and returns a portable JSON bundle.
func (c *WLEDController) ExportConfigurationBackup(appVersion string) ([]byte, error) {
	c.mu.RLock()
	generalTab := c.generalTabState
	c.mu.RUnlock()

	if err := c.persist(); err != nil {
		return nil, fmt.Errorf("persist state: %w", err)
	}
	if err := c.persistDMX(); err != nil {
		return nil, fmt.Errorf("persist dmx: %w", err)
	}
	if err := c.generalTabPersistence.Save(generalTab); err != nil {
		return nil, fmt.Errorf("persist general tab: %w", err)
	}

	files := make(map[string]json.RawMessage, 4)
	for name, path := range configurationBackupFilePaths(c) {
		raw, err := readJSONFileRaw(path)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", name, err)
		}
		files[name] = raw
	}

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

	paths := configurationBackupFilePaths(c)
	for name, path := range paths {
		raw, ok := bundle.Files[name]
		if !ok {
			return fmt.Errorf("backup missing %s", name)
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

	return c.reloadFromPersistence()
}

func configurationBackupFilePaths(c *WLEDController) map[string]string {
	return map[string]string{
		defaultStateFileName:           c.persistence.Path(),
		dmxStateFileName:               c.dmxPersistence.Path(),
		generalTabStateFileName:        c.generalTabPersistence.Path(),
		dmxFixtureLiveLayoutsFileName:  c.dmxLiveLayoutPersistence.Path(),
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

	if !dmxEnabled {
		c.StopDMXLive()
	} else if err := c.reconcileDMXLiveAdapters(); err != nil {
		c.logger.Printf("dmx live reconcile after import: %v", err)
	}

	return nil
}
