package controller

import (
	"io"
	"log"
	"testing"

	serial2 "goldbus/internal/serial"
)

func TestDMXEmergencyStopClearsPartyAndBlackouts(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.mu.Lock()
	c.settings.DMX.Enabled = true
	c.dmxState.Party.Config.Enabled = true
	c.dmxState.Party.Status.Running = true
	c.mu.Unlock()

	c.dmxLiveMu.Lock()
	c.dmxLiveRunning = true
	rt := c.dmxLiveRuntime(DefaultDMXUniverseID)
	rt.usbFrames = make(chan [512]byte, 1)
	rt.buf[10] = 200
	c.dmxPartyRunning = true
	if c.partyOwnedByUniverse == nil {
		c.partyOwnedByUniverse = map[string][512]bool{}
	}
	owned := c.partyOwnedByUniverse[DefaultDMXUniverseID]
	owned[10] = true
	c.partyOwnedByUniverse[DefaultDMXUniverseID] = owned
	c.dmxLiveMu.Unlock()

	if err := c.DMXEmergencyStop(); err != nil {
		t.Fatalf("DMXEmergencyStop failed: %v", err)
	}

	st := c.GetDMXPartyState()
	if st.Config.Enabled || st.Status.Running {
		t.Fatalf("expected party stopped, got %+v", st)
	}

	c.dmxLiveMu.Lock()
	defer c.dmxLiveMu.Unlock()
	if c.dmxLiveRunning {
		t.Fatal("expected live output stopped")
	}
	if c.dmxPartyRunning {
		t.Fatal("expected party worker flag cleared")
	}
}

func TestDMXEmergencyStopWithUSBSimulatorWorker(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.mu.Lock()
	c.settings = DefaultControllerSettings()
	c.settings.DMX.Enabled = true
	c.settings.DMX.UniverseInterfaces = map[string]DMXUniverseInterfaceSettings{
		DefaultDMXUniverseID: {
			SelectedUSBDeviceID: simulatedUSBDMXDeviceID,
			ArtNet:              DefaultControllerSettings().DMX.ArtNet,
		},
	}
	c.dmxState = defaultDMXState()
	c.mu.Unlock()

	c.dmxLiveMu.Lock()
	c.dmxLiveRunning = true
	c.dmxLiveMu.Unlock()

	if err := c.startDMXUSBSimulatorForUniverse(DefaultDMXUniverseID, serial2.USBSerialDevice{
		ID:   simulatedUSBDMXDeviceID,
		Path: simulatedUSBDMXPath,
		Name: simulatedUSBDMXName,
	}); err != nil {
		t.Fatalf("startDMXUSBSimulatorForUniverse: %v", err)
	}

	if err := c.DMXEmergencyStop(); err != nil {
		t.Fatalf("DMXEmergencyStop failed: %v", err)
	}

	c.dmxLiveMu.Lock()
	defer c.dmxLiveMu.Unlock()
	if c.dmxLiveRunning {
		t.Fatal("expected live output stopped")
	}
}
