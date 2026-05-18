package controller

import (
	"io"
	"log"
	"testing"
)

func TestListUSBSerialDevicesIncludesSimulatorWhenEnabled(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.mu.Lock()
	c.settings.DMX.Testing.SimulateUSBDMX = true
	c.mu.Unlock()

	devices := c.ListUSBSerialDevices()
	for _, dev := range devices {
		if dev.ID == simulatedUSBDMXDeviceID {
			if dev.Path != simulatedUSBDMXPath {
				t.Fatalf("simulated USB path mismatch: got %q want %q", dev.Path, simulatedUSBDMXPath)
			}
			return
		}
	}
	t.Fatalf("expected simulated USB device %q to be listed", simulatedUSBDMXDeviceID)
}

func TestListUSBSerialDevicesOmitsSimulatorWhenDisabled(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.mu.Lock()
	c.settings.DMX.Testing.SimulateUSBDMX = false
	c.mu.Unlock()

	devices := c.ListUSBSerialDevices()
	for _, dev := range devices {
		if dev.ID == simulatedUSBDMXDeviceID {
			t.Fatalf("did not expect simulated USB device %q when simulator is disabled", simulatedUSBDMXDeviceID)
		}
	}
}
