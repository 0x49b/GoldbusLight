package controller

import (
	"context"
	"fmt"
	"goldbus/internal/dmx"
	"math"
	"runtime/debug"
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
	Enabled       bool         `json:"enabled"`
	Mode          DMXPartyMode `json:"mode"`
	FixtureIDs    []string     `json:"fixtureIds,omitempty"`
	WLEDDeviceIDs []string     `json:"wledDeviceIds,omitempty"`
	Intensity     int          `json:"intensity"`
	Speed         int          `json:"speed"`
	// MovementRange controls how wide pan/tilt sweeps are (0–100): 100 sweeps the full
	// mechanical range, lower values sweep a tighter arc around the centre.
	MovementRange      int    `json:"movementRange,omitempty"`
	ColorVariation     int    `json:"colorVariation"`
	AudioSensitivity   int    `json:"audioSensitivity"`
	AudioInputDeviceID string `json:"audioInputDeviceId,omitempty"`
	// SmokeBurstOnMS is how long each smoke/hazer burst stays on (milliseconds).
	SmokeBurstOnMS int `json:"smokeBurstOnMs,omitempty"`
	// SmokeBurstOffMS is the pause between smoke/hazer bursts (milliseconds).
	SmokeBurstOffMS int `json:"smokeBurstOffMs,omitempty"`
	// SmokeVolume is fog output level during a burst (0–100).
	SmokeVolume int `json:"smokeVolume,omitempty"`
}

type DMXPartyAudioFeatures struct {
	Level      float64   `json:"level"`
	Bass       float64   `json:"bass"`
	Mid        float64   `json:"mid"`
	Treble     float64   `json:"treble"`
	Beat       float64   `json:"beat"`
	BPM        float64   `json:"bpm"`
	CapturedAt time.Time `json:"capturedAt"`
	DeviceID   string    `json:"deviceId,omitempty"`
}

type DMXPartyStatus struct {
	Running                bool         `json:"running"`
	Mode                   DMXPartyMode `json:"mode"`
	Error                  string       `json:"error,omitempty"`
	LastFrameAt            time.Time    `json:"lastFrameAt,omitempty"`
	LastAudioAt            time.Time    `json:"lastAudioAt,omitempty"`
	AudioInputDeviceID     string       `json:"audioInputDeviceId,omitempty"`
	PartyBlocksManualPatch bool         `json:"partyBlocksManualPatch"`
	AudioCapturing         bool         `json:"audioCapturing"`
	AudioNoSignal          bool         `json:"audioNoSignal"`
	AudioCaptureError      string       `json:"audioCaptureError,omitempty"`
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
		WLEDDeviceIDs:    []string{},
		Intensity:        80,
		Speed:            55,
		MovementRange:    defaultPartyMovementRange,
		ColorVariation:   70,
		AudioSensitivity: 60,
		SmokeBurstOnMS:   defaultPartySmokeBurstOnMS,
		SmokeBurstOffMS:  defaultPartySmokeBurstOffMS,
		SmokeVolume:      defaultPartySmokeVolume,
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
	// 0 means "unset" (e.g. configs saved before this field existed); fall back to the
	// default so moving heads still sweep rather than freezing at centre.
	if out.MovementRange <= 0 {
		out.MovementRange = defaultPartyMovementRange
	}
	out.MovementRange = clampPercent(out.MovementRange)
	out.ColorVariation = clampPercent(out.ColorVariation)
	out.AudioSensitivity = clampPercent(out.AudioSensitivity)
	out.AudioInputDeviceID = strings.TrimSpace(out.AudioInputDeviceID)
	if in.SmokeBurstOnMS == 0 && in.SmokeBurstOffMS == 0 && in.SmokeVolume == 0 {
		out.SmokeBurstOnMS = defaultPartySmokeBurstOnMS
		out.SmokeBurstOffMS = defaultPartySmokeBurstOffMS
		out.SmokeVolume = defaultPartySmokeVolume
	} else {
		out.SmokeBurstOnMS, out.SmokeBurstOffMS = normalizePartySmokeBurstMS(out.SmokeBurstOnMS, out.SmokeBurstOffMS)
		out.SmokeVolume = clampPercent(out.SmokeVolume)
	}

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

	seenWLED := map[string]struct{}{}
	nextWLEDIDs := make([]string, 0, len(out.WLEDDeviceIDs))
	for _, raw := range out.WLEDDeviceIDs {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if _, ok := seenWLED[id]; ok {
			continue
		}
		seenWLED[id] = struct{}{}
		nextWLEDIDs = append(nextWLEDIDs, id)
	}
	out.WLEDDeviceIDs = nextWLEDIDs
	return out
}

