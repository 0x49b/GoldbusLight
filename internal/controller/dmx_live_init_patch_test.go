package controller

import (
	"testing"
)

func TestWLEDBootPresetSlot(t *testing.T) {
	if got := wledBootPresetSlot(nil); got != 1 {
		t.Fatalf("nil lastState: got %d", got)
	}
	if got := wledBootPresetSlot(map[string]any{"ps": float64(7)}); got != 7 {
		t.Fatalf("ps=7: got %d", got)
	}
	if got := wledBootPresetSlot(map[string]any{"ps": 0}); got != 1 {
		t.Fatalf("ps=0 should fall back: got %d", got)
	}
	if got := wledBootPresetSlot(map[string]any{"ps": 251}); got != 1 {
		t.Fatalf("ps out of range: got %d", got)
	}
}

func TestBuildDMXLiveInitUpdatesDimmer(t *testing.T) {
	fix := DMXFixture{
		ID:         "f1",
		Type:       DMXFixtureTypeDimmer,
		Brand:      "b",
		Name:       "n",
		DMXAddress: 10,
		Channels: []DMXChannel{
			{Channel: 1, Type: "dimmer", Properties: map[string]any{"min": 0, "max": 255}},
		},
	}
	updates := buildDMXLiveInitUpdates([]DMXFixture{fix})
	if len(updates) != 1 || updates[0].Address != 10 || updates[0].Value != 255 {
		t.Fatalf("unexpected updates: %+v", updates)
	}
}

func TestLiveInitParseEntrySlotKindsSmokeFogVolumeIsSlider(t *testing.T) {
	props := map[string]any{
		"entries": []any{
			map[string]any{"from": 0, "to": 0, "label": "Off"},
			map[string]any{"from": 1, "to": 255, "label": "Volume", "liveSlotKind": "button"},
		},
	}
	entries := liveInitParseEntries(props)
	kinds := liveInitParseEntrySlotKinds(props, entries)
	if len(kinds) != 2 {
		t.Fatalf("expected 2 kinds, got %v", kinds)
	}
	if kinds[0] != "button" {
		t.Fatalf("off slot: got %q", kinds[0])
	}
	if kinds[1] != "slider" {
		t.Fatalf("volume slot with wide range saved as button must coerce to slider: got %q", kinds[1])
	}
}
