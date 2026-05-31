package controller

import (
	"testing"
	"time"
)

func TestNormalizeFixturePresetSequence(t *testing.T) {
	in := DMXFixturePresetSequence{
		Enabled: true,
		StepMS:  10, // below min
		FadeMS:  -5,
		Presets: []DMXFixturePreset{
			{Values: map[string]int{"1": 300, "2": -4, "x": 10, " ": 5}},
		},
		ChannelBehaviors: map[string]string{
			"3":   "RANDOM",
			"4":   "exclude", // default → dropped
			"5":   "bogus",   // invalid → dropped
			"bad": "random",  // non-numeric key → dropped
		},
	}
	out := normalizeFixturePresetSequence(in)

	if out.StepMS != minPresetStepMS {
		t.Fatalf("StepMS = %d, want %d", out.StepMS, minPresetStepMS)
	}
	if out.FadeMS != 0 {
		t.Fatalf("FadeMS = %d, want 0", out.FadeMS)
	}
	if len(out.Presets) != 1 {
		t.Fatalf("Presets len = %d, want 1", len(out.Presets))
	}
	p := out.Presets[0]
	if p.ID == "" {
		t.Fatal("preset ID should be auto-assigned")
	}
	if got := p.Values["1"]; got != 255 {
		t.Fatalf("value[1] = %d, want 255 (clamped)", got)
	}
	if got := p.Values["2"]; got != 0 {
		t.Fatalf("value[2] = %d, want 0 (clamped)", got)
	}
	if _, ok := p.Values["x"]; ok {
		t.Fatal("non-numeric value key should be dropped")
	}
	if len(out.ChannelBehaviors) != 1 || out.ChannelBehaviors["3"] != PresetChannelBehaviorRandom {
		t.Fatalf("ChannelBehaviors = %#v, want only {3: random}", out.ChannelBehaviors)
	}
}

func TestNormalizeFixturePresetSequenceDisablesWithoutPresets(t *testing.T) {
	out := normalizeFixturePresetSequence(DMXFixturePresetSequence{Enabled: true})
	if out.Enabled {
		t.Fatal("sequence with no presets must be disabled")
	}
	if presetSequenceActive(out) {
		t.Fatal("presetSequenceActive should be false without presets")
	}
}

func TestComputePresetSequenceFrameStepping(t *testing.T) {
	seq := normalizeFixturePresetSequence(DMXFixturePresetSequence{
		Enabled: true,
		StepMS:  1000,
		FadeMS:  0,
		Presets: []DMXFixturePreset{
			{ID: "a", Values: map[string]int{"1": 10}},
			{ID: "b", Values: map[string]int{"1": 20}},
			{ID: "c", Values: map[string]int{"1": 30}},
		},
	})
	anchor := time.Unix(0, 0)

	cases := []struct {
		ms      int64
		wantIdx string
	}{
		{0, "a"},
		{500, "a"},
		{1000, "b"},
		{2200, "c"},
		{3000, "a"}, // wraps around
	}
	for _, tc := range cases {
		frame, ok := computePresetSequenceFrame(seq, anchor, anchor.Add(time.Duration(tc.ms)*time.Millisecond))
		if !ok {
			t.Fatalf("ms=%d: frame not ok", tc.ms)
		}
		if frame.curr.ID != tc.wantIdx {
			t.Fatalf("ms=%d: curr=%s, want %s", tc.ms, frame.curr.ID, tc.wantIdx)
		}
	}
}

