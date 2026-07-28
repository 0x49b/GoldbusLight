package controller

import (
	"context"
	"math"
	"slices"
	"strings"
	"time"
)

func filterPartyWLEDDevices(devices map[string]WLEDDevice, deviceIDs []string) []WLEDDevice {
	if len(deviceIDs) == 0 {
		return nil
	}
	ids := map[string]struct{}{}
	for _, id := range deviceIDs {
		t := strings.TrimSpace(id)
		if t == "" {
			continue
		}
		ids[t] = struct{}{}
	}
	if len(ids) == 0 {
		return nil
	}
	out := make([]WLEDDevice, 0, len(ids))
	for id, device := range devices {
		if _, ok := ids[id]; !ok {
			continue
		}
		if device.Ignored || !device.Online {
			continue
		}
		out = append(out, device)
	}
	slices.SortFunc(out, func(a, b WLEDDevice) int {
		na := strings.ToLower(strings.TrimSpace(a.Name))
		nb := strings.ToLower(strings.TrimSpace(b.Name))
		if cmp := strings.Compare(na, nb); cmp != 0 {
			return cmp
		}
		return strings.Compare(a.ID, b.ID)
	})
	return out
}

type partyPhaseValues struct {
	intensity   float64
	colorVar    float64
	level       float64
	bass        float64
	beat        float64
	mid         float64
	treble      float64
	speedFactor float64
}

func computePartyPhaseValues(state DMXPartyState, at time.Time) partyPhaseValues {
	intensity := float64(state.Config.Intensity) / 100.0
	colorVar := float64(state.Config.ColorVariation) / 100.0
	speedFactor := 0.2 + (float64(state.Config.Speed) / 100.0 * 1.8)
	level := 0.0
	bass := 0.0
	beat := 0.0
	mid := 0.0
	treble := 0.0
	if state.Config.Mode == DMXPartyModeAudio {
		audioAge := at.Sub(state.Audio.CapturedAt)
		if state.Audio.CapturedAt.IsZero() || audioAge > 2*time.Second {
			level = 0
			bass = 0
			beat = 0
			mid = 0
			treble = 0
		} else {
			sens := 0.5 + float64(state.Config.AudioSensitivity)/100.0
			level = clampPartyLevel(state.Audio.Level * sens)
			bass = clampPartyLevel(state.Audio.Bass * sens)
			beat = clampPartyLevel(state.Audio.Beat * sens)
			mid = clampPartyLevel(state.Audio.Mid * sens)
			treble = clampPartyLevel(state.Audio.Treble * sens)
			intensity = clampPartyLevel(intensity*0.5 + level*0.5)
			speedFactor += beat * 1.2
		}
	}
	return partyPhaseValues{
		intensity:   intensity,
		colorVar:    colorVar,
		level:       level,
		bass:        bass,
		beat:        beat,
		mid:         mid,
		treble:      treble,
		speedFactor: speedFactor,
	}
}

func advancePartyPhases(values partyPhaseValues, motionPhase, colorPhase *float64) {
	*motionPhase += 0.07 * values.speedFactor
	*colorPhase += 0.05 * values.speedFactor * (1 + values.treble*0.5)
}

func advancePartyWLEDColorPhase(cfg DMXPartyConfig, values partyPhaseValues, wledColorPhase *float64) {
	speed := float64(clampDMXByte(cfg.WLEDSpeed)) / 255.0
	factor := 0.15 + speed*2.4
	if values.beat > 0 {
		factor += values.beat * 0.8
	}
	*wledColorPhase += 0.05 * factor * (1 + values.treble*0.5)
}

