package controller

import (
	"goldbus/internal/dmx"
	"io"
	"log"
	"path/filepath"
	"testing"
	"time"
)

func testBuildDMXPartyFrame(c *WLEDController, state DMXPartyState, at time.Time) ([]dmx.DMXOutputUpdate, [512]bool) {
	c.mu.RLock()
	fixtures := append([]DMXFixture(nil), c.dmxState.Fixtures...)
	c.mu.RUnlock()
	targeted := filterPartyFixtures(fixtures, state.Config.FixtureIDs)
	if len(targeted) == 0 && len(fixtures) > 0 {
		targeted = fixtures
	}
	values := computePartyPhaseValues(state, at)
	var motionPhase float64
	var colorPhase float64
	advancePartyPhases(values, &motionPhase, &colorPhase)
	return c.buildDMXPartyFrame(state, motionPhase, colorPhase, values, targeted)
}

func TestCloneDMXStatePreservesPartyRuntime(t *testing.T) {
	st := DMXState{
		Fixtures: []DMXFixture{},
		Party: DMXPartyState{
			Config: defaultDMXPartyConfig(),
			Status: DMXPartyStatus{
				Running:           true,
				Mode:              DMXPartyModeAudio,
				AudioCapturing:    true,
				AudioNoSignal:     true,
				AudioCaptureError: "mic",
			},
		},
	}
	cloned := cloneDMXState(st)
	if !cloned.Party.Status.Running {
		t.Fatalf("expected clone to preserve party running flag for live API consumers")
	}
	if !cloned.Party.Status.AudioCapturing {
		t.Fatalf("expected clone to preserve audio capturing flag")
	}
	if !cloned.Party.Status.AudioNoSignal {
		t.Fatalf("expected clone to preserve audio no-signal flag")
	}
	if cloned.Party.Status.AudioCaptureError != "mic" {
		t.Fatalf("expected clone to preserve audio capture error, got %q", cloned.Party.Status.AudioCaptureError)
	}
	stripped := stripDMXPartyRuntimeForPersistence(cloned.Party)
	if stripped.Status.Running || stripped.Status.AudioCapturing || stripped.Status.AudioNoSignal || stripped.Status.AudioCaptureError != "" {
		t.Fatalf("strip for persistence should clear volatile status: %+v", stripped.Status)
	}
}

func TestNormalizeDMXPartyConfigClampsAndSanitizes(t *testing.T) {
	in := DMXPartyConfig{
		Enabled:            true,
		Mode:               DMXPartyMode("unknown"),
		FixtureIDs:         []string{"  fixture-1  ", "", "fixture-2", "fixture-1"},
		Intensity:          999,
		Speed:              -20,
		ColorVariation:     120,
		AudioSensitivity:   -9,
		AudioInputDeviceID: "  mic-1  ",
	}
	got := normalizeDMXPartyConfig(in)
	if got.Mode != DMXPartyModeAuto {
		t.Fatalf("expected fallback mode auto, got %q", got.Mode)
	}
	if got.Intensity != 100 || got.Speed != 0 || got.ColorVariation != 100 || got.AudioSensitivity != 0 {
		t.Fatalf("unexpected clamped values: %+v", got)
	}
	if got.AudioInputDeviceID != "mic-1" {
		t.Fatalf("expected trimmed audio input device id, got %q", got.AudioInputDeviceID)
	}
	if len(got.FixtureIDs) != 2 || got.FixtureIDs[0] != "fixture-1" || got.FixtureIDs[1] != "fixture-2" {
		t.Fatalf("unexpected fixture ids: %#v", got.FixtureIDs)
	}
}

