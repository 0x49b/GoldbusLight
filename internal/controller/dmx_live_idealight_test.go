package controller

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBuildDMXLiveInitUpdatesIdealightSpot575(t *testing.T) {
	root := filepath.Join("..", "..", "fixtures", "idealight-spot-575.json")
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
	// Shutter ch8 @ base 7 -> addr 14, open range
	if v := byAddr[14]; v < 32 || v > 63 {
		t.Fatalf("shutter open expected 32-63, got %d", v)
	}
	// Pan fine mirrors pan
	if byAddr[7] != byAddr[8] {
		t.Fatalf("pan fine should mirror pan: %d vs %d", byAddr[7], byAddr[8])
	}
	// Prism ch11 -> addr 17
	if _, ok := byAddr[17]; !ok {
		t.Fatalf("prism channel not patched")
	}
}
