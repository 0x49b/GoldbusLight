package controller

import (
	"goldbus/internal/dmx"
	"hash/fnv"
	"math"
	"strconv"
	"strings"
	"time"
)

// Channel behaviors for fixture channels that are not pinned by a preset pose.
const (
	// PresetChannelBehaviorRandom randomizes the channel to a fresh value on every step.
	PresetChannelBehaviorRandom = "random"
	// PresetChannelBehaviorExclude leaves the channel untouched by the sequence (default).
	PresetChannelBehaviorExclude = "exclude"
)

const (
	defaultPresetStepMS = 2000
	minPresetStepMS     = 100
	maxPresetStepMS     = 600000
	maxPresetFadeMS     = 600000
)

// DMXFixturePreset is a single saved pose: a set of channel values keyed by the
// fixture-relative channel offset (same convention as DMXChannel.Channel), as a JSON string.
type DMXFixturePreset struct {
	ID    string `json:"id"`
	Label string `json:"label,omitempty"`
	// Values maps fixture-relative channel offset (string key) to a DMX value 0–255.
	Values map[string]int `json:"values"`
	// HoldMS overrides how long this pose is held before advancing (milliseconds).
	// 0 = inherit the sequence-level StepMS.
	HoldMS int `json:"holdMs,omitempty"`
	// FadeMS overrides the crossfade time into this pose (milliseconds).
	// 0 = inherit the sequence-level FadeMS.
	FadeMS int `json:"fadeMs,omitempty"`
}

// DMXFixturePresetSequence drives a fixture through an ordered list of poses during party mode.
type DMXFixturePresetSequence struct {
	// Enabled turns on preset-sequence mode for this fixture, overriding the generative
	// party algorithm for the channels the sequence covers.
	Enabled bool `json:"enabled,omitempty"`
	// Presets is the ordered list of poses to step through.
	Presets []DMXFixturePreset `json:"presets,omitempty"`
	// StepMs is how long each pose is held before advancing (milliseconds).
	StepMS int `json:"stepMs,omitempty"`
	// FadeMs is the crossfade time into each pose (milliseconds). 0 = snap instantly.
	FadeMS int `json:"fadeMs,omitempty"`
	// Loop, when true, restarts the sequence from the first pose after the last one plays.
	// When false the sequence plays through once and then holds the final pose.
	Loop bool `json:"loop"`
	// IdlePresetID names a pose to apply as the fixture's static "idle" position when DMX
	// live output starts and the fixture is not under party control. Empty = no idle pose.
	IdlePresetID string `json:"idlePresetId,omitempty"`
	// ChannelBehaviors maps a fixture-relative channel offset (string key) to a behavior
	// ("random" or "exclude") for channels that are not pinned by any pose. Channels absent
	// from this map default to "exclude" (left untouched by the sequence).
	ChannelBehaviors map[string]string `json:"channelBehaviors,omitempty"`
}

// presetByID returns the preset with the given id, if present.
func presetByID(presets []DMXFixturePreset, id string) (DMXFixturePreset, bool) {
	id = strings.TrimSpace(id)
	if id == "" {
		return DMXFixturePreset{}, false
	}
	for _, p := range presets {
		if p.ID == id {
			return p, true
		}
	}
	return DMXFixturePreset{}, false
}

func normalizePresetChannelBehavior(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case PresetChannelBehaviorRandom:
		return PresetChannelBehaviorRandom
	case PresetChannelBehaviorExclude:
		return PresetChannelBehaviorExclude
	default:
		return ""
	}
}