func TestBuildDMXPartyFrameProducesBoundedValues(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.mu.Lock()
	c.settings.DMX.Enabled = true
	c.dmxState.Fixtures = []DMXFixture{
		{
			ID:         "fixture-1",
			Brand:      "Test",
			Name:       "Party Fixture",
			DMXAddress: 40,
			Channels: []DMXChannel{
				{Channel: 1, Type: "dimmer"},
				{Channel: 2, Type: "pan"},
				{Channel: 3, Type: "tilt"},
				{Channel: 4, Type: "colorWheel"},
				{Channel: 5, Type: "goboWheel"},
			},
		},
	}
	c.mu.Unlock()

	state := DMXPartyState{
		Config: DMXPartyConfig{
			Enabled:          true,
			Mode:             DMXPartyModeAudio,
			Intensity:        80,
			Speed:            60,
			ColorVariation:   70,
			AudioSensitivity: 50,
		},
		Audio: DMXPartyAudioFeatures{
			Level:      0.9,
			Bass:       0.8,
			Mid:        0.6,
			Treble:     0.4,
			Beat:       0.8,
			CapturedAt: time.Now(),
		},
	}
	updates, owned := testBuildDMXPartyFrame(c, state, time.Now())
	if len(updates) == 0 {
		t.Fatalf("expected non-empty updates")
	}
	if !owned[39] {
		t.Fatalf("expected party to own dimmer address 40")
	}
	for _, update := range updates {
		if update.Address < 1 || update.Address > 512 {
			t.Fatalf("address out of bounds: %d", update.Address)
		}
		if update.Value < 0 || update.Value > 255 {
			t.Fatalf("value out of bounds: %d", update.Value)
		}
	}
}

func TestPushDMXPartyAudioFeaturesClampsValues(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.dmxPersistence = &DMXPersistenceManager{path: filepath.Join(t.TempDir(), "dmx.json")}
	c.mu.Lock()
	c.settings.DMX.Enabled = true
	c.mu.Unlock()

	state, err := c.PushDMXPartyAudioFeatures(DMXPartyAudioFeatures{
		Level:    7.2,
		Bass:     -2,
		Mid:      1.2,
		Treble:   -0.4,
		Beat:     2.7,
		DeviceID: "  loopback-device ",
	})
	if err != nil {
		t.Fatalf("push audio features failed: %v", err)
	}
	if state.Audio.Level != 1 || state.Audio.Bass != 0 || state.Audio.Mid != 1 || state.Audio.Treble != 0 || state.Audio.Beat != 1 {
		t.Fatalf("unexpected clamped audio state: %+v", state.Audio)
	}
	if state.Status.AudioInputDeviceID != "loopback-device" {
		t.Fatalf("expected status device id from audio features, got %q", state.Status.AudioInputDeviceID)
	}
}

func TestApplyDMXLivePatchSkipsPartyOwnedAddresses(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.mu.Lock()
	c.settings.DMX.Enabled = true
	c.mu.Unlock()

	c.dmxLiveMu.Lock()
	c.dmxLiveRunning = true
	c.dmxLiveUSBFrames = make(chan [512]byte, 1)
	c.dmxLiveBuf[39] = 100
	c.dmxPartyRunning = true
	c.partyOwnedAddrs[39] = true
	c.dmxLiveMu.Unlock()

	if err := c.ApplyDMXLivePatch([]dmx.DMXOutputUpdate{{Address: 40, Value: 200}}); err != nil {
		t.Fatalf("apply patch failed: %v", err)
	}
	if c.dmxLiveBuf[39] != 100 {
		t.Fatalf("party-owned address should be unchanged, got %d", c.dmxLiveBuf[39])
	}

	if err := c.ApplyDMXLivePatch([]dmx.DMXOutputUpdate{{Address: 41, Value: 50}}); err != nil {
		t.Fatalf("apply patch failed: %v", err)
	}
	if c.dmxLiveBuf[40] != 50 {
		t.Fatalf("non-party address should update, got %d", c.dmxLiveBuf[40])
	}
}

func TestPartyAllowsChannelByFixtureType(t *testing.T) {
	if partyAllowsChannel(DMXFixtureTypeStrobe, "pan") {
		t.Fatalf("strobe profile should not include pan")
	}
	if !partyAllowsChannel(DMXFixtureTypeStrobe, "shutterStrobe") {
		t.Fatalf("strobe profile should include shutterStrobe")
	}
	if !partyAllowsChannel(DMXFixtureTypeMovingHead, "pan") {
		t.Fatalf("moving head profile should include pan")
	}
	if partyAllowsChannel(DMXFixtureTypeColorChanger, "pan") {
		t.Fatalf("color changer profile should not include pan")
	}
	if !partyAllowsChannel(DMXFixtureTypeColorChanger, "custom") {
		t.Fatalf("color changer profile should include custom channels")
	}
}

