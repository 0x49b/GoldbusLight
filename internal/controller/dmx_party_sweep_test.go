package controller

import (
	"math"
	"testing"
)

// reconstruct16 rebuilds the 16-bit position from the coarse (high) and fine (low) bytes,
// mirroring how a 16-bit moving head combines its pan/tilt channels.
func reconstruct16(pos uint16) (coarse, fine, combined int) {
	coarse = int(pos >> 8)
	fine = int(pos & 0xFF)
	combined = coarse<<8 | fine
	return
}

func TestPartySweepPositionCoarseFineReconstruct(t *testing.T) {
	// The coarse and fine bytes must always recombine to the exact source position,
	// which is the whole point of the fix (one smooth value split into two bytes).
	for phase := 0.0; phase < 20; phase += 0.13 {
		pos := partySweepPosition16(phase, false, 1.0)
		_, _, combined := reconstruct16(pos)
		if combined != int(pos) {
			t.Fatalf("phase=%.2f: reconstructed %d != %d", phase, combined, int(pos))
		}
	}
}

func TestPartySweepPositionSmooth(t *testing.T) {
	// Across the fastest realistic per-frame phase step, the 16-bit position must change
	// gradually (no jitter). The previous fine channel ran at 2.5x on an independent sine,
	// so its low byte jumped by tens of counts per frame and wrapped repeatedly.
	const maxFrameStep = 0.18 // 0.09 * speedFactor(max≈2.0)
	prev := int(partySweepPosition16(0, false, 1.0))
	maxDelta := 0
	for i := 1; i < 2000; i++ {
		cur := int(partySweepPosition16(float64(i)*maxFrameStep, false, 1.0))
		d := cur - prev
		if d < 0 {
			d = -d
		}
		if d > maxDelta {
			maxDelta = d
		}
		prev = cur
	}
	// A pure sine sweep changes by at most ~0.5*65535*step per frame ≈ 5900. Anything in
	// that ballpark is a smooth sweep; jitter would blow well past it.
	if maxDelta > 6200 {
		t.Fatalf("16-bit per-frame delta %d too large (not smooth)", maxDelta)
	}
}

func TestPartySweepRangeControlsAmplitude(t *testing.T) {
	// A wider MovementRange must produce a wider spread of positions.
	spread := func(rng float64) int {
		min, max := math.MaxInt32, math.MinInt32
		for i := 0; i < 1000; i++ {
			v := int(partySweepPosition16(float64(i)*0.05, false, rng))
			if v < min {
				min = v
			}
			if v > max {
				max = v
			}
		}
		return max - min
	}
	narrow := spread(0.2)
	wide := spread(1.0)
	if wide <= narrow {
		t.Fatalf("wide spread %d should exceed narrow spread %d", wide, narrow)
	}
	// Both stay centred around mid-scale.
	mid := int(partySweepPosition16(0, false, 0)) // sin(0)=0 → exactly centre
	if mid < 32000 || mid > 33500 {
		t.Fatalf("zero-range position %d should sit at mid-scale", mid)
	}
}

func TestPartySweepRangeDefaultOnUnset(t *testing.T) {
	if got := partySweepRange(DMXPartyConfig{MovementRange: 0}); got != float64(defaultPartyMovementRange)/100.0 {
		t.Fatalf("unset MovementRange = %.2f, want default", got)
	}
	if got := partySweepRange(DMXPartyConfig{MovementRange: 50}); got != 0.5 {
		t.Fatalf("MovementRange 50 = %.2f, want 0.5", got)
	}
}

func TestPartyMovementSpeedByteStableAndFasterWithSpeed(t *testing.T) {
	slow := partyMovementSpeedByte(DMXPartyConfig{Speed: 0})
	fast := partyMovementSpeedByte(DMXPartyConfig{Speed: 100})
	// Higher party speed → lower motor value (faster tracking), and always within range.
	if !(fast < slow) {
		t.Fatalf("expected faster speed to lower the motor value: fast=%d slow=%d", fast, slow)
	}
	for _, s := range []int{0, 25, 50, 75, 100} {
		v := partyMovementSpeedByte(DMXPartyConfig{Speed: s})
		if v < 0 || v > 255 {
			t.Fatalf("movement speed byte out of range for speed %d: %d", s, v)
		}
	}
}

func TestPartySweepPanTiltOutOfLockstep(t *testing.T) {
	// Pan and tilt use different frequencies so they don't move identically.
	differs := false
	for i := 0; i < 200; i++ {
		phase := float64(i) * 0.1
		if partySweepPosition16(phase, false, 1.0) != partySweepPosition16(phase, true, 1.0) {
			differs = true
			break
		}
	}
	if !differs {
		t.Fatal("pan and tilt sweeps should not be identical")
	}
}

func TestPartyEffectiveSweepRangeAngleLimit(t *testing.T) {
	fixture := DMXFixture{MovingHead: MovingHeadConfig{MaxPan: 540, MaxTilt: 270}}
	cfg := DMXPartyConfig{MovementRange: 100, MovementAngleLimitDeg: 45}
	got := partyEffectiveSweepRange(cfg, fixture, false)
	want := 2.0 * 45.0 / 540.0
	if got > want+0.001 || got < want-0.001 {
		t.Fatalf("pan angle limit sweep = %.4f, want %.4f", got, want)
	}
	narrow := partyEffectiveSweepRange(DMXPartyConfig{MovementRange: 20, MovementAngleLimitDeg: 45}, fixture, false)
	if narrow > got {
		t.Fatalf("movement range should further narrow sweep")
	}
}
