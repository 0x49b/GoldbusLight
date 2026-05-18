package controller

import (
	"context"
	"fmt"
	"goldbus/internal/dmx"
	"math"
	"slices"
	"strings"
	"time"
)

type DMXPartyMode string

const (
	DMXPartyModeAuto  DMXPartyMode = "auto"
	DMXPartyModeAudio DMXPartyMode = "audio"
)

type DMXPartyConfig struct {
	Enabled            bool         `json:"enabled"`
	Mode               DMXPartyMode `json:"mode"`
	FixtureIDs         []string     `json:"fixtureIds,omitempty"`
	Intensity          int          `json:"intensity"`
	Speed              int          `json:"speed"`
	ColorVariation     int          `json:"colorVariation"`
	AudioSensitivity   int          `json:"audioSensitivity"`
	AudioInputDeviceID string       `json:"audioInputDeviceId,omitempty"`
}

type DMXPartyAudioFeatures struct {
	Level      float64   `json:"level"`
	Bass       float64   `json:"bass"`
	Mid        float64   `json:"mid"`
	Treble     float64   `json:"treble"`
	Beat       float64   `json:"beat"`
	CapturedAt time.Time `json:"capturedAt"`
	DeviceID   string    `json:"deviceId,omitempty"`
}

type DMXPartyStatus struct {
	Running            bool         `json:"running"`
	Mode               DMXPartyMode `json:"mode"`
	Error              string       `json:"error,omitempty"`
	LastFrameAt        time.Time    `json:"lastFrameAt,omitempty"`
	LastAudioAt        time.Time    `json:"lastAudioAt,omitempty"`
	AudioInputDeviceID string       `json:"audioInputDeviceId,omitempty"`
}

type DMXPartyState struct {
	Config DMXPartyConfig        `json:"config"`
	Status DMXPartyStatus        `json:"status"`
	Audio  DMXPartyAudioFeatures `json:"audio"`
}

func defaultDMXPartyConfig() DMXPartyConfig {
	return DMXPartyConfig{
		Enabled:          false,
		Mode:             DMXPartyModeAuto,
		FixtureIDs:       []string{},
		Intensity:        80,
		Speed:            55,
		ColorVariation:   70,
		AudioSensitivity: 60,
	}
}

func defaultDMXPartyState() DMXPartyState {
	return DMXPartyState{
		Config: defaultDMXPartyConfig(),
		Status: DMXPartyStatus{
			Running: false,
			Mode:    DMXPartyModeAuto,
		},
		Audio: DMXPartyAudioFeatures{},
	}
}

func normalizeDMXPartyMode(mode DMXPartyMode) DMXPartyMode {
	switch mode {
	case DMXPartyModeAuto, DMXPartyModeAudio:
		return mode
	default:
		return DMXPartyModeAuto
	}
}

