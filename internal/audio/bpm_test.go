package audio

import (
	"testing"
	"time"
)

func TestBPMTrackerConvergesNear120BPM(t *testing.T) {
	var tr BPMTracker
	start := time.Unix(0, 0)
	for beat := 0; beat < 40; beat++ {
		base := start.Add(time.Duration(beat*500) * time.Millisecond)
		_ = tr.Update(0.06, base)
		_ = tr.Update(0.52, base.Add(15*time.Millisecond))
	}
	bpm := tr.Update(0.06, start.Add(30*time.Second))
	if bpm < 90 || bpm > 150 {
		t.Fatalf("expected BPM near 120, got %v", bpm)
	}
}
