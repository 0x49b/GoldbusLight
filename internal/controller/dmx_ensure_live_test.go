package controller

import (
	"io"
	"log"
	"testing"
)

func TestEnsureDMXLiveOutputStartsWithUSBSimulator(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.mu.Lock()
	c.settings = DefaultControllerSettings()
	c.settings.DMX.Enabled = true
	c.settings.DMX.Testing.SimulateUSBDMX = true
	c.settings.DMX.UniverseInterfaces = map[string]DMXUniverseInterfaceSettings{
		DefaultDMXUniverseID: {
			SelectedUSBDeviceID: simulatedUSBDMXDeviceID,
			ArtNet:              DefaultControllerSettings().DMX.ArtNet,
		},
	}
	c.dmxState = defaultDMXState()
	c.mu.Unlock()

	if err := c.EnsureDMXLiveOutput(); err != nil {
		t.Fatalf("EnsureDMXLiveOutput: %v", err)
	}
	st := c.GetDMXLiveStatus()
	if !st.Connected {
		t.Fatalf("expected connected after ensure, got %+v", st)
	}

	// Idempotent when already connected.
	if err := c.EnsureDMXLiveOutput(); err != nil {
		t.Fatalf("EnsureDMXLiveOutput second call: %v", err)
	}
	if err := c.StartDMXLive(""); err != nil {
		t.Fatalf("StartDMXLive when already connected: %v", err)
	}
	c.StopDMXLive()
}

func TestEnsureDMXLiveOutputNoInterfaceLeavesDisconnected(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.mu.Lock()
	c.settings = DefaultControllerSettings()
	c.settings.DMX.Enabled = true
	c.settings.DMX.UniverseInterfaces = map[string]DMXUniverseInterfaceSettings{
		DefaultDMXUniverseID: {
			SelectedUSBDeviceID: "",
			ArtNet:              ArtNetSettings{Enabled: false},
		},
	}
	c.mu.Unlock()

	if err := c.EnsureDMXLiveOutput(); err != nil {
		t.Fatalf("EnsureDMXLiveOutput: %v", err)
	}
	st := c.GetDMXLiveStatus()
	if st.Connected {
		t.Fatalf("expected disconnected with no interface, got %+v", st)
	}
}

func TestEnsureDMXLiveOutputDisabledStops(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.mu.Lock()
	c.settings = DefaultControllerSettings()
	c.settings.DMX.Enabled = true
	c.settings.DMX.Testing.SimulateUSBDMX = true
	c.settings.DMX.UniverseInterfaces = map[string]DMXUniverseInterfaceSettings{
		DefaultDMXUniverseID: {
			SelectedUSBDeviceID: simulatedUSBDMXDeviceID,
			ArtNet:              DefaultControllerSettings().DMX.ArtNet,
		},
	}
	c.dmxState = defaultDMXState()
	c.mu.Unlock()

	if err := c.EnsureDMXLiveOutput(); err != nil {
		t.Fatalf("EnsureDMXLiveOutput: %v", err)
	}

	c.mu.Lock()
	c.settings.DMX.Enabled = false
	c.mu.Unlock()

	if err := c.EnsureDMXLiveOutput(); err != nil {
		t.Fatalf("EnsureDMXLiveOutput when disabled: %v", err)
	}
	st := c.GetDMXLiveStatus()
	if st.Connected {
		t.Fatalf("expected disconnected when DMX disabled, got %+v", st)
	}
}

func TestStartDMXLiveRequiresAdapter(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.mu.Lock()
	c.settings = DefaultControllerSettings()
	c.settings.DMX.Enabled = true
	c.settings.DMX.UniverseInterfaces = map[string]DMXUniverseInterfaceSettings{
		DefaultDMXUniverseID: {
			SelectedUSBDeviceID: "",
			ArtNet:              ArtNetSettings{Enabled: false},
		},
	}
	c.mu.Unlock()

	if err := c.StartDMXLive(""); err == nil {
		t.Fatal("expected StartDMXLive to fail without adapters")
	}
}
