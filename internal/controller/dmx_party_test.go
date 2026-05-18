package controller

import (
	"goldbus/internal/dmx"
	"io"
	"log"
	"path/filepath"
	"testing"
	"time"
)

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
	var motionPhase float64
	var colorPhase float64
	updates, owned := c.buildDMXPartyFrame(state, time.Now(), &motionPhase, &colorPhase)
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
	var motionPhase float64
	var colorPhase float64
	updates, _ := c.buildDMXPartyFrame(state, time.Now(), &motionPhase, &colorPhase)
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
