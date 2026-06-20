package audio

import (
	"math"
	"testing"
)

func TestExtractPartyFeaturesSilence(t *testing.T) {
	samples := make([]int16, featureFFTSize)
	got := ExtractPartyFeatures(samples)
	if got.Level != 0 || got.Bass != 0 || got.Beat != 0 {
		t.Fatalf("expected zero features for silence, got %+v", got)
	}
}

func TestExtractPartyFeaturesTone(t *testing.T) {
	samples := make([]int16, featureFFTSize)
	for i := range samples {
		samples[i] = int16(12000 * math.Sin(2*math.Pi*220*float64(i)/44100))
	}
	got := ExtractPartyFeatures(samples)
	if got.Level <= 0 {
		t.Fatalf("expected non-zero level for tone, got %+v", got)
	}
}

func TestExtractPartyFeaturesUsesRecentSamples(t *testing.T) {
	samples := make([]int16, 4096)
	for i := 4096 - featureFFTSize; i < 4096; i++ {
		samples[i] = int16(16000 * math.Sin(2*math.Pi*60*float64(i)/44100))
	}
	got := ExtractPartyFeatures(samples)
	empty := ExtractPartyFeatures(make([]int16, 4096))
	if got.Bass <= empty.Bass {
		t.Fatalf("expected bass from recent tone, got %v vs empty %v", got.Bass, empty.Bass)
	}
}

func TestIsLoopbackDeviceName(t *testing.T) {
	if !isLoopbackDeviceName("BlackHole 2ch") {
		t.Fatalf("expected BlackHole to match loopback")
	}
	if isLoopbackDeviceName("MacBook Pro Microphone") {
		t.Fatalf("expected built-in mic not to match loopback")
	}
}

func TestClassifyUSBMic(t *testing.T) {
	if !classifyUSBMic(false, false, false, "Blue Yeti USB") {
		t.Fatalf("expected Blue Yeti to classify as USB")
	}
	if classifyUSBMic(false, true, true, "MacBook Pro Microphone") {
		t.Fatalf("expected built-in mic not to classify as USB")
	}
	if !classifyUSBMic(false, false, true, "USB Audio Device") {
		t.Fatalf("expected USB Audio Device to classify as USB even when default")
	}
	if classifyUSBMic(true, false, false, "BlackHole") {
		t.Fatalf("loopback should not classify as USB")
	}
}

func TestPickUSBMicDevice(t *testing.T) {
	devices := []InputDevice{
		{Name: "MacBook Microphone", IsBuiltin: true, IsDefault: true},
		{Name: "Blue Yeti", IsUSB: true},
		{Name: "Generic USB Mic", IsUSB: true},
	}
	picked := PickUSBMicDevice(devices)
	if picked == nil || picked.Name != "Blue Yeti" {
		t.Fatalf("expected Blue Yeti, got %#v", picked)
	}
}
