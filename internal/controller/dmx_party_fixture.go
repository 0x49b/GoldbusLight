package controller

import (
	"math"
	"strconv"
	"strings"
	"time"
)

// DMXFixtureParty holds per-fixture tuning for the party algorithm (auto and audio).
type DMXFixtureParty struct {
	// ChannelWeights maps fixture-relative channel offset (same as DMXChannel.Channel, JSON string key) to 0–100.
	// 100 is full motion (default); 0 freezes the channel near its default / neutral value.
	ChannelWeights map[string]int `json:"channelWeights,omitempty"`
	// StrobeEnabled selects timed shutter strobing for shutter/strobe channels and matching custom labels.
	StrobeEnabled bool `json:"strobeEnabled,omitempty"`
	// StrobeOnMs is how long each strobe burst stays on (milliseconds).
	StrobeOnMS int `json:"strobeOnMs,omitempty"`
	// StrobeOffMs is the pause between bursts (milliseconds).
	StrobeOffMS int `json:"strobeOffMs,omitempty"`
	// PresetSequence, when enabled, steps the fixture through a series of saved poses
	// (e.g. moving-head pan/tilt positions) during party mode, overriding the generative
	// algorithm for the channels it covers.
	PresetSequence DMXFixturePresetSequence `json:"presetSequence,omitempty"`
}

func normalizeFixtureParty(p DMXFixtureParty) DMXFixtureParty {
	out := p
	if out.ChannelWeights != nil {
		next := make(map[string]int, len(out.ChannelWeights))
		for k, v := range out.ChannelWeights {
			key := strings.TrimSpace(k)
			if key == "" {
				continue
			}
			if v < 0 {
				v = 0
			}
			if v > 100 {
				v = 100
			}
			next[key] = v
		}
		out.ChannelWeights = next
	}
	if out.StrobeEnabled {
		if out.StrobeOnMS < 20 {
			out.StrobeOnMS = 80
		}
		if out.StrobeOffMS < 20 {
			out.StrobeOffMS = 400
		}
	}
	if out.StrobeOnMS > 8000 {
		out.StrobeOnMS = 8000
	}
	if out.StrobeOffMS > 15000 {
		out.StrobeOffMS = 15000
	}
	out.PresetSequence = normalizeFixturePresetSequence(out.PresetSequence)
	return out
}

func fixturePartyChannelWeightPercent(p DMXFixtureParty, channelIdx int) int {
	p = normalizeFixtureParty(p)
	if p.ChannelWeights == nil {
		return 100
	}
	if v, ok := p.ChannelWeights[strconv.Itoa(channelIdx)]; ok {
		return v
	}
	return 100
}

func applyPartyChannelMotionWeight(neutral int, animated int, weightPct int) int {
	if weightPct >= 100 {
		return animated
	}
	if weightPct <= 0 {
		return neutral
	}
	f := float64(weightPct) / 100.0
	out := float64(neutral) + float64(animated-neutral)*f
	return clampDMXByte(int(math.Round(out)))
}

func partyWeightNeutralByte(ch DMXChannel, normType string, fixtureType DMXFixtureType) int {
	if ch.DefaultValue != nil {
		v := *ch.DefaultValue
		if v >= 0 && v <= 255 {
			return v
		}
	}
	switch normType {
	case "pan", "tilt", "infinitepan", "infinitetilt", "panfine", "tiltfine":
		return 128
	case "dimmer", "dimmerfine", "fog":
		return 0
	case "onoff", "lamp":
		return 0
	case "colorcomponent", "colorwheel", "colortemperature", "greensaturation", "xfadetocolor":
		return 0
	case "gobowheel", "goboindexing", "goborotation", "goboshake":
		return 0
	case "shutterstrobe":
		return 0
	case "zoom", "focus", "frost", "iris", "prism", "prismrotation":
		return 0
	case "movementspeed":
		return 128
	default:
		if fixtureType == DMXFixtureTypeColorChanger || fixtureType == DMXFixtureTypeLEDBarBeams || fixtureType == DMXFixtureTypeLEDBarPixels {
			return 0
		}
		return 0
	}
}

const (
	defaultPartySmokeBurstOnMS  = 2500
	defaultPartySmokeBurstOffMS = 45000
	defaultPartySmokeVolume     = 55
)

func normalizePartySmokeBurstMS(onMS, offMS int) (int, int) {
	if onMS <= 0 {
		onMS = defaultPartySmokeBurstOnMS
	}
	if offMS <= 0 {
		offMS = defaultPartySmokeBurstOffMS
	}
	if onMS < 200 {
		onMS = 200
	}
	if onMS > 15000 {
		onMS = 15000
	}
	if offMS < 1000 {
		offMS = 1000
	}
	if offMS > 300000 {
		offMS = 300000
	}
	return onMS, offMS
}

func partySmokeGateMS(cfg DMXPartyConfig, anchor time.Time, now time.Time) bool {
	on, off := normalizePartySmokeBurstMS(cfg.SmokeBurstOnMS, cfg.SmokeBurstOffMS)
	period := int64(on + off)
	if period <= 0 {
		return false
	}
	var ms int64
	if anchor.IsZero() {
		ms = now.UnixMilli() % period
	} else {
		ms = now.Sub(anchor).Milliseconds() % period
		if ms < 0 {
			ms += period
		}
	}
	return ms < int64(on)
}

func partySmokeFixtureOutput(cfg DMXPartyConfig, ch DMXChannel, normType string, anchor time.Time, now time.Time) int {
	if !partySmokeGateMS(cfg, anchor, now) {
		return 0
	}
	vol := float64(clampPercent(cfg.SmokeVolume)) / 100.0
	if vol <= 0 {
		return 0
	}
	if normType == "fog" {
		return partyFogVolumeByte(ch, vol)
	}
	return clampDMXByte(int(math.Round(vol * 255)))
}

func partyFogVolumeByte(ch DMXChannel, volume01 float64) int {
	r := liveInitSmokeFogOutputRange(ch.Properties)
	if r == nil {
		return clampDMXByte(int(math.Round(clampFloat(volume01, 0, 1) * 255)))
	}
	t := clampFloat(volume01, 0, 1)
	if t <= 0 {
		return 0
	}
	return clampDMXByte(int(math.Round(float64(r.min) + t*float64(r.max-r.min))))
}

func partyStrobeGateMS(fp DMXFixtureParty, now time.Time) bool {
	fp = normalizeFixtureParty(fp)
	if !fp.StrobeEnabled {
		return false
	}
	on := fp.StrobeOnMS
	off := fp.StrobeOffMS
	if on < 20 {
		on = 80
	}
	if off < 20 {
		off = 400
	}
	period := int64(on + off)
	if period <= 0 {
		return false
	}
	ms := now.UnixMilli() % period
	return ms < int64(on)
}