func TestPartyEntryMidAndSlotIndex(t *testing.T) {
	entries := []dmxPartyEntry{
		{From: 10, To: 20, Label: "Red"},
		{From: 30, To: 50, Label: "Blue"},
	}
	if got := partyEntryMid(entries, 0); got != 15 {
		t.Fatalf("expected mid 15, got %d", got)
	}
	if got := partyEntryMid(entries, 1); got != 40 {
		t.Fatalf("expected mid 40, got %d", got)
	}
	if got := partySlotIndex(12.5, 2, 0.5); got < 0 || got > 1 {
		t.Fatalf("slot index out of range: %d", got)
	}
}

func TestPartyColorWheelUsesEntries(t *testing.T) {
	ch := DMXChannel{
		Type: "colorWheel",
		Properties: map[string]any{
			"entries": []any{
				map[string]any{"from": 0, "to": 10, "label": "Open"},
				map[string]any{"from": 20, "to": 30, "label": "Red"},
			},
		},
	}
	got, ok := partyValueForFixtureChannel(
		DMXFixtureTypeMovingHead,
		ch,
		1.0,
		5.0,
		0.8,
		0.7,
		0.5,
		0.4,
		0.3,
		0.6,
	)
	if !ok {
		t.Fatalf("expected value for color wheel with entries")
	}
	if got != 15 && got != 25 {
		t.Fatalf("expected slot mid 15 or 25, got %d", got)
	}
}

func TestPartyGoboUsesMidForSlotAdvance(t *testing.T) {
	ch := DMXChannel{
		Type: "goboWheel",
		Properties: map[string]any{
			"entries": []any{
				map[string]any{"from": 0, "to": 0, "label": "Open"},
				map[string]any{"from": 50, "to": 50, "label": "Gobo 1"},
			},
		},
	}
	lowMid, ok := partyValueForFixtureChannel(
		DMXFixtureTypeMovingHead,
		ch,
		1.0,
		1.0,
		0.8,
		0.7,
		0.2,
		0.1,
		0.0,
		0.0,
	)
	if !ok {
		t.Fatalf("expected gobo value")
	}
	highMid, ok := partyValueForFixtureChannel(
		DMXFixtureTypeMovingHead,
		ch,
		20.0,
		1.0,
		0.8,
		0.7,
		0.2,
		0.9,
		0.0,
		0.0,
	)
	if !ok {
		t.Fatalf("expected gobo value with high mid")
	}
	if lowMid == highMid {
		t.Fatalf("expected different gobo slots for different motion phases, both got %d", lowMid)
	}
}

func TestBuildDMXPartyFrameStrobeProfileOmitsPan(t *testing.T) {
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.mu.Lock()
	c.settings.DMX.Enabled = true
	c.dmxState.Fixtures = []DMXFixture{
		{
			ID:         "strobe-1",
			Type:       DMXFixtureTypeStrobe,
			DMXAddress: 1,
			Channels: []DMXChannel{
				{Channel: 1, Type: "dimmer"},
				{Channel: 2, Type: "pan"},
				{Channel: 3, Type: "shutterStrobe"},
			},
		},
	}
	c.mu.Unlock()

	state := DMXPartyState{Config: defaultDMXPartyConfig()}
	updates, _ := testBuildDMXPartyFrame(c, state, time.Now())
	addresses := map[int]struct{}{}
	for _, update := range updates {
		addresses[update.Address] = struct{}{}
	}
	if _, ok := addresses[2]; ok {
		t.Fatalf("strobe fixture should not write pan channel")
	}
	if _, ok := addresses[1]; !ok {
		t.Fatalf("strobe fixture should write dimmer")
	}
	if _, ok := addresses[3]; !ok {
		t.Fatalf("strobe fixture should write shutter")
	}
}

