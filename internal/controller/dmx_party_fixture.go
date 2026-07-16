package controller

import (
	"encoding/json"
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
	// CueSequence, when enabled, steps the fixture through a series of saved poses
	// (e.g. moving-head pan/tilt positions) during party mode, overriding the generative
	// algorithm for the channels it covers.
	CueSequence DMXFixtureCueSequence `json:"cueSequence,omitempty"`
}

// UnmarshalJSON accepts both the current "cueSequence" key and the legacy
// "presetSequence" key (cues were formerly called presets), so saved state written
// before the rename still loads. The current key takes precedence when both appear.
func (p *DMXFixtureParty) UnmarshalJSON(data []byte) error {
	type alias DMXFixtureParty
	aux := struct {
		alias
		LegacyCueSequence *DMXFixtureCueSequence `json:"presetSequence"`
	}{}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	*p = DMXFixtureParty(aux.alias)
	// Old files carry only "presetSequence"; new files only "cueSequence". Adopt the
	// legacy value when the current key did not populate anything.
	if aux.LegacyCueSequence != nil && len(p.CueSequence.Cues) == 0 && !p.CueSequence.Enabled {
		p.CueSequence = *aux.LegacyCueSequence
	}
	return nil
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
	out.CueSequence = normalizeFixtureCueSequence(out.CueSequence)
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
	defaultPartyMovementRange   = 70
	defaultPartyMovementAngleLimitDeg = 45
)

// partySweepRange maps the configured MovementRange (0–100) to a 0..1 sweep amplitude.
func partySweepRange(cfg DMXPartyConfig) float64 {
	r := cfg.MovementRange
	if r <= 0 {
		r = defaultPartyMovementRange
	}
	if r > 100 {
		r = 100
	}
	return float64(r) / 100.0
}

// partyPanTiltInvertProps returns the channel properties that govern axis inversion.
// Fine pan/tilt channels inherit invert from their coarse partner.
func partyPanTiltInvertProps(fixture DMXFixture, ch DMXChannel) map[string]any {
	norm := strings.ToLower(strings.TrimSpace(ch.Type))
	if norm == "panfine" || norm == "tiltfine" {
		if coarse := findCoarseForFine(fixture, &ch); coarse != nil {
			return coarse.Properties
		}
	}
	return ch.Properties
}

// partyPanTiltPos16 computes a 16-bit pan/tilt position, honouring per-channel invert.
func partyPanTiltPos16(fixture DMXFixture, ch DMXChannel, motionPhase float64, tilt bool, cfg DMXPartyConfig) uint16 {
	sweepRange := partyEffectiveSweepRange(cfg, fixture, tilt)
	pos := partySweepPosition16(motionPhase, tilt, sweepRange)
	if channelInvert(partyPanTiltInvertProps(fixture, ch)) {
		return 65535 - pos
	}
	return pos
}

// partyEffectiveSweepRange combines MovementRange (0–100%) with an optional degree cap.
func partyEffectiveSweepRange(cfg DMXPartyConfig, fixture DMXFixture, tilt bool) float64 {
	sweep := partySweepRange(cfg)
	limitDeg := cfg.MovementAngleLimitDeg
	if limitDeg <= 0 {
		return sweep
	}
	maxDeg := 540.0
	if tilt {
		maxDeg = 270.0
	}
	if fixture.MovingHead.MaxPan > 0 && !tilt {
		maxDeg = float64(fixture.MovingHead.MaxPan)
	}
	if fixture.MovingHead.MaxTilt > 0 && tilt {
		maxDeg = float64(fixture.MovingHead.MaxTilt)
	}
	if maxDeg <= 0 {
		return sweep
	}
	angleSweep := 2.0 * float64(limitDeg) / maxDeg
	if angleSweep < sweep {
		return angleSweep
	}
	return sweep
}

// partySweepPosition16 computes a smooth 16-bit pan/tilt position (0..65535) for one axis,
// centred at mid-scale and sweeping symmetrically by sweepRange (0..1). Pan and tilt use
// slightly different frequencies so the head traces a smooth figure instead of moving in a
// rigid diagonal. Crucially, the coarse and fine bytes are split from this single value, so a
// 16-bit fixture tracks one smooth curve rather than two decoupled oscillators (the old bug
// that drove the fine channel from a faster, independent sine and caused visible jitter).
func partySweepPosition16(phase float64, tilt bool, sweepRange float64) uint16 {
	if sweepRange < 0 {
		sweepRange = 0
	}
	if sweepRange > 1 {
		sweepRange = 1
	}
	s := math.Sin(phase)
	if tilt {
		s = math.Sin(phase*0.65 + math.Pi/2)
	}
	pos01 := clampFloat(0.5+0.5*sweepRange*s, 0, 1)
	return uint16(math.Round(pos01 * 65535))
}

// partyMovementSpeedByte returns a stable (non-oscillating) motor-speed value so the head
// faithfully follows the smooth DMX sweep we emit. Higher party speed → faster motor.
func partyMovementSpeedByte(cfg DMXPartyConfig) int {
	speed := clampPercent(cfg.Speed)
	return clampDMXByte(int(math.Round((1.0 - float64(speed)/100.0) * 120)))
}

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
