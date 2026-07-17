package controller

import (
	"encoding/json"
	"io"
	"log"
	"path/filepath"
	"testing"
)

func TestLightingSceneExportImportRoundTrip(t *testing.T) {
	dir := t.TempDir()
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.persistence = &StatePersistenceManager{path: filepath.Join(dir, defaultStateFileName)}
	c.generalTabPersistence = &GeneralTabStatePersistenceManager{path: filepath.Join(dir, generalTabStateFileName)}
	c.dmxPersistence = &DMXPersistenceManager{path: filepath.Join(dir, dmxStateFileName)}
	c.dmxLiveLayoutPersistence = &DMXFixtureLiveLayoutPersistenceManager{path: filepath.Join(dir, dmxFixtureLiveLayoutsFileName)}

	c.mu.Lock()
	c.settings = DefaultControllerSettings()
	c.settings.WLED.Enabled = true
	c.settings.DMX.Enabled = true
	c.devices = map[string]WLEDDevice{
		"dev-1": {
			ID:   "dev-1",
			Name: "Strip",
			Host: "strip.local",
			Presets: []WLEDDevicePreset{{
				ID:    "preset-1",
				Name:  "Warm",
				State: map[string]any{"on": true, "bri": 180},
			}},
		},
	}
	c.dmxState = defaultDMXState()
	c.dmxState.Fixtures = []DMXFixture{{
		ID:         "fx-1",
		Brand:      "Acme",
		Name:       "Spot",
		DMXAddress: 1,
		Type:       DMXFixtureTypeMovingHead,
		SceneCues: []DMXFixtureCue{{ID: "cue-1", Label: "Home", Values: map[string]int{"1": 128}}},
	}}
	c.dmxPersistEnabled = true
	c.scenes = []LightingScene{{
		ID:   "scene-1",
		Name: "Warm Stage",
		WLED: []SceneWLEDEntry{{DeviceID: "dev-1", PresetID: "preset-1"}},
		DMX:  []SceneDMXEntry{{FixtureID: "fx-1", CueID: "cue-1"}},
	}}
	c.mu.Unlock()

	raw, err := c.ExportLightingSceneBundle("scene-1")
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	var bundle PortableLightingSceneBundle
	if err := json.Unmarshal(raw, &bundle); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if bundle.Scene.Name != "Warm Stage" || len(bundle.Scene.WLED) != 1 || len(bundle.Scene.DMX) != 1 {
		t.Fatalf("bundle = %+v", bundle.Scene)
	}

	c.mu.Lock()
	c.scenes = nil
	c.mu.Unlock()

	imported, err := c.ImportLightingSceneBundle(raw)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if imported.Name != "Warm Stage" {
		t.Fatalf("imported name = %q", imported.Name)
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	if len(c.scenes) != 1 {
		t.Fatalf("scenes = %d", len(c.scenes))
	}
	if len(c.scenes[0].WLED) != 1 || c.scenes[0].WLED[0].DeviceID != "dev-1" {
		t.Fatalf("wled entries = %+v", c.scenes[0].WLED)
	}
	if len(c.scenes[0].DMX) != 1 || c.scenes[0].DMX[0].FixtureID != "fx-1" {
		t.Fatalf("dmx entries = %+v", c.scenes[0].DMX)
	}
}

func TestSetPartyLightingSceneExclusivity(t *testing.T) {
	dir := t.TempDir()
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.persistence = &StatePersistenceManager{path: filepath.Join(dir, defaultStateFileName)}
	c.generalTabPersistence = &GeneralTabStatePersistenceManager{path: filepath.Join(dir, generalTabStateFileName)}
	c.dmxPersistence = &DMXPersistenceManager{path: filepath.Join(dir, dmxStateFileName)}
	c.dmxLiveLayoutPersistence = &DMXFixtureLiveLayoutPersistenceManager{path: filepath.Join(dir, dmxFixtureLiveLayoutsFileName)}

	c.mu.Lock()
	c.scenes = []LightingScene{
		{ID: "scene-a", Name: "A"},
		{ID: "scene-b", Name: "B"},
	}
	c.mu.Unlock()

	if err := c.SetPartyLightingScene("scene-a"); err != nil {
		t.Fatalf("set party scene a: %v", err)
	}
	c.mu.RLock()
	if c.partySceneID != "scene-a" {
		t.Fatalf("partySceneID = %q", c.partySceneID)
	}
	c.mu.RUnlock()

	if err := c.SetPartyLightingScene("scene-b"); err != nil {
		t.Fatalf("set party scene b: %v", err)
	}
	c.mu.RLock()
	if c.partySceneID != "scene-b" {
		t.Fatalf("partySceneID = %q", c.partySceneID)
	}
	c.mu.RUnlock()

	if err := c.SetPartyLightingScene(""); err != nil {
		t.Fatalf("clear party scene: %v", err)
	}
	c.mu.RLock()
	if c.partySceneID != "" {
		t.Fatalf("partySceneID = %q, want empty", c.partySceneID)
	}
	c.mu.RUnlock()
}

func TestUpdateLightingSceneStoresPartyTargets(t *testing.T) {
	dir := t.TempDir()
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.persistence = &StatePersistenceManager{path: filepath.Join(dir, defaultStateFileName)}
	c.generalTabPersistence = &GeneralTabStatePersistenceManager{path: filepath.Join(dir, generalTabStateFileName)}
	c.dmxPersistence = &DMXPersistenceManager{path: filepath.Join(dir, dmxStateFileName)}
	c.dmxLiveLayoutPersistence = &DMXFixtureLiveLayoutPersistenceManager{path: filepath.Join(dir, dmxFixtureLiveLayoutsFileName)}

	c.mu.Lock()
	c.settings = DefaultControllerSettings()
	c.settings.WLED.Enabled = true
	c.settings.DMX.Enabled = true
	c.devices = map[string]WLEDDevice{"dev-1": {ID: "dev-1", Name: "Strip"}}
	c.dmxState = defaultDMXState()
	c.dmxState.Fixtures = []DMXFixture{{ID: "fx-1", Name: "Spot", DMXAddress: 1, Type: DMXFixtureTypeMovingHead}}
	c.dmxPersistEnabled = true
	c.scenes = []LightingScene{{ID: "scene-1", Name: "Party Look"}}
	c.mu.Unlock()

	updated, err := c.UpdateLightingScene(UpsertLightingSceneInput{
		ID:                 "scene-1",
		Name:               "Party Look",
		PartyWLEDDeviceIDs: []string{"dev-1"},
		PartyFixtureIDs:    []string{"fx-1"},
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if len(updated.PartyWLEDDeviceIDs) != 1 || updated.PartyWLEDDeviceIDs[0] != "dev-1" {
		t.Fatalf("party wled = %+v", updated.PartyWLEDDeviceIDs)
	}
	if len(updated.PartyFixtureIDs) != 1 || updated.PartyFixtureIDs[0] != "fx-1" {
		t.Fatalf("party fixtures = %+v", updated.PartyFixtureIDs)
	}
}
