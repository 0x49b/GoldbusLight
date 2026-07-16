package controller

import (
	"encoding/json"
	"io"
	"log"
	"os"
	"path/filepath"
	"testing"
)

func TestConfigurationBackupRoundTrip(t *testing.T) {
	dir := t.TempDir()
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.persistence = &StatePersistenceManager{path: filepath.Join(dir, defaultStateFileName)}
	c.generalTabPersistence = &GeneralTabStatePersistenceManager{path: filepath.Join(dir, generalTabStateFileName)}
	c.dmxPersistence = &DMXPersistenceManager{path: filepath.Join(dir, dmxStateFileName)}
	c.dmxLiveLayoutPersistence = &DMXFixtureLiveLayoutPersistenceManager{path: filepath.Join(dir, dmxFixtureLiveLayoutsFileName)}

	c.mu.Lock()
	c.settings = DefaultControllerSettings()
	c.settings.WLED.Enabled = true
	c.devices = map[string]WLEDDevice{
		"dev-1": {
			ID:   "dev-1",
			Name: "Test",
			Presets: []WLEDDevicePreset{{
				ID:    "preset-1",
				Name:  "Warm",
				State: map[string]any{"on": true, "bri": 200},
			}},
		},
	}
	c.scenes = []LightingScene{{
		ID:   "scene-1",
		Name: "Lobby",
		WLED: []SceneWLEDEntry{{DeviceID: "dev-1", PresetID: "preset-1"}},
	}}
	c.generalTabState = GeneralTabState{On: true, Bri: 128}
	c.dmxState = defaultDMXState()
	c.dmxState.Fixtures = []DMXFixture{{ID: "fx-1", Name: "Par", DMXAddress: 1, Type: DMXFixtureTypeDimmer}}
	c.dmxPersistEnabled = true
	c.mu.Unlock()

	data, err := c.ExportConfigurationBackup("test")
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	var bundle ConfigurationBackup
	if err := json.Unmarshal(data, &bundle); err != nil {
		t.Fatalf("unmarshal bundle: %v", err)
	}
	if bundle.Version != configurationBackupVersion {
		t.Fatalf("version = %d", bundle.Version)
	}
	for _, name := range []string{defaultStateFileName, dmxStateFileName, generalTabStateFileName, dmxFixtureLiveLayoutsFileName} {
		if _, ok := bundle.Files[name]; !ok {
			t.Fatalf("missing %s in bundle", name)
		}
	}
	var state persistentState
	if err := json.Unmarshal(bundle.Files[defaultStateFileName], &state); err != nil {
		t.Fatalf("state json: %v", err)
	}
	if len(state.Scenes) != 1 || state.Scenes[0].ID != "scene-1" {
		t.Fatalf("scenes in export = %+v", state.Scenes)
	}
	if len(state.Devices["dev-1"].Presets) != 1 || state.Devices["dev-1"].Presets[0].ID != "preset-1" {
		t.Fatalf("presets in export = %+v", state.Devices["dev-1"].Presets)
	}

	c2 := NewWLEDController(log.New(io.Discard, "", 0))
	c2.persistence = &StatePersistenceManager{path: filepath.Join(dir, "import-"+defaultStateFileName)}
	c2.generalTabPersistence = &GeneralTabStatePersistenceManager{path: filepath.Join(dir, "import-"+generalTabStateFileName)}
	c2.dmxPersistence = &DMXPersistenceManager{path: filepath.Join(dir, "import-"+dmxStateFileName)}
	c2.dmxLiveLayoutPersistence = &DMXFixtureLiveLayoutPersistenceManager{path: filepath.Join(dir, "import-"+dmxFixtureLiveLayoutsFileName)}

	// Import writes to c2's paths — adjust bundle paths by re-writing to c2 paths via Import on c2
	// but Import uses c2's paths from configurationBackupFilePaths, so we need same dir structure.
	// Simpler: use same paths on c2 as c for import test.
	c2.persistence = c.persistence
	c2.generalTabPersistence = c.generalTabPersistence
	c2.dmxPersistence = c.dmxPersistence
	c2.dmxLiveLayoutPersistence = c.dmxLiveLayoutPersistence

	c2.mu.Lock()
	c2.settings = DefaultControllerSettings()
	c2.devices = map[string]WLEDDevice{}
	c2.scenes = nil
	c2.mu.Unlock()

	if err := c2.ImportConfigurationBackup(data); err != nil {
		t.Fatalf("import: %v", err)
	}

	c2.mu.RLock()
	defer c2.mu.RUnlock()
	if len(c2.devices) != 1 {
		t.Fatalf("devices = %d", len(c2.devices))
	}
	if len(c2.devices["dev-1"].Presets) != 1 || c2.devices["dev-1"].Presets[0].Name != "Warm" {
		t.Fatalf("presets after import = %+v", c2.devices["dev-1"].Presets)
	}
	if len(c2.scenes) != 1 || c2.scenes[0].Name != "Lobby" {
		t.Fatalf("scenes after import = %+v", c2.scenes)
	}
	if !c2.generalTabState.On || c2.generalTabState.Bri != 128 {
		t.Fatalf("general tab = %+v", c2.generalTabState)
	}
	if len(c2.dmxState.Fixtures) != 1 || c2.dmxState.Fixtures[0].ID != "fx-1" {
		t.Fatalf("dmx fixtures = %+v", c2.dmxState.Fixtures)
	}
}