func normalizeFixturePresetSequence(in DMXFixturePresetSequence) DMXFixturePresetSequence {
	out := in

	if out.StepMS <= 0 {
		out.StepMS = defaultPresetStepMS
	}
	if out.StepMS < minPresetStepMS {
		out.StepMS = minPresetStepMS
	}
	if out.StepMS > maxPresetStepMS {
		out.StepMS = maxPresetStepMS
	}
	if out.FadeMS < 0 {
		out.FadeMS = 0
	}
	if out.FadeMS > maxPresetFadeMS {
		out.FadeMS = maxPresetFadeMS
	}
	// A crossfade can never be longer than the dwell on a pose.
	if out.FadeMS > out.StepMS {
		out.FadeMS = out.StepMS
	}

	if len(out.Presets) > 0 {
		presets := make([]DMXFixturePreset, 0, len(out.Presets))
		for i, p := range out.Presets {
			np := DMXFixturePreset{
				ID:     strings.TrimSpace(p.ID),
				Label:  strings.TrimSpace(p.Label),
				HoldMS: normalizePresetOverrideMS(p.HoldMS, minPresetStepMS, maxPresetStepMS),
				FadeMS: normalizePresetOverrideMS(p.FadeMS, 0, maxPresetFadeMS),
			}
			if np.ID == "" {
				np.ID = "preset-" + strconv.Itoa(i+1)
			}
			if len(p.Values) > 0 {
				vals := make(map[string]int, len(p.Values))
				for k, v := range p.Values {
					key := strings.TrimSpace(k)
					if key == "" {
						continue
					}
					if _, err := strconv.Atoi(key); err != nil {
						continue
					}
					vals[key] = clampDMXByte(v)
				}
				if len(vals) > 0 {
					np.Values = vals
				}
			}
			presets = append(presets, np)
		}
		out.Presets = presets
	} else {
		out.Presets = nil
	}

	if len(out.ChannelBehaviors) > 0 {
		next := make(map[string]string, len(out.ChannelBehaviors))
		for k, v := range out.ChannelBehaviors {
			key := strings.TrimSpace(k)
			if key == "" {
				continue
			}
			if _, err := strconv.Atoi(key); err != nil {
				continue
			}
			b := normalizePresetChannelBehavior(v)
			// Both "random" and "exclude" are meaningful: a pose captured from live stores
			// a value for every channel, so "exclude" must persist to override that value.
			if b == "" {
				continue
			}
			next[key] = b
		}
		if len(next) > 0 {
			out.ChannelBehaviors = next
		} else {
			out.ChannelBehaviors = nil
		}
	} else {
		out.ChannelBehaviors = nil
	}

	// Without at least one pose there is nothing to step through.
	if len(out.Presets) == 0 {
		out.Enabled = false
	}

	// Drop a dangling idle reference if its pose was deleted.
	out.IdlePresetID = strings.TrimSpace(out.IdlePresetID)
	if out.IdlePresetID != "" {
		if _, ok := presetByID(out.Presets, out.IdlePresetID); !ok {
			out.IdlePresetID = ""
		}
	}
	return out
}

// presetSequenceActive reports whether the sequence should drive the fixture.
func presetSequenceActive(seq DMXFixturePresetSequence) bool {
	return seq.Enabled && len(seq.Presets) > 0
}

// presetSequenceFrame captures the resolved playback position at a moment in time.
type presetSequenceFrame struct {
	curr    DMXFixturePreset
	prev    DMXFixturePreset
	absStep int64
	// fade is 0..1, where 1 means fully settled on curr (prev no longer contributes).
	fade float64
}

// normalizePresetOverrideMS clamps a per-pose timing override; 0 (or negative) means "inherit
// the sequence-level value".
func normalizePresetOverrideMS(v, lo, hi int) int {
	if v <= 0 {
		return 0
	}
	if v < lo {
		v = lo
	}
	if v > hi {
		v = hi
	}
	return v
}

// presetHoldMS is how long a pose is held: its own HoldMS override, else the sequence StepMS.
func presetHoldMS(seq DMXFixturePresetSequence, p DMXFixturePreset) int64 {
	h := p.HoldMS
	if h <= 0 {
		h = seq.StepMS
	}
	if h < minPresetStepMS {
		h = minPresetStepMS
	}
	if h > maxPresetStepMS {
		h = maxPresetStepMS
	}
	return int64(h)
}

// presetFadeMS is the crossfade into a pose: its own FadeMS override, else the sequence FadeMS,
// never longer than the pose's hold.
func presetFadeMS(seq DMXFixturePresetSequence, p DMXFixturePreset, hold int64) int64 {
	f := p.FadeMS
	if f <= 0 {
		f = seq.FadeMS
	}
	if f < 0 {
		f = 0
	}
	if int64(f) > hold {
		return hold
	}
	return int64(f)
}

// computePresetSequenceFrame resolves which pose is active and how far into its crossfade
// playback currently is, purely as a function of elapsed time since anchor (stateless). Each pose
// may carry its own hold/fade, so the timeline is built by walking cumulative per-pose durations.
func computePresetSequenceFrame(seq DMXFixturePresetSequence, anchor, now time.Time) (presetSequenceFrame, bool) {
	n := len(seq.Presets)
	if n == 0 {
		return presetSequenceFrame{}, false
	}

	holds := make([]int64, n)
	var total int64
	for i := range seq.Presets {
		holds[i] = presetHoldMS(seq, seq.Presets[i])
		total += holds[i]
	}
	if total <= 0 {
		first := seq.Presets[0]
		return presetSequenceFrame{curr: first, prev: first, absStep: 0, fade: 1}, true
	}

	elapsed := now.Sub(anchor).Milliseconds()
	if elapsed < 0 {
		elapsed = 0
	}

	// When looping is off, the sequence plays through once and then holds the final pose.
	if !seq.Loop && elapsed >= total {
		last := seq.Presets[n-1]
		return presetSequenceFrame{curr: last, prev: last, absStep: int64(n - 1), fade: 1}, true
	}

	cycle := elapsed / total
	pos := elapsed % total

	currIdx := n - 1
	var acc int64
	for i := 0; i < n; i++ {
		if pos < acc+holds[i] {
			currIdx = i
			break
		}
		acc += holds[i]
	}
	within := pos - acc

	// A monotonic step index so "random" channels reseed once per pose, even across cycles.
	absStep := cycle*int64(n) + int64(currIdx)
	frame := presetSequenceFrame{
		curr:    seq.Presets[currIdx],
		absStep: absStep,
		fade:    1,
	}
	if absStep <= 0 {
		// First pose since start: nothing to fade from.
		frame.prev = seq.Presets[currIdx]
		return frame, true
	}
	prevIdx := (currIdx - 1 + n) % n
	frame.prev = seq.Presets[prevIdx]
	if fade := presetFadeMS(seq, frame.curr, holds[currIdx]); fade > 0 && within < fade {
		frame.fade = float64(within) / float64(fade)
	}
	return frame, true
}

