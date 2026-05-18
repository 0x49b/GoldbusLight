package controller

import (
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
	updates := c.buildDMXPartyFrame(state, time.Now(), &motionPhase, &colorPhase)
	if len(updates) == 0 {
		t.Fatalf("expected non-empty updates")
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
