package controller

import (
	"io"
	"log"
	"testing"
)

func TestGetDMXUniverseFrameReturnsBuffer(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.mu.Lock()
	c.settings = DefaultControllerSettings()
	c.settings.DMX.Enabled = true
	c.dmxState = defaultDMXState()
	c.mu.Unlock()

	c.dmxLiveMu.Lock()
	rt := c.dmxLiveRuntime(DefaultDMXUniverseID)
	rt.buf[0] = 42
	rt.buf[39] = 200
	c.dmxLiveMu.Unlock()

	frame := c.GetDMXUniverseFrame(DefaultDMXUniverseID)
	if len(frame) != 512 {
		t.Fatalf("frame length = %d, want 512", len(frame))
	}
	if frame[0] != 42 {
		t.Fatalf("frame[0] = %d, want 42", frame[0])
	}
	if frame[39] != 200 {
		t.Fatalf("frame[39] = %d, want 200", frame[39])
	}
	if frame[1] != 0 {
		t.Fatalf("frame[1] = %d, want 0", frame[1])
	}

	// Empty universe id defaults to universe-1.
	frame2 := c.GetDMXUniverseFrame("")
	if frame2[0] != 42 || frame2[39] != 200 {
		t.Fatalf("empty universe id did not resolve to default: frame[0]=%d frame[39]=%d", frame2[0], frame2[39])
	}
}
