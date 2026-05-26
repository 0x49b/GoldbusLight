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
