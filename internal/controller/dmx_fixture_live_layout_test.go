package controller

import (
	"io"
	"log"
	"testing"
)

func TestNewWLEDControllerInitializesLiveLayoutPersistence(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	if c.dmxLiveLayoutPersistence == nil {
		t.Fatal("dmxLiveLayoutPersistence must be initialized in NewWLEDController")
	}
	got, err := c.GetDMXFixtureLiveLayoutJSON("fixture-1")
	if err != nil {
		t.Fatalf("GetDMXFixtureLiveLayoutJSON: %v", err)
	}
	if got != "{}" {
		t.Fatalf("expected empty layout {}, got %q", got)
	}
}
