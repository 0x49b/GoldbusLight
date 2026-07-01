package controller

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBuildDMXLiveInitUpdatesIdealightSpot575(t *testing.T) {
	root := filepath.Join("..", "..", "test", "data", "fixtures", "idealight-1-spot-575.json")
	raw, err := os.ReadFile(root)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var payload struct {
		Type       string `json:"type"`
		Brand      string `json:"brand"`
		Name       string `json:"name"`
		DMXAddress int    `json:"dmxAddress"`
		Channels   []DMXChannel
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	fix := DMXFixture{
		ID:         "idealight",
		Type:       DMXFixtureTypeMovingHead,
		Brand:      payload.Brand,
		Name:       payload.Name,
		DMXAddress: payload.DMXAddress,
		Channels:   payload.Channels,
	}
	updates := buildDMXLiveInitUpdates([]DMXFixture{fix})
	byAddr := map[int]int{}
	for _, u := range updates {
		byAddr[u.Address] = u.Value
	}

	if len(byAddr) != 11 {
		t.Fatalf("expected 11 patched channels, got %d: %+v", len(byAddr), byAddr)
	}
	// Pan / tilt use explicit fixture defaults.
	if byAddr[1] != 128 {
		t.Fatalf("pan default expected 128, got %d", byAddr[1])
	}
	if byAddr[2] != 128 {
		t.Fatalf("tilt default expected 128, got %d", byAddr[2])
	}
	// Dimmer & strobe (ch4) starts at full bright.
	if byAddr[4] != 255 {
		t.Fatalf("dimmer & strobe default expected 255, got %d", byAddr[4])
	}
	// Linsen button-slider (ch11) uses explicit default 0.
	if byAddr[11] != 0 {
		t.Fatalf("linsen default expected 0, got %d", byAddr[11])
	}
	// Color wheel (ch14) without defaultValue picks the midpoint of the first slot (0-9).
	if byAddr[14] != 5 {
		t.Fatalf("color wheel open slot midpoint expected 5, got %d", byAddr[14])
	}
}