func (c *WLEDController) applyPartyToWLEDDevices(ctx context.Context, state DMXPartyState, wledColorPhase float64, values partyPhaseValues) {
	if !c.wledEnabled() {
		return
	}
	c.mu.RLock()
	devices := filterPartyWLEDDevices(c.devices, state.Config.WLEDDeviceIDs)
	c.mu.RUnlock()
	if len(devices) == 0 {
		return
	}

	bri := partyWLEDBrightness(state.Config, values)

	for _, device := range devices {
		device := device
		settings := partyWLEDDeviceSettings(state.Config, device.ID)
		seg := map[string]any{
			"id":  0,
			"fx":  settings.Fx,
			"pal": settings.Pal,
			"sx":  settings.Sx,
			"ix":  settings.Ix,
		}
		// Solid (fx 0): sweep hue using color variation + WLED speed; intensity is brightness.
		if settings.Fx == 0 {
			hue := partyWLEDSolidHue(state, wledColorPhase, values)
			r, g, b := partyHueToRGB(hue)
			seg["col"] = []any{[]any{r, g, b}}
		}
		payload := map[string]any{
			"on":  true,
			"bri": bri,
			"seg": []any{seg},
		}
		func() {
			defer func() {
				if recovered := recover(); recovered != nil {
					c.logger.Printf("party wled apply panic for %s: %v", device.ID, recovered)
				}
			}()
			if isNoOpStatePatch(device.LastState, payload) {
				return
			}
			if err := c.applyWLEDState(ctx, device, payload); err != nil {
				c.logger.Printf("party wled state failed for %s: %v", device.ID, err)
				return
			}
			c.mu.Lock()
			if latest, ok := c.devices[device.ID]; ok {
				latest.LastSeen = time.Now()
				latest.Online = true
				latest.LastState = mergeStateIntoLastState(latest.LastState, payload)
				c.devices[device.ID] = latest
			}
			c.updated = time.Now()
			c.mu.Unlock()
		}()
	}
}

func partyWLEDDeviceSettings(cfg DMXPartyConfig, deviceID string) DMXPartyWLEDDeviceSettings {
	out := DMXPartyWLEDDeviceSettings{
		Fx:  0,
		Pal: 0,
		Sx:  defaultPartyWLEDEffectSX,
		Ix:  defaultPartyWLEDEffectIX,
	}
	if cfg.WLEDDeviceSettings == nil {
		return out
	}
	settings, ok := cfg.WLEDDeviceSettings[deviceID]
	if !ok {
		return out
	}
	out.Fx = clampNonNegative(settings.Fx)
	out.Pal = clampNonNegative(settings.Pal)
	out.Sx = clampDMXByte(settings.Sx)
	out.Ix = clampDMXByte(settings.Ix)
	return out
}

func partyWLEDSolidHue(state DMXPartyState, wledColorPhase float64, values partyPhaseValues) float64 {
	colorVar := values.colorVar
	if colorVar < 0 {
		colorVar = 0
	}
	if colorVar > 1 {
		colorVar = 1
	}
	if state.Config.Mode == DMXPartyModeAudio {
		total := values.bass + values.mid + values.treble + 0.001
		base := (values.bass*0 + values.mid*120 + values.treble*240) / total
		// colorVariation widens how far audio hue can swing.
		base += math.Sin(wledColorPhase) * 180 * colorVar
		return math.Mod(math.Mod(base, 360)+360, 360)
	}
	// Auto: continuous hue sweep; colorVariation scales how much of the wheel is used.
	if colorVar <= 0.001 {
		return 0
	}
	full := math.Mod(wledColorPhase*180/math.Pi, 360)
	if full < 0 {
		full += 360
	}
	return math.Mod(full*colorVar, 360)
}

func partyWLEDBrightness(cfg DMXPartyConfig, values partyPhaseValues) int {
	bri := clampDMXByte(cfg.WLEDBrightness)
	if values.level > 0 {
		bri = int(float64(bri)*0.45 + float64(bri)*values.level*0.55)
	}
	if values.beat > 0.35 {
		bri = int(math.Min(255, float64(bri)+values.beat*40))
	}
	return clampDMXByte(bri)
}

func partyHueToRGB(hue float64) (int, int, int) {
	hue = math.Mod(hue, 360)
	if hue < 0 {
		hue += 360
	}
	s := 1.0
	v := 1.0
	c := v * s
	x := c * (1 - math.Abs(math.Mod(hue/60, 2)-1))
	m := v - c
	var r, g, b float64
	switch {
	case hue < 60:
		r, g, b = c, x, 0
	case hue < 120:
		r, g, b = x, c, 0
	case hue < 180:
		r, g, b = 0, c, x
	case hue < 240:
		r, g, b = 0, x, c
	case hue < 300:
		r, g, b = x, 0, c
	default:
		r, g, b = c, 0, x
	}
	return clampDMXByte(int((r + m) * 255)), clampDMXByte(int((g + m) * 255)), clampDMXByte(int((b + m) * 255))
}