func lerpByte(from, to int, f float64) int {
	if f <= 0 {
		return clampDMXByte(from)
	}
	if f >= 1 {
		return clampDMXByte(to)
	}
	return clampDMXByte(int(math.Round(float64(from) + (float64(to)-float64(from))*f)))
}

// presetSequenceRandomByte yields a stable pseudo-random byte for a given fixture/channel/step,
// so a "random" channel holds one value for the whole dwell and can crossfade to the next.
func presetSequenceRandomByte(fixtureID string, channelOffset int, step int64) int {
	h := fnv.New32a()
	_, _ = h.Write([]byte(fixtureID))
	_, _ = h.Write([]byte{':'})
	_, _ = h.Write([]byte(strconv.Itoa(channelOffset)))
	_, _ = h.Write([]byte{':'})
	_, _ = h.Write([]byte(strconv.FormatInt(step, 10)))
	return int(h.Sum32() % 256)
}

// presetSequenceChannelValue resolves the value for one channel of a fixture running a sequence.
// owned is true when the sequence controls the channel (and party should claim the DMX slot);
// when false the channel is excluded and left untouched.
func presetSequenceChannelValue(
	seq DMXFixturePresetSequence,
	frame presetSequenceFrame,
	fixtureID string,
	channelOffset int,
) (value int, owned bool) {
	key := strconv.Itoa(channelOffset)

	// The per-channel behavior is the master switch and takes precedence over any stored
	// pose value, so a captured snapshot can still be randomized or excluded per channel.
	switch normalizePresetChannelBehavior(behaviorForChannel(seq, key)) {
	case PresetChannelBehaviorExclude:
		return 0, false
	case PresetChannelBehaviorRandom:
		curr := presetSequenceRandomByte(fixtureID, channelOffset, frame.absStep)
		if frame.absStep <= 0 || frame.fade >= 1 {
			return curr, true
		}
		prev := presetSequenceRandomByte(fixtureID, channelOffset, frame.absStep-1)
		return lerpByte(prev, curr, frame.fade), true
	}

	// Default ("pose"): replay the value stored for this pose, crossfading from the
	// previous pose. A channel with no stored value is left untouched.
	currV, pinnedCurr := frame.curr.Values[key]
	if !pinnedCurr {
		return 0, false
	}
	prevV, pinnedPrev := frame.prev.Values[key]
	if !pinnedPrev {
		prevV = currV
	}
	return lerpByte(prevV, currV, frame.fade), true
}

func behaviorForChannel(seq DMXFixturePresetSequence, key string) string {
	if seq.ChannelBehaviors == nil {
		return ""
	}
	return seq.ChannelBehaviors[key]
}

// buildPresetSequenceUpdates produces the DMX updates for a fixture running a preset sequence,
// marking the universe slots it owns.
func buildPresetSequenceUpdates(
	fixture DMXFixture,
	seq DMXFixturePresetSequence,
	anchor, now time.Time,
	owned *[512]bool,
) []dmx.DMXOutputUpdate {
	frame, ok := computePresetSequenceFrame(seq, anchor, now)
	if !ok {
		return nil
	}
	updates := make([]dmx.DMXOutputUpdate, 0, len(fixture.Channels))
	for _, ch := range fixture.Channels {
		address := fixture.DMXAddress + ch.Channel - 1
		if address < 1 || address > 512 {
			continue
		}
		value, claim := presetSequenceChannelValue(seq, frame, fixture.ID, ch.Channel)
		if !claim {
			continue
		}
		owned[address-1] = true
		updates = append(updates, dmx.DMXOutputUpdate{Address: address, Value: value})
	}
	return updates
}
