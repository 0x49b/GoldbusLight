package controller

import (
	"io"
	"log"
	"path/filepath"
	"testing"
	"time"
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

func TestCreateDMXUniversePersistsWithoutDeadlock(t *testing.T) {
	c := testControllerWithPersistence(t)

	done := make(chan struct{})
	var created DMXUniverse
	var err error
	go func() {
		created, err = c.CreateDMXUniverse("")
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("CreateDMXUniverse deadlocked while persisting")
	}
	if err != nil {
		t.Fatalf("CreateDMXUniverse: %v", err)
	}
	if created.ID == "" || created.Name == "" {
		t.Fatalf("expected created universe metadata, got %+v", created)
	}

	st := c.GetDMXState()
	if len(st.Universes) != 2 {
		t.Fatalf("expected 2 universes after create, got %d", len(st.Universes))
	}
}

func TestDeleteDMXUniversePersistsWithoutDeadlock(t *testing.T) {
	c := testControllerWithPersistence(t)

	created, err := c.CreateDMXUniverse("Universe 2")
	if err != nil {
		t.Fatalf("CreateDMXUniverse: %v", err)
	}

	done := make(chan struct{})
	var deleteErr error
	go func() {
		deleteErr = c.DeleteDMXUniverse(created.ID)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("DeleteDMXUniverse deadlocked while persisting")
	}
	if deleteErr != nil {
		t.Fatalf("DeleteDMXUniverse: %v", deleteErr)
	}

	st := c.GetDMXState()
	if len(st.Universes) != 1 {
		t.Fatalf("expected 1 universe after delete, got %d", len(st.Universes))
	}
}

func TestSaveSettingsPreservesPerUniverseInterfaces(t *testing.T) {
	c := testControllerWithPersistence(t)

	u2, err := c.CreateDMXUniverse("Universe 2")
	if err != nil {
		t.Fatalf("CreateDMXUniverse: %v", err)
	}

	c.mu.Lock()
	c.settings.DMX.UniverseInterfaces = map[string]DMXUniverseInterfaceSettings{
		DefaultDMXUniverseID: {
			SelectedUSBDeviceID: "usb-a",
			ArtNet:              DefaultControllerSettings().DMX.ArtNet,
		},
		u2.ID: {
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
	saved := c.settings
	c.mu.Unlock()

	if err := c.SaveSettings(saved); err != nil {
		t.Fatalf("SaveSettings: %v", err)
	}

	iface1 := c.universeInterfaceSettings(DefaultDMXUniverseID)
	iface2 := c.universeInterfaceSettings(u2.ID)
	if iface1.SelectedUSBDeviceID != "usb-a" {
		t.Fatalf("universe 1 usb = %q, want usb-a", iface1.SelectedUSBDeviceID)
	}
	if iface2.SelectedUSBDeviceID != "usb-b" {
		t.Fatalf("universe 2 usb = %q, want usb-b", iface2.SelectedUSBDeviceID)
	}
	if !iface2.ArtNet.Enabled || iface2.ArtNet.TargetHost != "10.0.0.2" {
		t.Fatalf("universe 2 art-net not preserved: %+v", iface2.ArtNet)
	}
}