func normalizeDMXPartyAudioFeatures(in DMXPartyAudioFeatures) DMXPartyAudioFeatures {
	out := in
	out.Level = clampPartyLevel(out.Level)
	out.Bass = clampPartyLevel(out.Bass)
	out.Mid = clampPartyLevel(out.Mid)
	out.Treble = clampPartyLevel(out.Treble)
	out.Beat = clampPartyLevel(out.Beat)
	if out.BPM < 0 {
		out.BPM = 0
	}
	if out.BPM > 300 {
		out.BPM = 300
	}
	out.DeviceID = strings.TrimSpace(out.DeviceID)
	return out
}

func normalizeDMXPartyStatus(in DMXPartyStatus) DMXPartyStatus {
	out := in
	out.Mode = normalizeDMXPartyMode(out.Mode)
	out.Error = strings.TrimSpace(out.Error)
	out.AudioInputDeviceID = strings.TrimSpace(out.AudioInputDeviceID)
	out.AudioCaptureError = strings.TrimSpace(out.AudioCaptureError)
	return out
}

func normalizeDMXPartyState(in DMXPartyState) DMXPartyState {
	out := in
	out.Config = normalizeDMXPartyConfig(out.Config)
	out.Status = normalizeDMXPartyStatus(out.Status)
	out.Audio = normalizeDMXPartyAudioFeatures(out.Audio)
	if !out.Config.Enabled {
		out.Status.Error = ""
	}
	return out
}

