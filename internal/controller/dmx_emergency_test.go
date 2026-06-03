package controller

import (
	"io"
	"log"
	"testing"
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
	c.dmxLiveUSBFrames = make(chan [512]byte, 1)
	c.dmxLiveBuf[10] = 200
	c.dmxPartyRunning = true
	c.partyOwnedAddrs[10] = true
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
	for i, b := range c.dmxLiveBuf {
		if b != 0 {
			t.Fatalf("expected blackout at ch %d, got %d", i+1, b)
		}
	}
}