func clampPercent(v int) int {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func normalizeDMXPartyConfig(in DMXPartyConfig) DMXPartyConfig {
	out := in
	out.Mode = normalizeDMXPartyMode(out.Mode)
	out.Intensity = clampPercent(out.Intensity)
	out.Speed = clampPercent(out.Speed)
	out.ColorVariation = clampPercent(out.ColorVariation)
	out.AudioSensitivity = clampPercent(out.AudioSensitivity)
	out.AudioInputDeviceID = strings.TrimSpace(out.AudioInputDeviceID)

	seen := map[string]struct{}{}
	nextIDs := make([]string, 0, len(out.FixtureIDs))
	for _, raw := range out.FixtureIDs {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		nextIDs = append(nextIDs, id)
	}
	out.FixtureIDs = nextIDs
	return out
}

func normalizeDMXPartyAudioFeatures(in DMXPartyAudioFeatures) DMXPartyAudioFeatures {
	out := in
	out.Level = clampPartyLevel(out.Level)
	out.Bass = clampPartyLevel(out.Bass)
	out.Mid = clampPartyLevel(out.Mid)
	out.Treble = clampPartyLevel(out.Treble)
	out.Beat = clampPartyLevel(out.Beat)
	out.DeviceID = strings.TrimSpace(out.DeviceID)
	return out
}

func normalizeDMXPartyStatus(in DMXPartyStatus) DMXPartyStatus {
	out := in
	out.Mode = normalizeDMXPartyMode(out.Mode)
	out.Error = strings.TrimSpace(out.Error)
	out.AudioInputDeviceID = strings.TrimSpace(out.AudioInputDeviceID)
	return out
}

func normalizeDMXPartyState(in DMXPartyState) DMXPartyState {
	out := in
	out.Config = normalizeDMXPartyConfig(out.Config)
	out.Status = normalizeDMXPartyStatus(out.Status)
	out.Audio = normalizeDMXPartyAudioFeatures(out.Audio)
	// Runtime state never resumes automatically from persisted state.
	out.Status.Running = false
	if !out.Config.Enabled {
		out.Status.Error = ""
	}
	return out
}

func clampPartyLevel(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func (c *WLEDController) SetDMXPartyConfig(config DMXPartyConfig) (DMXPartyState, error) {
	if !c.dmxEnabled() {
		return DMXPartyState{}, fmt.Errorf("dmx component is disabled in settings")
	}
	c.mu.Lock()
	next := normalizeDMXPartyConfig(config)
	current := normalizeDMXPartyState(c.dmxState.Party)
	current.Config = next
	current.Status.Mode = next.Mode
	current.Status.AudioInputDeviceID = next.AudioInputDeviceID
	c.dmxState.Party = current
	c.updated = time.Now()
	state := c.dmxState.Party
	c.mu.Unlock()
	if err := c.persistDMX(); err != nil {
		return DMXPartyState{}, err
	}
	return state, nil
}

func (c *WLEDController) GetDMXPartyState() DMXPartyState {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return normalizeDMXPartyState(c.dmxState.Party)
}

func (c *WLEDController) PushDMXPartyAudioFeatures(in DMXPartyAudioFeatures) (DMXPartyState, error) {
	if !c.dmxEnabled() {
		return DMXPartyState{}, fmt.Errorf("dmx component is disabled in settings")
	}
	features := normalizeDMXPartyAudioFeatures(in)
	if features.CapturedAt.IsZero() {
		features.CapturedAt = time.Now()
	}
	c.mu.Lock()
	current := normalizeDMXPartyState(c.dmxState.Party)
	current.Audio = features
	current.Status.LastAudioAt = features.CapturedAt
	if features.DeviceID != "" {
		current.Status.AudioInputDeviceID = features.DeviceID
		if current.Config.AudioInputDeviceID == "" {
			current.Config.AudioInputDeviceID = features.DeviceID
		}
	}
	c.dmxState.Party = current
	c.updated = time.Now()
	state := c.dmxState.Party
	c.mu.Unlock()
	if err := c.persistDMX(); err != nil {
		return DMXPartyState{}, err
	}
	return state, nil
}

func (c *WLEDController) StartDMXParty() error {
	if !c.dmxEnabled() {
		return fmt.Errorf("dmx component is disabled in settings")
	}
	if !c.dmxLiveIsConnected() {
		return fmt.Errorf("DMX live output is not running")
	}

	c.mu.Lock()
	party := normalizeDMXPartyState(c.dmxState.Party)
	party.Config.Enabled = true
	party.Status.Mode = party.Config.Mode
	party.Status.Error = ""
	party.Status.Running = true
	party.Status.AudioInputDeviceID = party.Config.AudioInputDeviceID
	c.dmxState.Party = party
	c.updated = time.Now()
	c.mu.Unlock()

	c.dmxLiveMu.Lock()
	if c.dmxPartyRunning {
		c.dmxLiveMu.Unlock()
		return fmt.Errorf("party mode is already running")
	}
	ctx := c.rootCtx
	if ctx == nil {
		ctx = context.Background()
	}
	runCtx, cancel := context.WithCancel(ctx)
	c.dmxPartyRunning = true
	c.dmxPartyCancel = cancel
	c.dmxPartyWG.Add(1)
	go c.dmxPartyWorker(runCtx)
	c.dmxLiveMu.Unlock()

	if err := c.persistDMX(); err != nil {
		return err
	}
	return nil
}

func (c *WLEDController) StopDMXParty() {
	c.stopDMXPartyWithReason("")
}

func (c *WLEDController) stopDMXPartyWithReason(reason string) {
	c.dmxLiveMu.Lock()
	cancel := c.dmxPartyCancel
	running := c.dmxPartyRunning
	c.dmxPartyCancel = nil
	c.dmxPartyRunning = false
	c.dmxLiveMu.Unlock()
	if cancel != nil {
		cancel()
	}
	if running {
		c.dmxPartyWG.Wait()
	}
	c.mu.Lock()
	party := normalizeDMXPartyState(c.dmxState.Party)
	party.Config.Enabled = false
	party.Status.Running = false
	if reason != "" {
		party.Status.Error = strings.TrimSpace(reason)
	}
	c.dmxState.Party = party
	c.updated = time.Now()
	c.mu.Unlock()
	_ = c.persistDMX()
}

func (c *WLEDController) dmxLiveIsConnected() bool {
	c.dmxLiveMu.Lock()
	defer c.dmxLiveMu.Unlock()
	return c.dmxLiveRunning && (c.dmxLiveUSBFrames != nil || c.dmxLiveArtFrames != nil)
}

func (c *WLEDController) dmxPartyWorker(ctx context.Context) {
	defer c.dmxPartyWG.Done()
	ticker := time.NewTicker(time.Second / dmxLiveFrameHz)
	defer ticker.Stop()

	var motionPhase float64
	var colorPhase float64
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			state := c.GetDMXPartyState()
			if !state.Config.Enabled {
				continue
			}
			if !c.dmxLiveIsConnected() {
				c.stopDMXPartyWithReason("dmx live output is disconnected")
				return
			}
			updates := c.buildDMXPartyFrame(state, now, &motionPhase, &colorPhase)
			if len(updates) == 0 {
				continue
			}
			c.dmxLiveMu.Lock()
			if !c.dmxLiveRunning || !c.dmxPartyRunning {
				c.dmxLiveMu.Unlock()
				continue
			}
			c.applyDMXUpdatesLocked(updates)
			frame := c.dmxLiveBuf
			queueLatestDMXFrame(c.dmxLiveUSBFrames, frame)
			queueLatestDMXFrame(c.dmxLiveArtFrames, frame)
			c.dmxLiveMu.Unlock()

			c.mu.Lock()
			party := normalizeDMXPartyState(c.dmxState.Party)
			party.Status.Running = true
			party.Status.Mode = party.Config.Mode
			party.Status.LastFrameAt = now
			if party.Audio.CapturedAt.After(time.Time{}) {
				party.Status.LastAudioAt = party.Audio.CapturedAt
			}
			c.dmxState.Party = party
			c.updated = time.Now()
			c.mu.Unlock()
		}
	}
}