// stripDMXPartyRuntimeForPersistence clears volatile party status before writing dmx.json
// or after reading from disk so a stored "running" flag never auto-starts the worker.
func stripDMXPartyRuntimeForPersistence(in DMXPartyState) DMXPartyState {
	out := in
	out.Status.Running = false
	out.Status.AudioCapturing = false
	out.Status.AudioNoSignal = false
	out.Status.AudioCaptureError = ""
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

func (c *WLEDController) partyFeaturesEnabled() bool {
	return c.wledEnabled() || c.dmxEnabled()
}

func (c *WLEDController) SetDMXPartyConfig(config DMXPartyConfig) (DMXPartyState, error) {
	if !c.partyFeaturesEnabled() {
		return DMXPartyState{}, fmt.Errorf("party mode requires WLED or DMX to be enabled in settings")
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
	c.syncPartyAudioCapture()
	return state, nil
}

func (c *WLEDController) GetDMXPartyState() DMXPartyState {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := c.dmxState.Party
	out.Config = normalizeDMXPartyConfig(out.Config)
	out.Status = normalizeDMXPartyStatus(out.Status)
	out.Audio = normalizeDMXPartyAudioFeatures(out.Audio)
	return out
}

func (c *WLEDController) PushDMXPartyAudioFeatures(in DMXPartyAudioFeatures) (DMXPartyState, error) {
	if !c.partyFeaturesEnabled() {
		return DMXPartyState{}, fmt.Errorf("party mode requires WLED or DMX to be enabled in settings")
	}
	c.updatePartyAudioFeatures(normalizeDMXPartyAudioFeatures(in), false)
	c.mu.RLock()
	state := c.dmxState.Party
	c.mu.RUnlock()
	return state, nil
}

func (c *WLEDController) StartDMXParty() error {
	if !c.partyFeaturesEnabled() {
		return fmt.Errorf("party mode requires WLED or DMX to be enabled in settings")
	}

	state := c.GetDMXPartyState()
	c.mu.RLock()
	fixtures := append([]DMXFixture(nil), c.dmxState.Fixtures...)
	devices := cloneDeviceMap(c.devices)
	c.mu.RUnlock()

	dmxTargets := partyDMXTargets(fixtures, state.Config)
	wledTargets := filterPartyWLEDDevices(devices, state.Config.WLEDDeviceIDs)
	if len(dmxTargets) == 0 && len(wledTargets) == 0 {
		return fmt.Errorf("select at least one WLED or DMX device for party mode")
	}
	if len(dmxTargets) > 0 {
		if !c.dmxEnabled() {
			return fmt.Errorf("dmx component is disabled in settings")
		}
		if !c.dmxLiveIsConnected() {
			if err := c.StartDMXLive(""); err != nil {
				return err
			}
		}
	}
	if len(wledTargets) > 0 && !c.wledEnabled() {
		return fmt.Errorf("wled component is disabled in settings")
	}

	c.mu.Lock()
	party := normalizeDMXPartyState(c.dmxState.Party)
	party.Config = state.Config
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
	c.syncPartyAudioCapture()
	return nil
}

func (c *WLEDController) StopDMXParty() {
	c.stopDMXPartyInternal("", true)
}

func (c *WLEDController) stopDMXPartyWithReason(reason string) {
	c.stopDMXPartyInternal(reason, true)
}

// partyStopCleanupTimeout bounds the potentially-blocking cleanup during stop
// (native audio backend shutdown, joining the worker goroutine) so that turning
// party mode off can never hang the caller.
const partyStopCleanupTimeout = 2 * time.Second

// runWithTimeout runs fn, returning once it finishes or after timeout — whichever
// comes first. If fn overruns it keeps running in the background; the caller is
// never blocked beyond timeout.
func runWithTimeout(fn func(), timeout time.Duration) {
	done := make(chan struct{})
	go func() {
		defer close(done)
		fn()
	}()
	select {
	case <-done:
	case <-time.After(timeout):
	}
}

// stopDMXPartyInternal tears down party mode. When wait is true (normal UI/shutdown path),
// it joins the worker goroutine. When wait is false (called from the worker itself, e.g.
// DMX disconnect), it must not join — otherwise the worker deadlocks on its own WaitGroup.
//
// Stopping must ALWAYS succeed promptly: the running flag is cleared and the worker is
// cancelled up front, and the blocking cleanup (audio backend, worker join) runs under a
// timeout so a stuck audio device or a wedged DMX write can never prevent turning party off.
func (c *WLEDController) stopDMXPartyInternal(reason string, wait bool) {
	// Mark stopped and cancel the worker FIRST so GetDMXState/GetDMXPartyState and the UI
	// poll path see party off immediately (worker may still be finishing one frame).
	c.mu.Lock()
	party := normalizeDMXPartyState(c.dmxState.Party)
	party.Config.Enabled = false
	party.Status.Running = false
	party.Status.PartyBlocksManualPatch = false
	if reason != "" {
		party.Status.Error = strings.TrimSpace(reason)
	}
	c.dmxState.Party = party
	c.updated = time.Now()
	c.mu.Unlock()

	c.dmxLiveMu.Lock()
	cancel := c.dmxPartyCancel
	running := c.dmxPartyRunning
	c.dmxPartyCancel = nil
	c.dmxPartyRunning = false
	c.clearAllPartyOwnedLocked()
	c.dmxLiveMu.Unlock()
	if cancel != nil {
		cancel()
	}

	// Cleanup that can block on external resources — bounded so stop never hangs.
	runWithTimeout(c.stopPartyAudioCapture, partyStopCleanupTimeout)
	if running && wait {
		runWithTimeout(c.dmxPartyWG.Wait, partyStopCleanupTimeout)
	}

	// Worker may have set Running=true on its last frame; force stopped again.
	c.mu.Lock()
	party = normalizeDMXPartyState(c.dmxState.Party)
	party.Config.Enabled = false
	party.Status.Running = false
	party.Status.PartyBlocksManualPatch = false
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
	return c.dmxLiveRunning && c.hasAnyDMXLiveAdapterLocked()
}

func (c *WLEDController) dmxPartyWorker(ctx context.Context) {
	defer func() {
		if recovered := recover(); recovered != nil {
			c.logger.Printf("dmx party worker panic: %v\n%s", recovered, debug.Stack())
			c.onDMXPartyWorkerCrashed(fmt.Errorf("party mode crashed: %v", recovered))
		}
		c.dmxPartyWG.Done()
	}()
	ticker := time.NewTicker(time.Second / dmxLiveFrameHz)
	defer ticker.Stop()

	var motionPhase float64
	var colorPhase float64
	frameCount := 0
	burstAnchor := time.Now()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			func() {
				defer func() {
					if recovered := recover(); recovered != nil {
						c.logger.Printf("dmx party frame panic: %v\n%s", recovered, debug.Stack())
					}
				}()
				if ctx.Err() != nil {
					return
				}
				c.dmxLiveMu.Lock()
				stillRunning := c.dmxPartyRunning
				c.dmxLiveMu.Unlock()
				if !stillRunning {
					return
				}
				state := c.GetDMXPartyState()
				if !state.Config.Enabled || !state.Status.Running {
					return
				}

				c.mu.RLock()
				fixtures := append([]DMXFixture(nil), c.dmxState.Fixtures...)
				devices := cloneDeviceMap(c.devices)
				c.mu.RUnlock()
				dmxTargets := partyDMXTargets(fixtures, state.Config)
				wledTargets := filterPartyWLEDDevices(devices, state.Config.WLEDDeviceIDs)
				if len(dmxTargets) == 0 && len(wledTargets) == 0 {
					return
				}

				values := computePartyPhaseValues(state, now)
				advancePartyPhases(values, &motionPhase, &colorPhase)

				if len(dmxTargets) > 0 {
					if !c.dmxLiveIsConnected() {
						c.stopDMXPartyInternal("dmx live output is disconnected", false)
						return
					}
					updates, owned := c.buildDMXPartyFrame(state, motionPhase, colorPhase, values, dmxTargets, now, burstAnchor)
					updates = expandDMXUpdatesToSlaves(fixtures, updates, &owned)
					if len(updates) > 0 {
						c.dmxLiveMu.Lock()
						if !c.dmxLiveRunning || !c.dmxPartyRunning {
							c.dmxLiveMu.Unlock()
							return
						}
						c.partyOwnedByUniverse = owned
						c.applyDMXLiveUpdatesLocked(updates)
						changedUniverses := make(map[string]struct{})
						for _, u := range updates {
							changedUniverses[resolveUniverseIDForUpdate(u.UniverseID)] = struct{}{}
						}
						for universeID := range changedUniverses {
							c.fanOutUniverseFrameLocked(universeID)
						}
						c.dmxLiveMu.Unlock()
					}
				}

				frameCount++
				if frameCount%4 == 0 && len(wledTargets) > 0 {
					c.applyPartyToWLEDDevices(ctx, state, motionPhase, colorPhase, values)
				}

				c.dmxLiveMu.Lock()
				stillRunning = c.dmxPartyRunning
				c.dmxLiveMu.Unlock()
				if !stillRunning || ctx.Err() != nil {
					return
				}
				c.mu.Lock()
				party := normalizeDMXPartyState(c.dmxState.Party)
				if party.Config.Enabled {
					party.Status.Running = true
					party.Status.Mode = party.Config.Mode
					party.Status.PartyBlocksManualPatch = len(dmxTargets) > 0
					party.Status.LastFrameAt = now
					if party.Audio.CapturedAt.After(time.Time{}) {
						party.Status.LastAudioAt = party.Audio.CapturedAt
					}
					c.dmxState.Party = party
					c.updated = time.Now()
				}
				c.mu.Unlock()
			}()
		}
	}
}

