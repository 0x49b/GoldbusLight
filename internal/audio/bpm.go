package audio

import (
	"math"
	"sort"
	"time"
)

// BPMTracker estimates tempo from beat/onset transients (same signal as the Beat meter).
type BPMTracker struct {
	prevSignal float64
	lastOnset  time.Time
	intervalsS []float64
	lastBPM    float64
}

const (
	bpmMin          = 55.0
	bpmMax          = 200.0
	bpmGapMin       = 60.0 / bpmMax
	bpmGapMax       = 60.0 / bpmMin
	bpmDebounce     = 140 * time.Millisecond
	bpmRingMax      = 24
	bpmMinSamples   = 6
	bpmOnsetFloor   = 0.03
	bpmOnsetDelta   = 0.012
	bpmOnsetDeltaHi = 0.035
)

// Update should be called at roughly the same cadence as feature extraction (~80ms).
func (t *BPMTracker) Update(signal float64, at time.Time) float64 {
	delta := signal - t.prevSignal
	t.prevSignal = signal
	if signal < bpmOnsetFloor || !bpmOnsetDetected(signal, delta) {
		return t.lastBPM
	}
	if !t.lastOnset.IsZero() && at.Sub(t.lastOnset) < bpmDebounce {
		return t.lastBPM
	}
	if !t.lastOnset.IsZero() {
		gap := at.Sub(t.lastOnset).Seconds()
		if gap >= bpmGapMin && gap <= bpmGapMax {
			t.intervalsS = append(t.intervalsS, gap)
			if len(t.intervalsS) > bpmRingMax {
				t.intervalsS = t.intervalsS[len(t.intervalsS)-bpmRingMax:]
			}
		}
	}
	t.lastOnset = at
	if len(t.intervalsS) < bpmMinSamples {
		return t.lastBPM
	}
	cp := append([]float64(nil), t.intervalsS...)
	sort.Float64s(cp)
	mid := len(cp) / 2
	median := cp[mid]
	if len(cp)%2 == 0 && mid > 0 {
		median = (cp[mid-1] + cp[mid]) * 0.5
	}
	if median <= 0 {
		return t.lastBPM
	}
	bpm := 60.0 / median
	if bpm < bpmMin || bpm > bpmMax {
		return t.lastBPM
	}
	// Light smoothing to reduce jitter.
	if t.lastBPM > 0 {
		bpm = t.lastBPM*0.65 + bpm*0.35
	}
	t.lastBPM = math.Round(bpm*10) / 10
	return t.lastBPM
}

func bpmOnsetDetected(signal, delta float64) bool {
	if delta >= bpmOnsetDeltaHi {
		return true
	}
	if delta < bpmOnsetDelta {
		return false
	}
	// Accept smaller rises once the beat envelope is already up.
	return signal >= 0.08
}

// Reset clears transient history (call when capture restarts).
func (t *BPMTracker) Reset() {
	t.prevSignal = 0
	t.lastOnset = time.Time{}
	t.intervalsS = nil
	t.lastBPM = 0
}