func (c *WLEDController) buildDMXPartyFrame(
	state DMXPartyState,
	at time.Time,
	motionPhase *float64,
	colorPhase *float64,
) []dmx.DMXOutputUpdate {
	c.mu.RLock()
	fixtures := append([]DMXFixture(nil), c.dmxState.Fixtures...)
	c.mu.RUnlock()
	if len(fixtures) == 0 {
		return nil
	}
	targeted := filterPartyFixtures(fixtures, state.Config.FixtureIDs)
	if len(targeted) == 0 {
		targeted = fixtures
	}

	speedFactor := 0.2 + (float64(state.Config.Speed) / 100.0 * 1.8)
	intensity := float64(state.Config.Intensity) / 100.0
	colorVar := float64(state.Config.ColorVariation) / 100.0
	beat := 0.0
	level := 0.0
	if state.Config.Mode == DMXPartyModeAudio {
		audioAge := at.Sub(state.Audio.CapturedAt)
		if state.Audio.CapturedAt.IsZero() || audioAge > 2*time.Second {
			level = 0
			beat = 0
		} else {
			sens := 0.5 + float64(state.Config.AudioSensitivity)/100.0
			level = clampPartyLevel(state.Audio.Level * sens)
			beat = clampPartyLevel(state.Audio.Beat * sens)
			intensity = clampPartyLevel(intensity*0.5 + level*0.5)
			speedFactor += beat * 1.2
		}
	}

	*motionPhase += 0.09 * speedFactor
	*colorPhase += 0.05 * speedFactor

	updates := make([]dmx.DMXOutputUpdate, 0, len(targeted)*6)
	for idx, fixture := range targeted {
		offset := float64(idx) * 0.4
		for _, ch := range fixture.Channels {
			address := fixture.DMXAddress + ch.Channel - 1
			if address < 1 || address > 512 {
				continue
			}
			next, ok := partyValueForChannel(
				ch.Type,
				*motionPhase+offset,
				*colorPhase+offset,
				intensity,
				colorVar,
				level,
				beat,
			)
			if !ok {
				continue
			}
			updates = append(updates, dmx.DMXOutputUpdate{Address: address, Value: next})
		}
	}
	return updates
}