// onDMXPartyWorkerCrashed clears party worker flags without waiting on the worker
// (must not be called from the party worker goroutine while it is still registered in the WaitGroup).
func (c *WLEDController) onDMXPartyWorkerCrashed(err error) {
	reason := "party mode stopped due to an internal error"
	if err != nil {
		reason = err.Error()
	}
	c.stopDMXPartyInternal(reason, false)
}

func (c *WLEDController) buildDMXPartyFrame(
	state DMXPartyState,
	motionPhase float64,
	colorPhase float64,
	values partyPhaseValues,
	targeted []DMXFixture,
	now time.Time,
	burstAnchor time.Time,
) ([]dmx.DMXOutputUpdate, map[string][512]bool) {
	owned := map[string][512]bool{}
	if len(targeted) == 0 {
		return nil, owned
	}

	intensity := values.intensity
	colorVar := values.colorVar
	beat := values.beat
	level := values.level
	mid := values.mid
	treble := values.treble

	updates := make([]dmx.DMXOutputUpdate, 0, len(targeted)*6)
	for idx, fixture := range targeted {
		offset := float64(idx) * 0.4
		fixtureType := normalizeFixtureType(fixture.Type)

		// A fixture with an enabled cue sequence steps through saved poses instead of
		// running the generative algorithm.
		if seq := normalizeFixtureCueSequence(fixture.Party.CueSequence); cueSequenceActive(seq) {
			updates = append(updates, buildCueSequenceUpdates(fixture, seq, burstAnchor, now, &owned)...)
			continue
		}

		for _, ch := range fixture.Channels {
			if !partyAllowsChannel(fixtureType, ch.Type) {
				continue
			}
			if strings.EqualFold(strings.TrimSpace(ch.Type), "custom") && !partyCustomIncludeInMode(ch.Properties) {
				continue
			}
			address := fixture.DMXAddress + ch.Channel - 1
			if address < 1 || address > 512 {
				continue
			}
			universeID := normalizeFixtureUniverseID(fixture.UniverseID, nil)
			next, ok := partyValueForFixtureChannel(
				state,
				fixture,
				fixtureType,
				ch,
				motionPhase+offset,
				colorPhase+offset,
				intensity,
				colorVar,
				level,
				beat,
				mid,
				treble,
				now,
				burstAnchor,
			)
			if !ok {
				continue
			}
			normType := strings.ToLower(strings.TrimSpace(ch.Type))
			wp := fixturePartyChannelWeightPercent(fixture.Party, ch.Channel)
			if wp < 100 {
				neu := partyWeightNeutralByte(ch, normType, fixtureType)
				next = applyPartyChannelMotionWeight(neu, next, wp)
			}
			o := owned[universeID]
			o[address-1] = true
			owned[universeID] = o
			updates = append(updates, dmx.DMXOutputUpdate{UniverseID: universeID, Address: address, Value: next})
		}
	}
	return updates, owned
}