func TestBuildDMXPartyFrameColorChangerCustomRGBW(t *testing.T) {
	c := &WLEDController{
		dmxState: DMXState{
			Fixtures: []DMXFixture{
				{
					ID:         "rgbw",
					Type:       DMXFixtureTypeColorChanger,
					DMXAddress: 1,
					Channels: []DMXChannel{
						{Channel: 1, Type: "custom", Properties: map[string]any{"label": "Rot"}},
						{Channel: 2, Type: "custom", Properties: map[string]any{"label": "Grün"}},
						{Channel: 3, Type: "custom", Properties: map[string]any{"label": "Blau"}},
						{Channel: 4, Type: "custom", Properties: map[string]any{"label": "Weiss"}},
						{Channel: 5, Type: "dimmer", Properties: map[string]any{"min": 0, "max": 255}},
					},
				},
			},
		},
	}
	state := DMXPartyState{Config: defaultDMXPartyConfig()}
	updates, owned := testBuildDMXPartyFrame(c, state, time.Now())
	addresses := map[int]int{}
	for _, update := range updates {
		addresses[update.Address] = update.Value
	}
	for addr := 1; addr <= 5; addr++ {
		if _, ok := addresses[addr]; !ok {
			t.Fatalf("expected party to drive address %d", addr)
		}
		if !owned[addr-1] {
			t.Fatalf("expected party to own address %d", addr)
		}
	}
}

func TestBuildDMXPartyFrameSkipsCustomExcludedFromParty(t *testing.T) {
	c := &WLEDController{
		dmxState: DMXState{
			Fixtures: []DMXFixture{
				{
					ID:         "rgbw",
					Type:       DMXFixtureTypeColorChanger,
					DMXAddress: 1,
					Channels: []DMXChannel{
						{Channel: 1, Type: "custom", Properties: map[string]any{"label": "Rot", "partyInclude": true}},
						{Channel: 2, Type: "custom", Properties: map[string]any{"label": "Grün", "partyInclude": false}},
						{Channel: 3, Type: "custom", Properties: map[string]any{"label": "Blau", "partyInclude": true}},
					},
				},
			},
		},
	}
	state := DMXPartyState{Config: defaultDMXPartyConfig()}
	updates, owned := testBuildDMXPartyFrame(c, state, time.Now())
	addresses := map[int]struct{}{}
	for _, update := range updates {
		addresses[update.Address] = struct{}{}
	}
	if _, ok := addresses[1]; !ok {
		t.Fatalf("expected party on red")
	}
	if _, ok := addresses[2]; ok {
		t.Fatalf("green should be excluded from party")
	}
	if _, ok := addresses[3]; !ok {
		t.Fatalf("expected party on blue")
	}
	if !owned[0] {
		t.Fatalf("expected party to own address 1")
	}
	if owned[1] {
		t.Fatalf("party should not own excluded green address")
	}
	if !owned[2] {
		t.Fatalf("expected party to own address 3")
	}
}

func TestFilterPartyWLEDDevices(t *testing.T) {
	devices := map[string]WLEDDevice{
		"a": {ID: "a", Name: "Alpha", Online: true},
		"b": {ID: "b", Name: "Beta", Online: true, Ignored: true},
		"c": {ID: "c", Name: "Gamma", Online: false},
	}
	got := filterPartyWLEDDevices(devices, []string{"a", "b", "c", "missing"})
	if len(got) != 1 || got[0].ID != "a" {
		t.Fatalf("expected only online non-ignored device a, got %#v", got)
	}
	if empty := filterPartyWLEDDevices(devices, nil); len(empty) != 0 {
		t.Fatalf("expected empty for nil ids, got %#v", empty)
	}
}

func TestPartyHueToRGB(t *testing.T) {
	r, g, b := partyHueToRGB(0)
	if r != 255 || g != 0 || b != 0 {
		t.Fatalf("expected red at hue 0, got %d,%d,%d", r, g, b)
	}
	r, g, b = partyHueToRGB(120)
	if g < 200 || r > 50 {
		t.Fatalf("expected greenish at hue 120, got %d,%d,%d", r, g, b)
	}
}