func TestPresetSequenceChannelValueCrossfade(t *testing.T) {
	seq := normalizeFixturePresetSequence(DMXFixturePresetSequence{
		Enabled: true,
		StepMS:  1000,
		FadeMS:  500,
		Presets: []DMXFixturePreset{
			{ID: "a", Values: map[string]int{"1": 0}},
			{ID: "b", Values: map[string]int{"1": 100}},
		},
	})
	anchor := time.Unix(0, 0)

	// At t=1000ms we enter pose b; halfway through the 500ms fade (t=1250ms) the
	// channel should be midway between pose a (0) and pose b (100).
	frame, ok := computePresetSequenceFrame(seq, anchor, anchor.Add(1250*time.Millisecond))
	if !ok {
		t.Fatal("frame not ok")
	}
	v, owned := presetSequenceChannelValue(seq, frame, "fx", 1)
	if !owned {
		t.Fatal("pinned channel should be owned")
	}
	if v < 45 || v > 55 {
		t.Fatalf("crossfade value = %d, want ~50", v)
	}

	// After the fade completes the value settles on pose b.
	frame, _ = computePresetSequenceFrame(seq, anchor, anchor.Add(1800*time.Millisecond))
	v, _ = presetSequenceChannelValue(seq, frame, "fx", 1)
	if v != 100 {
		t.Fatalf("settled value = %d, want 100", v)
	}
}

func TestPresetSequenceChannelValueBehaviors(t *testing.T) {
	seq := normalizeFixturePresetSequence(DMXFixturePresetSequence{
		Enabled: true,
		StepMS:  1000,
		Presets: []DMXFixturePreset{
			{ID: "a", Values: map[string]int{"1": 200}},
		},
		ChannelBehaviors: map[string]string{"2": "random"},
	})
	anchor := time.Unix(0, 0)
	frame, _ := computePresetSequenceFrame(seq, anchor, anchor.Add(100*time.Millisecond))

	// Channel 1 is pinned by the pose.
	if v, owned := presetSequenceChannelValue(seq, frame, "fx", 1); !owned || v != 200 {
		t.Fatalf("pinned channel: v=%d owned=%v, want 200/true", v, owned)
	}
	// Channel 2 is random → owned, value within range.
	if v, owned := presetSequenceChannelValue(seq, frame, "fx", 2); !owned || v < 0 || v > 255 {
		t.Fatalf("random channel: v=%d owned=%v", v, owned)
	}
	// Channel 3 is unspecified → excluded (not owned).
	if _, owned := presetSequenceChannelValue(seq, frame, "fx", 3); owned {
		t.Fatal("unspecified channel should be excluded")
	}
}

func TestBuildPresetSequenceUpdates(t *testing.T) {
	seq := normalizeFixturePresetSequence(DMXFixturePresetSequence{
		Enabled: true,
		StepMS:  1000,
		Presets: []DMXFixturePreset{
			{ID: "a", Values: map[string]int{"1": 11, "2": 22}},
		},
		ChannelBehaviors: map[string]string{"3": "random"},
	})
	fixture := DMXFixture{
		ID:         "fx",
		DMXAddress: 10,
		Channels: []DMXChannel{
			{Channel: 1, Type: "pan"},
			{Channel: 2, Type: "tilt"},
			{Channel: 3, Type: "dimmer"},
			{Channel: 4, Type: "colorWheel"}, // excluded by default
		},
	}
	anchor := time.Unix(0, 0)
	var owned [512]bool
	updates := buildPresetSequenceUpdates(fixture, seq, anchor, anchor.Add(100*time.Millisecond), &owned)

	byAddr := map[int]int{}
	for _, u := range updates {
		byAddr[u.Address] = u.Value
	}
	if byAddr[10] != 11 {
		t.Fatalf("addr 10 (offset 1) = %d, want 11", byAddr[10])
	}
	if byAddr[11] != 22 {
		t.Fatalf("addr 11 (offset 2) = %d, want 22", byAddr[11])
	}
	if _, ok := byAddr[12]; !ok {
		t.Fatal("addr 12 (offset 3, random) should be present")
	}
	if _, ok := byAddr[13]; ok {
		t.Fatal("addr 13 (offset 4, excluded) should be absent")
	}
	if !owned[9] || !owned[10] || !owned[11] {
		t.Fatal("pinned/random slots should be owned")
	}
	if owned[12] {
		t.Fatal("excluded slot should not be owned")
	}
}