func partyValueForFixtureChannel(
	state DMXPartyState,
	fixture DMXFixture,
	fixtureType DMXFixtureType,
	ch DMXChannel,
	motionPhase float64,
	colorPhase float64,
	intensity float64,
	colorVariation float64,
	audioLevel float64,
	audioBeat float64,
	audioMid float64,
	audioTreble float64,
	now time.Time,
	burstAnchor time.Time,
) (int, bool) {
	normType := strings.ToLower(strings.TrimSpace(ch.Type))
	entries := parseDMXPartyEntries(ch.Properties)
	sweepRange := partySweepRange(state.Config)
	oscSlow := (math.Sin(motionPhase) + 1) * 0.5
	oscFast := (math.Sin(motionPhase*2.5) + 1) * 0.5
	colorOsc := (math.Sin(colorPhase) + 1) * 0.5
	colorOsc2 := (math.Sin(colorPhase+2.09) + 1) * 0.5
	colorOsc3 := (math.Sin(colorPhase+4.18) + 1) * 0.5
	audioBoost := clampPartyLevel(audioLevel*0.6 + audioBeat*0.4)

	switch normType {
	case "dimmer", "dimmerfine":
		if fixtureType == DMXFixtureTypeSmoke || fixtureType == DMXFixtureTypeHazer {
			return partySmokeFixtureOutput(state.Config, ch, normType, burstAnchor, now), true
		}
		v := 45 + 180*intensity
		v += 30 * audioBoost
		if fixtureType == DMXFixtureTypeFan {
			v = 80 + 120*oscSlow*intensity + 40*audioBeat
		}
		return clampDMXByte(int(v)), true
	case "onoff", "lamp":
		if intensity > 0.15 || audioBoost > 0.1 {
			return 255, true
		}
		return 0, true
	case "fog":
		if fixtureType == DMXFixtureTypeSmoke || fixtureType == DMXFixtureTypeHazer {
			return partySmokeFixtureOutput(state.Config, ch, normType, burstAnchor, now), true
		}
		return 0, false
	case "pan", "infinitepan":
		pos := partyPanTiltPos16(fixture, ch, motionPhase, false, sweepRange)
		return int(pos >> 8), true
	case "panfine":
		pos := partyPanTiltPos16(fixture, ch, motionPhase, false, sweepRange)
		return int(pos & 0xFF), true
	case "tilt", "infinitetilt":
		pos := partyPanTiltPos16(fixture, ch, motionPhase, true, sweepRange)
		return int(pos >> 8), true
	case "tiltfine":
		pos := partyPanTiltPos16(fixture, ch, motionPhase, true, sweepRange)
		return int(pos & 0xFF), true
	case "movementspeed":
		return partyMovementSpeedByte(state.Config), true
	case "colorcomponent":
		blend := colorVariation
		r := colorOsc*(0.4+0.6*blend) + audioBoost*0.2 + audioTreble*0.15
		g := colorOsc2*(0.4+0.6*blend) + audioBoost*0.2
		b := colorOsc3*(0.4+0.6*blend) + audioBoost*0.2 + audioMid*0.1
		mix := (r + g + b) / 3.0
		return clampDMXByte(int(mix * 255)), true
	case "colorwheel", "colortemperature", "greensaturation", "xfadetocolor":
		if len(entries) > 0 {
			slot := partySlotIndex(colorPhase, len(entries), audioTreble)
			return partyEntryMid(entries, slot), true
		}
		v := (colorOsc*0.7 + colorOsc2*0.3)
		v = v*(0.4+0.6*colorVariation) + audioBoost*0.15 + audioTreble*0.1
		return clampDMXByte(int(v * 255)), true
	case "gobowheel", "goboindexing", "goborotation", "goboshake":
		if len(entries) > 0 {
			slot := partySlotIndex(motionPhase, len(entries), audioMid)
			return partyEntryMid(entries, slot), true
		}
		base := (oscFast*0.6 + audioBeat*0.4)
		return clampDMXByte(int(base * 255)), true
	case "shutterstrobe":
		fp := normalizeFixtureParty(fixture.Party)
		if len(entries) > 0 {
			if !fp.StrobeEnabled {
				idx := partyShutterEntryIndex(entries, false)
				return partyEntryMid(entries, idx), true
			}
			strobe := partyStrobeGateMS(fp, now)
			if state.Config.Mode == DMXPartyModeAudio {
				strobe = strobe || audioBeat > 0.32
			} else if fixtureType == DMXFixtureTypeStrobe {
				strobe = strobe || oscFast > 0.55
			}
			idx := partyShutterEntryIndex(entries, strobe)
			if idx >= 0 {
				return partyEntryMid(entries, idx), true
			}
		}
		if !fp.StrobeEnabled {
			v := oscFast*(0.3+0.7*intensity) + audioBoost*0.2
			if fixtureType == DMXFixtureTypeStrobe {
				v = 0.4 + 0.6*oscFast + audioBeat*0.4
			}
			return clampDMXByte(int(v * 255)), true
		}
		if partyStrobeGateMS(fp, now) {
			return clampDMXByte(int((0.55 + 0.45*oscFast) * 255)), true
		}
		return clampDMXByte(int(oscSlow * 12)), true
	case "zoom", "focus", "frost", "iris", "prism", "prismrotation":
		v := oscFast*(0.3+0.7*intensity) + audioBoost*0.2
		return clampDMXByte(int(v * 255)), true
	case "custom":
		return partyCustomChannelValue(state, fixture, ch, fixtureType, colorPhase, intensity, colorVariation, audioBoost, audioBeat, audioMid, audioTreble, oscSlow, oscFast, now)
	default:
		return 0, false
	}
}

