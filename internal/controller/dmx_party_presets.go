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
	// ChannelBehaviors maps a fixture-relative channel offset (string key) to a behavior
	// ("random" or "exclude") for channels that are not pinned by any pose. Channels absent
	// from this map default to "exclude" (left untouched by the sequence).
	ChannelBehaviors map[string]string `json:"channelBehaviors,omitempty"`
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
				ID:    strings.TrimSpace(p.ID),
				Label: strings.TrimSpace(p.Label),
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
			// "exclude" is the default, so storing it adds no information.
			if b == "" || b == PresetChannelBehaviorExclude {
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

// computePresetSequenceFrame resolves which pose is active and how far into its crossfade
// playback currently is, purely as a function of elapsed time since anchor (stateless).
func computePresetSequenceFrame(seq DMXFixturePresetSequence, anchor, now time.Time) (presetSequenceFrame, bool) {
	n := len(seq.Presets)
	if n == 0 {
		return presetSequenceFrame{}, false
	}
	step := seq.StepMS
	if step < minPresetStepMS {
		step = minPresetStepMS
	}
	elapsed := now.Sub(anchor).Milliseconds()
	if elapsed < 0 {
		elapsed = 0
	}
	absStep := elapsed / int64(step)
	within := elapsed % int64(step)

	currIdx := int(absStep % int64(n))
	prevAbs := absStep - 1
	frame := presetSequenceFrame{
		curr:    seq.Presets[currIdx],
		absStep: absStep,
		fade:    1,
	}
	if prevAbs < 0 {
		// First pose since start: nothing to fade from.
		frame.prev = seq.Presets[currIdx]
		return frame, true
	}
	prevIdx := int(((prevAbs % int64(n)) + int64(n)) % int64(n))
	frame.prev = seq.Presets[prevIdx]
	if seq.FadeMS > 0 && within < int64(seq.FadeMS) {
		frame.fade = float64(within) / float64(seq.FadeMS)
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

	// A pose pin always wins, regardless of any behavior override.
	currV, pinnedCurr := frame.curr.Values[key]
	if pinnedCurr {
		prevV, pinnedPrev := frame.prev.Values[key]
		if !pinnedPrev {
			prevV = currV
		}
		return lerpByte(prevV, currV, frame.fade), true
	}

	switch normalizePresetChannelBehavior(behaviorForChannel(seq, key)) {
	case PresetChannelBehaviorRandom:
		curr := presetSequenceRandomByte(fixtureID, channelOffset, frame.absStep)
		if frame.absStep <= 0 || frame.fade >= 1 {
			return curr, true
		}
		prev := presetSequenceRandomByte(fixtureID, channelOffset, frame.absStep-1)
		return lerpByte(prev, curr, frame.fade), true
	default:
		// Excluded (the default): leave the channel alone.
		return 0, false
	}
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
