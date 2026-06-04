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
	c.devices = map[string]WLEDDevice{"dev-1": {ID: "dev-1", Name: "Test"}}
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
	c2.mu.Unlock()

	if err := c2.ImportConfigurationBackup(data); err != nil {
		t.Fatalf("import: %v", err)
	}

	c2.mu.RLock()
	defer c2.mu.RUnlock()
	if len(c2.devices) != 1 {
		t.Fatalf("devices = %d", len(c2.devices))
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