func partyCustomChannelLabel(props map[string]any) string {
	if props == nil {
		return ""
	}
	if label, ok := props["label"].(string); ok {
		return strings.TrimSpace(label)
	}
	if name, ok := props["name"].(string); ok {
		return strings.TrimSpace(name)
	}
	return ""
}

func partyCustomChannelValue(
	state DMXPartyState,
	fixture DMXFixture,
	ch DMXChannel,
	fixtureType DMXFixtureType,
	colorPhase float64,
	intensity float64,
	colorVariation float64,
	audioBoost float64,
	audioBeat float64,
	audioMid float64,
	audioTreble float64,
	oscSlow float64,
	oscFast float64,
	now time.Time,
) (int, bool) {
	label := strings.ToLower(partyCustomChannelLabel(ch.Properties))
	entries := parseDMXPartyEntries(ch.Properties)
	fp := normalizeFixtureParty(fixture.Party)
	colorOsc := (math.Sin(colorPhase) + 1) * 0.5
	colorOsc2 := (math.Sin(colorPhase+2.09) + 1) * 0.5
	colorOsc3 := (math.Sin(colorPhase+4.18) + 1) * 0.5
	blend := colorVariation

	switch fixtureType {
	case DMXFixtureTypeColorChanger, DMXFixtureTypeLEDBarBeams, DMXFixtureTypeLEDBarPixels:
		switch {
		case strings.Contains(label, "rot") || strings.Contains(label, "red"):
			v := colorOsc*(0.4+0.6*blend) + audioBoost*0.2 + audioTreble*0.15
			return clampDMXByte(int(v * 255)), true
		case strings.Contains(label, "grün") || strings.Contains(label, "grun") || strings.Contains(label, "green"):
			v := colorOsc2*(0.4+0.6*blend) + audioBoost*0.2
			return clampDMXByte(int(v * 255)), true
		case strings.Contains(label, "blau") || strings.Contains(label, "blue"):
			v := colorOsc3*(0.4+0.6*blend) + audioBoost*0.2 + audioMid*0.1
			return clampDMXByte(int(v * 255)), true
		case strings.Contains(label, "wei") || strings.Contains(label, "white"):
			v := ((colorOsc+colorOsc2+colorOsc3)/3.0)*(0.35+0.65*blend) + audioBoost*0.15
			return clampDMXByte(int(v * 255)), true
		case strings.Contains(label, "strob") || strings.Contains(label, "sound"):
			if len(entries) > 0 {
				if !fp.StrobeEnabled {
					idx := partyShutterEntryIndex(entries, false)
					return partyEntryMid(entries, idx), true
				}
				strobe := partyStrobeGateMS(fp, now) || audioBeat > 0.32
				idx := partyShutterEntryIndex(entries, strobe)
				if idx >= 0 {
					return partyEntryMid(entries, idx), true
				}
			}
			if !fp.StrobeEnabled {
				return clampDMXByte(int(oscSlow * 5)), true
			}
			if partyStrobeGateMS(fp, now) || audioBeat > 0.35 {
				return clampDMXByte(int((0.4 + 0.6*oscFast) * 255)), true
			}
			return clampDMXByte(int(oscSlow * 5)), true
		}
	}

	if len(entries) > 0 {
		slot := partySlotIndex(colorPhase, len(entries), audioTreble)
		return partyEntryMid(entries, slot), true
	}
	v := 45 + 180*intensity*oscSlow + 30*audioBoost
	return clampDMXByte(int(v)), true
}

