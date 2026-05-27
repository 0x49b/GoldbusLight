package controller

import (
	"fmt"
	"goldbus/internal/audio"
	"strings"
	"time"
)

// DMXPartyAudioInputDevice describes a native capture device for party audio mode.
type DMXPartyAudioInputDevice struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	IsDefault  bool   `json:"isDefault"`
	IsLoopback bool   `json:"isLoopback"`
	IsBuiltin  bool   `json:"isBuiltin"`
	IsUSB      bool   `json:"isUSB"`
}

func (c *WLEDController) ListDMXPartyAudioInputDevices() ([]DMXPartyAudioInputDevice, error) {
	if !c.dmxEnabled() {
		return nil, fmt.Errorf("dmx component is disabled in settings")
	}
	devices, err := audio.ListInputDevices()
	if err != nil {
		return nil, err
	}
	out := make([]DMXPartyAudioInputDevice, 0, len(devices))
	for _, device := range devices {
		out = append(out, DMXPartyAudioInputDevice{
			ID:         device.ID,
			Name:       device.Name,
			IsDefault:  device.IsDefault,
			IsLoopback: device.IsLoopback,
			IsBuiltin:  device.IsBuiltin,
			IsUSB:      device.IsUSB,
		})
	}
	return out, nil
}

func (c *WLEDController) startPartyAudioCapture(deviceID string) {
	var err error
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("audio capture panic: %v", recovered)
		}
		c.mu.Lock()
		party := c.dmxState.Party
		party.Status.AudioNoSignal = false
		if err != nil {
			party.Status.AudioCapturing = false
			party.Status.AudioCaptureError = err.Error()
		} else {
			party.Status.AudioCapturing = true
			party.Status.AudioCaptureError = ""
		}
		c.dmxState.Party = party
		c.updated = time.Now()
		c.mu.Unlock()
	}()

	c.partyAudioMu.Lock()
	if c.partyAudioCapture == nil {
		c.partyAudioCapture = &audio.Capture{}
	}
	capture := c.partyAudioCapture
	c.partyAudioMu.Unlock()

	err = capture.Start(deviceID, func(features audio.PartyFeatures, activeDeviceID string, capturedAt time.Time) {
		c.updatePartyAudioFeatures(DMXPartyAudioFeatures{
			Level:      features.Level,
			Bass:       features.Bass,
			Mid:        features.Mid,
			Treble:     features.Treble,
			Beat:       features.Beat,
			BPM:        features.BPM,
			CapturedAt: capturedAt,
			DeviceID:   activeDeviceID,
		}, capture.NoSignal())
	})
}

func (c *WLEDController) stopPartyAudioCapture() {
	c.partyAudioMu.Lock()
	if c.partyAudioCapture != nil {
		c.partyAudioCapture.Stop()
	}
	c.partyAudioMu.Unlock()

	c.mu.Lock()
	party := c.dmxState.Party
	party.Status.AudioCapturing = false
	party.Status.AudioNoSignal = false
	party.Status.AudioCaptureError = ""
	c.dmxState.Party = party
	c.updated = time.Now()
	c.mu.Unlock()
}

func (c *WLEDController) syncPartyAudioCapture() {
	state := c.GetDMXPartyState()
	if !state.Status.Running || state.Config.Mode != DMXPartyModeAudio {
		c.stopPartyAudioCapture()
		return
	}
	deviceID := strings.TrimSpace(state.Config.AudioInputDeviceID)
	c.partyAudioMu.Lock()
	running := c.partyAudioCapture != nil && c.partyAudioCapture.IsRunning()
	activeID := ""
	if c.partyAudioCapture != nil {
		activeID = c.partyAudioCapture.DeviceID()
	}
	c.partyAudioMu.Unlock()
	if running && activeID == deviceID {
		return
	}
	go c.startPartyAudioCapture(deviceID)
}

func (c *WLEDController) updatePartyAudioFeatures(features DMXPartyAudioFeatures, noSignal bool) {
	features = normalizeDMXPartyAudioFeatures(features)
	if features.CapturedAt.IsZero() {
		features.CapturedAt = time.Now()
	}
	c.mu.Lock()
	current := c.dmxState.Party
	current.Audio = features
	current.Status.LastAudioAt = features.CapturedAt
	current.Status.AudioCapturing = true
	current.Status.AudioNoSignal = noSignal
	if features.DeviceID != "" {
		current.Status.AudioInputDeviceID = features.DeviceID
	}
	c.dmxState.Party = current
	c.updated = time.Now()
	c.mu.Unlock()
}
