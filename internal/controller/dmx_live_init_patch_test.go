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

func TestWLEDBootRestorePayloadPrefersLastStateLookOverPreset(t *testing.T) {
	last := map[string]any{
		"on":  true,
		"bri": 200,
		"ps":  1, // leftover from a previous boot recall — must not win over white solid
		"seg": []any{
			map[string]any{
				"id":  0,
				"fx":  0,
				"col": []any{[]any{255, 233, 217}},
			},
		},
	}
	payload := wledBootRestorePayload(last)
	if _, hasPS := payload["ps"]; hasPS {
		t.Fatalf("expected ps omitted when replaying session look, got %#v", payload)
	}
	seg, ok := payload["seg"].([]any)
	if !ok || len(seg) == 0 {
		t.Fatalf("expected seg in restore payload, got %#v", payload)
	}
	first, ok := seg[0].(map[string]any)
	if !ok {
		t.Fatalf("expected seg[0] map, got %#v", seg[0])
	}
	col, ok := first["col"].([]any)
	if !ok || len(col) == 0 {
		t.Fatalf("expected col in seg, got %#v", first)
	}
	rgb, ok := col[0].([]any)
	if !ok || len(rgb) < 3 {
		t.Fatalf("expected rgb triple, got %#v", col[0])
	}
	if int(rgb[0].(float64)) != 255 || int(rgb[1].(float64)) != 233 || int(rgb[2].(float64)) != 217 {
		// json round-trip via cloneJSONMap may keep ints — accept both
		r, _ := intFromAny(rgb[0])
		g, _ := intFromAny(rgb[1])
		b, _ := intFromAny(rgb[2])
		if r != 255 || g != 233 || b != 217 {
			t.Fatalf("expected white rgb, got %v", rgb)
		}
	}
}

func TestWLEDBootRestorePayloadFallsBackToPresetWithoutLook(t *testing.T) {
	payload := wledBootRestorePayload(map[string]any{"ps": 4})
	if got, ok := payload["ps"]; !ok {
		t.Fatalf("expected ps fallback payload, got %#v", payload)
	} else if n, ok := intFromAny(got); !ok || n != 4 {
		t.Fatalf("expected ps=4, got %#v", got)
	}
	payload = wledBootRestorePayload(nil)
	if n, ok := intFromAny(payload["ps"]); !ok || n != 1 {
		t.Fatalf("expected default ps=1, got %#v", payload)
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