func TestExportConfigurationBackupIncludesInMemoryDMXWhenPersistDisabled(t *testing.T) {
	dir := t.TempDir()
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.persistence = &StatePersistenceManager{path: filepath.Join(dir, defaultStateFileName)}
	c.generalTabPersistence = &GeneralTabStatePersistenceManager{path: filepath.Join(dir, generalTabStateFileName)}
	c.dmxPersistence = &DMXPersistenceManager{path: filepath.Join(dir, dmxStateFileName)}
	c.dmxLiveLayoutPersistence = &DMXFixtureLiveLayoutPersistenceManager{path: filepath.Join(dir, dmxFixtureLiveLayoutsFileName)}

	c.mu.Lock()
	c.settings = DefaultControllerSettings()
	c.dmxState = defaultDMXState()
	c.dmxState.Fixtures = []DMXFixture{{ID: "fx-mem", Name: "In RAM", DMXAddress: 10, Type: DMXFixtureTypeDimmer}}
	c.dmxPersistEnabled = false
	c.mu.Unlock()

	data, err := c.ExportConfigurationBackup("test")
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	var bundle ConfigurationBackup
	if err := json.Unmarshal(data, &bundle); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	var dmx DMXState
	if err := json.Unmarshal(bundle.Files[dmxStateFileName], &dmx); err != nil {
		t.Fatalf("dmx json: %v", err)
	}
	if len(dmx.Fixtures) != 1 || dmx.Fixtures[0].ID != "fx-mem" {
		t.Fatalf("fixtures in export = %+v", dmx.Fixtures)
	}
}

func TestImportConfigurationBackupFromFixtureFile(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "fixtures", "goldbus-config-20260604-101603.goldbus-backup.json"))
	if err != nil {
		t.Skipf("fixture backup not present: %v", err)
	}
	dir := t.TempDir()
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.persistence = &StatePersistenceManager{path: filepath.Join(dir, defaultStateFileName)}
	c.generalTabPersistence = &GeneralTabStatePersistenceManager{path: filepath.Join(dir, generalTabStateFileName)}
	c.dmxPersistence = &DMXPersistenceManager{path: filepath.Join(dir, dmxStateFileName)}
	c.dmxLiveLayoutPersistence = &DMXFixtureLiveLayoutPersistenceManager{path: filepath.Join(dir, dmxFixtureLiveLayoutsFileName)}

	if err := c.ImportConfigurationBackup(data); err != nil {
		t.Fatalf("import: %v", err)
	}

	c.mu.RLock()
	n := len(c.dmxState.Fixtures)
	c.mu.RUnlock()
	if n < 1 {
		t.Fatalf("expected fixtures after import, got %d", n)
	}
}