func partyValueForChannel(
	channelType string,
	motionPhase float64,
	colorPhase float64,
	intensity float64,
	colorVariation float64,
	audioLevel float64,
	audioBeat float64,
) (int, bool) {
	normType := strings.ToLower(strings.TrimSpace(channelType))
	oscSlow := (math.Sin(motionPhase) + 1) * 0.5
	oscFast := (math.Sin(motionPhase*2.5) + 1) * 0.5
	colorOsc := (math.Sin(colorPhase) + 1) * 0.5
	colorOsc2 := (math.Sin(colorPhase+2.09) + 1) * 0.5
	colorOsc3 := (math.Sin(colorPhase+4.18) + 1) * 0.5
	audioBoost := clampPartyLevel(audioLevel*0.6 + audioBeat*0.4)

	switch normType {
	case "dimmer", "dimmerfine":
		v := 45 + 180*intensity
		v += 30 * audioBoost
		return clampDMXByte(int(v)), true
	case "onoff", "lamp":
		if intensity > 0.15 || audioBoost > 0.1 {
			return 255, true
		}
		return 0, true
	case "pan", "tilt", "infinitepan", "infinitetilt":
		v := oscSlow * (0.25 + 0.75*intensity)
		return clampDMXByte(int(v * 255)), true
	case "panfine", "tiltfine":
		return clampDMXByte(int(oscFast * 255)), true
	case "movementspeed":
		return clampDMXByte(int((0.2 + 0.8*oscFast) * 255)), true
	case "colorcomponent":
		blend := colorVariation
		r := colorOsc*(0.4+0.6*blend) + audioBoost*0.2
		g := colorOsc2*(0.4+0.6*blend) + audioBoost*0.2
		b := colorOsc3*(0.4+0.6*blend) + audioBoost*0.2
		mix := (r + g + b) / 3.0
		return clampDMXByte(int(mix * 255)), true
	case "colorwheel", "colortemperature", "greensaturation", "xfadetocolor":
		v := (colorOsc*0.7 + colorOsc2*0.3)
		v = v*(0.4+0.6*colorVariation) + audioBoost*0.15
		return clampDMXByte(int(v * 255)), true
	case "gobowheel", "goboindexing", "goborotation", "goboshake":
		base := (oscFast*0.6 + audioBeat*0.4)
		return clampDMXByte(int(base * 255)), true
	case "zoom", "focus", "frost", "iris", "prism", "prismrotation", "shutterstrobe":
		v := oscFast*(0.3+0.7*intensity) + audioBoost*0.2
		return clampDMXByte(int(v * 255)), true
	default:
		return 0, false
	}
}

func filterPartyFixtures(fixtures []DMXFixture, fixtureIDs []string) []DMXFixture {
	if len(fixtureIDs) == 0 {
		return fixtures
	}
	ids := map[string]struct{}{}
	for _, id := range fixtureIDs {
		t := strings.TrimSpace(id)
		if t == "" {
			continue
		}
		ids[t] = struct{}{}
	}
	if len(ids) == 0 {
		return fixtures
	}
	out := make([]DMXFixture, 0, len(fixtures))
	for _, fixture := range fixtures {
		if _, ok := ids[fixture.ID]; ok {
			out = append(out, fixture)
		}
	}
	slices.SortFunc(out, func(a, b DMXFixture) int {
		if a.DMXAddress < b.DMXAddress {
			return -1
		}
		if a.DMXAddress > b.DMXAddress {
			return 1
		}
		return strings.Compare(a.ID, b.ID)
	})
	return out
}

func clampDMXByte(v int) int {
	if v < 0 {
		return 0
	}
	if v > 255 {
		return 255
	}
	return v
}
