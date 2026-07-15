package controller

import (
	"io"
	"log"
	"path/filepath"
	"testing"
)

func testControllerWithPersistence(t *testing.T) *WLEDController {
	t.Helper()
	dir := t.TempDir()
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.persistence = &StatePersistenceManager{path: filepath.Join(dir, defaultStateFileName)}
	c.dmxPersistence = &DMXPersistenceManager{path: filepath.Join(dir, dmxStateFileName)}
	c.mu.Lock()
	c.settings = DefaultControllerSettings()
	c.dmxState = defaultDMXState()
	c.dmxPersistEnabled = true
	c.mu.Unlock()
	return c
}

func TestNormalizeDMXStateCollapsesMultipleUniverses(t *testing.T) {
	st := DMXState{
		Universes: []DMXUniverse{
			{ID: DefaultDMXUniverseID, Name: "Universe 1"},
			{ID: "universe-extra", Name: "Universe 2"},
		},
		Fixtures: []DMXFixture{
			{ID: "fx-1", Name: "A", UniverseID: DefaultDMXUniverseID, DMXAddress: 1, Type: DMXFixtureTypeMovingHead},
			{ID: "fx-2", Name: "B", UniverseID: "universe-extra", DMXAddress: 10, Type: DMXFixtureTypeMovingHead},
		},
		Party: defaultDMXPartyState(),
	}
	normalized := normalizeDMXState(st)
	if len(normalized.Universes) != 1 || normalized.Universes[0].ID != DefaultDMXUniverseID {
		t.Fatalf("expected single universe-1, got %+v", normalized.Universes)
	}
	for _, fx := range normalized.Fixtures {
		if fx.UniverseID != DefaultDMXUniverseID {
			t.Fatalf("fixture %s universe = %q, want %s", fx.ID, fx.UniverseID, DefaultDMXUniverseID)
		}
	}
}

func TestNormalizeDMXUniverseInterfacesKeepsUniverse1(t *testing.T) {
	interfaces := map[string]DMXUniverseInterfaceSettings{
		"universe-extra": {
			SelectedUSBDeviceID: "usb-b",
			ArtNet: ArtNetSettings{
				Enabled:    true,
				TargetHost: "10.0.0.2",
				Port:       6454,
				Universe:   1,
				RefreshHz:  44,
			},
		},
	}
	out := normalizeDMXUniverseInterfaces(interfaces, nil, "usb-legacy", DefaultControllerSettings().DMX.ArtNet)
	if len(out) != 1 {
		t.Fatalf("expected 1 interface entry, got %d", len(out))
	}
	iface, ok := out[DefaultDMXUniverseID]
	if !ok {
		t.Fatal("missing universe-1 interface")
	}
	if iface.SelectedUSBDeviceID != "usb-b" {
		t.Fatalf("usb = %q, want usb-b (migrated from extra universe)", iface.SelectedUSBDeviceID)
	}
	if !iface.ArtNet.Enabled || iface.ArtNet.TargetHost != "10.0.0.2" {
		t.Fatalf("art-net not migrated: %+v", iface.ArtNet)
	}
}

func TestNormalizeDMXUniverseInterfacesPrefersConfiguredOverEmptyUniverse1(t *testing.T) {
	interfaces := map[string]DMXUniverseInterfaceSettings{
		DefaultDMXUniverseID: {
			SelectedUSBDeviceID: "",
			ArtNet:              DefaultControllerSettings().DMX.ArtNet,
		},
		"universe-extra": {
			SelectedUSBDeviceID: "usb-live",
			ArtNet: ArtNetSettings{
				Enabled:    true,
				TargetHost: "192.168.1.50",
				Port:       6454,
				Universe:   2,
				RefreshHz:  40,
			},
		},
	}
	out := normalizeDMXUniverseInterfaces(interfaces, nil, "", DefaultControllerSettings().DMX.ArtNet)
	iface := out[DefaultDMXUniverseID]
	if iface.SelectedUSBDeviceID != "usb-live" {
		t.Fatalf("usb = %q, want usb-live", iface.SelectedUSBDeviceID)
	}
	if !iface.ArtNet.Enabled || iface.ArtNet.TargetHost != "192.168.1.50" || iface.ArtNet.Universe != 2 {
		t.Fatalf("art-net not taken from configured universe: %+v", iface.ArtNet)
	}
}

func TestSaveSettingsPreservesUniverse1Interface(t *testing.T) {
	c := testControllerWithPersistence(t)

	c.mu.Lock()
	c.settings.DMX.UniverseInterfaces = map[string]DMXUniverseInterfaceSettings{
		DefaultDMXUniverseID: {
			SelectedUSBDeviceID: "usb-a",
			ArtNet: ArtNetSettings{
				Enabled:    true,
				TargetHost: "10.0.0.1",
				Port:       6454,
				Universe:   0,
				RefreshHz:  44,
			},
		},
		"orphan-universe": {
			SelectedUSBDeviceID: "usb-orphan",
			ArtNet:              DefaultControllerSettings().DMX.ArtNet,
		},
	}
	saved := c.settings
	c.mu.Unlock()

	if err := c.SaveSettings(saved); err != nil {
		t.Fatalf("SaveSettings: %v", err)
	}

	iface := c.universeInterfaceSettings(DefaultDMXUniverseID)
	if iface.SelectedUSBDeviceID != "usb-a" {
		t.Fatalf("universe 1 usb = %q, want usb-a", iface.SelectedUSBDeviceID)
	}
	if !iface.ArtNet.Enabled || iface.ArtNet.TargetHost != "10.0.0.1" {
		t.Fatalf("universe 1 art-net not preserved: %+v", iface.ArtNet)
	}
}
