package audio

import (
	"sync"
	"time"
)

const (
	partySampleRate   = 44100
	partyChannels     = 1
	featureInterval   = 80 * time.Millisecond
	noSignalThreshold = 3 * time.Second
)

// FeatureHandler receives extracted party audio features.
type FeatureHandler func(features PartyFeatures, deviceID string, capturedAt time.Time)

type captureBackend interface {
	Stop()
}

// Capture manages microphone/line-in capture for party audio mode.
type Capture struct {
	mu               sync.Mutex
	backend          captureBackend
	running          bool
	deviceID         string
	captureStartedAt time.Time
	lastLevelAt      time.Time
	noSignal         bool
	onFeatures       FeatureHandler
	sampleBuf        []int16
	featureStop      chan struct{}
	featureDone      chan struct{}
}

func (c *Capture) featureLoop() {
	defer close(c.featureDone)
	ticker := time.NewTicker(featureInterval)
	defer ticker.Stop()

	for {
		select {
		case <-c.featureStop:
			return
		case now := <-ticker.C:
			c.mu.Lock()
			if !c.running || c.onFeatures == nil {
				c.mu.Unlock()
				return
			}
			samples := append([]int16(nil), c.sampleBuf...)
			handler := c.onFeatures
			deviceID := c.deviceID
			c.mu.Unlock()

			features := ExtractPartyFeatures(samples)
			if features.Level > 0.01 {
				c.mu.Lock()
				c.lastLevelAt = now
				c.noSignal = false
				c.mu.Unlock()
			} else if !c.lastLevelAt.IsZero() && now.Sub(c.lastLevelAt) > noSignalThreshold {
				c.mu.Lock()
				c.noSignal = true
				c.mu.Unlock()
			} else if c.lastLevelAt.IsZero() && now.Sub(c.captureStartedAt) > noSignalThreshold {
				c.mu.Lock()
				c.noSignal = true
				c.mu.Unlock()
			}
			handler(features, deviceID, now)
		}
	}
}

func (c *Capture) beginCaptureLocked(deviceID string, onFeatures FeatureHandler) {
	c.sampleBuf = make([]int16, 0, partySampleRate)
	c.onFeatures = onFeatures
	c.deviceID = deviceID
	c.captureStartedAt = time.Now()
	c.lastLevelAt = time.Time{}
	c.noSignal = false
	c.running = true
	c.featureStop = make(chan struct{})
	c.featureDone = make(chan struct{})
	go c.featureLoop()
}

func (c *Capture) stopFeatureLoopLocked() {
	if c.featureStop != nil {
		close(c.featureStop)
		<-c.featureDone
		c.featureStop = nil
		c.featureDone = nil
	}
}

// Stop halts capture.
func (c *Capture) Stop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.stopLocked()
}

func (c *Capture) stopBackendLocked() {
	if c.backend != nil {
		c.backend.Stop()
		c.backend = nil
	}
}

func (c *Capture) stopLocked() {
	c.stopFeatureLoopLocked()
	c.stopBackendLocked()
	c.running = false
	c.sampleBuf = nil
	c.onFeatures = nil
}

// IsRunning reports whether capture is active.
func (c *Capture) IsRunning() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.running
}

// DeviceID returns the active device ID.
func (c *Capture) DeviceID() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.deviceID
}

// NoSignal reports whether capture has been silent for too long.
func (c *Capture) NoSignal() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.noSignal
}

func (c *Capture) appendSamples(samples []int16) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sampleBuf = append(c.sampleBuf, samples...)
	maxKeep := partySampleRate * 2
	if len(c.sampleBuf) > maxKeep {
		c.sampleBuf = append([]int16(nil), c.sampleBuf[len(c.sampleBuf)-maxKeep:]...)
	}
}

func bytesToInt16(input []byte) []int16 {
	count := len(input) / 2
	out := make([]int16, count)
	for i := 0; i < count; i++ {
		lo := int(input[i*2])
		hi := int(input[i*2+1])
		out[i] = int16(lo | hi<<8)
	}
	return out
}