func filterPartyFixtures(fixtures []DMXFixture, fixtureIDs []string) []DMXFixture {
	if len(fixtureIDs) == 0 {
		return nil
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
		return nil
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

func partyDMXTargets(fixtures []DMXFixture, cfg DMXPartyConfig) []DMXFixture {
	targeted := filterPartyMasterFixtures(fixtures, cfg.FixtureIDs)
	if clampPercent(cfg.SmokeVolume) <= 0 {
		return targeted
	}
	have := make(map[string]struct{}, len(targeted))
	for _, fixture := range targeted {
		have[fixture.ID] = struct{}{}
	}
	for _, fixture := range fixtures {
		ft := normalizeFixtureType(fixture.Type)
		if ft != DMXFixtureTypeSmoke && ft != DMXFixtureTypeHazer {
			continue
		}
		if _, ok := have[fixture.ID]; ok {
			continue
		}
		targeted = append(targeted, fixture)
		have[fixture.ID] = struct{}{}
	}
	if len(targeted) == 0 {
		return targeted
	}
	slices.SortFunc(targeted, func(a, b DMXFixture) int {
		if a.DMXAddress < b.DMXAddress {
			return -1
		}
		if a.DMXAddress > b.DMXAddress {
			return 1
		}
		return strings.Compare(a.ID, b.ID)
	})
	return targeted
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
