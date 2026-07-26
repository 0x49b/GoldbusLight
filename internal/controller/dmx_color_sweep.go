package controller

import (
	"context"
	"goldbus/internal/dmx"
	"math"
	"runtime/debug"
	"slices"
	"strings"
	"time"
)

const (
	colorSweepDirectionLTR = "ltr"
	colorSweepDirectionRTL = "rtl"
	defaultColorSweepSpeed = 50
)

func normalizeColorSweep(s DMXColorSweep, fixtureType DMXFixtureType) DMXColorSweep {
	if normalizeFixtureType(fixtureType) != DMXFixtureTypeColorChanger {
		return DMXColorSweep{}
	}
	out := DMXColorSweep{
		Enabled:   s.Enabled,
		Direction: strings.ToLower(strings.TrimSpace(s.Direction)),
		Speed:     s.Speed,
	}
	if out.Direction != colorSweepDirectionRTL {
		out.Direction = colorSweepDirectionLTR
	}
	if out.Speed < 1 {
		out.Speed = defaultColorSweepSpeed
	}
	if out.Speed > 100 {
		out.Speed = 100
	}
	if !out.Enabled && out.Direction == colorSweepDirectionLTR && out.Speed == defaultColorSweepSpeed {
		return DMXColorSweep{}
	}
	return out
}

func colorSweepActive(fixture DMXFixture) bool {
	if normalizeFixtureType(fixture.Type) != DMXFixtureTypeColorChanger {
		return false
	}
	if isDMXSlaveFixture(fixture) {
		return false
	}
	return normalizeColorSweep(fixture.ColorSweep, fixture.Type).Enabled
}

// colorSweepChain returns master followed by its slaves, ordered by DMX address then id.
func colorSweepChain(fixtures []DMXFixture, master DMXFixture) []DMXFixture {
	slaves := dmxSlaveFixtures(fixtures, master.ID)
	slices.SortFunc(slaves, func(a, b DMXFixture) int {
		if a.DMXAddress != b.DMXAddress {
			return a.DMXAddress - b.DMXAddress
		}
		return strings.Compare(a.ID, b.ID)
	})
	out := make([]DMXFixture, 0, 1+len(slaves))
	out = append(out, master)
	out = append(out, slaves...)
	return out
}

func colorSweepHueAdvance(speed int) float64 {
	// At speed 50 ≈ 2.5° per frame @ 44Hz → ~3.3s per full cycle.
	s := float64(speed)
	if s < 1 {
		s = defaultColorSweepSpeed
	}
	if s > 100 {
		s = 100
	}
	return (s / 50.0) * 2.5
}

// colorSweepChannelRole maps a channel to r/g/b/w/dimmer for Color Changer output.
func colorSweepChannelRole(ch DMXChannel) string {
	normType := strings.ToLower(strings.TrimSpace(ch.Type))
	switch normType {
	case "dimmer", "dimmerfine":
		return "dimmer"
	case "colorcomponent":
		label := strings.ToLower(partyCustomChannelLabel(ch.Properties))
		return colorSweepRoleFromLabel(label)
	case "custom":
		label := strings.ToLower(partyCustomChannelLabel(ch.Properties))
		if strings.Contains(label, "strob") || strings.Contains(label, "sound") {
			return ""
		}
		return colorSweepRoleFromLabel(label)
	default:
		return ""
	}
}

func colorSweepRoleFromLabel(label string) string {
	label = strings.ToLower(strings.TrimSpace(label))
	if label == "" {
		return ""
	}
	switch {
	case label == "r" || strings.Contains(label, "red") || strings.Contains(label, "rot"):
		return "r"
	case label == "g" || strings.Contains(label, "green") || strings.Contains(label, "grün") || strings.Contains(label, "grun") || strings.Contains(label, "gruen"):
		return "g"
	case label == "b" || strings.Contains(label, "blue") || strings.Contains(label, "blau"):
		return "b"
	case label == "w" || strings.Contains(label, "white") || strings.Contains(label, "wei"):
		return "w"
	default:
		return ""
	}
}

func buildColorSweepUpdatesForMaster(
	fixtures []DMXFixture,
	master DMXFixture,
	baseHue float64,
	intensity float64,
	owned *map[string][512]bool,
) []dmx.DMXOutputUpdate {
	sweep := normalizeColorSweep(master.ColorSweep, master.Type)
	if !sweep.Enabled {
		return nil
	}
	chain := colorSweepChain(fixtures, master)
	n := len(chain)
	if n == 0 {
		return nil
	}
	bri := clampDMXByte(int(math.Round(255 * clampPartyLevel(intensity))))
	if bri < 1 {
		bri = 1
	}
	updates := make([]dmx.DMXOutputUpdate, 0, n*5)
	for i, fx := range chain {
		idx := i
		if sweep.Direction == colorSweepDirectionRTL {
			idx = n - 1 - i
		}
		hueStep := 360.0 / float64(n)
		hue := baseHue + float64(idx)*hueStep
		r, g, b := partyHueToRGB(hue)
		universeID := normalizeFixtureUniverseID(fx.UniverseID, nil)
		base := fx.DMXAddress
		if base < 1 || base > 512 {
			base = 1
		}
		for _, ch := range fx.Channels {
			role := colorSweepChannelRole(ch)
			if role == "" {
				continue
			}
			addr := base + ch.Channel - 1
			if addr < 1 || addr > 512 {
				continue
			}
			var value int
			switch role {
			case "r":
				value = r
			case "g":
				value = g
			case "b":
				value = b
			case "w":
				value = 0
			case "dimmer":
				value = bri
			default:
				continue
			}
			if owned != nil {
				if *owned == nil {
					*owned = map[string][512]bool{}
				}
				o := (*owned)[universeID]
				o[addr-1] = true
				(*owned)[universeID] = o
			}
			updates = append(updates, dmx.DMXOutputUpdate{
				UniverseID: universeID,
				Address:    addr,
				Value:      value,
			})
		}
	}
	return updates
}

func buildAllColorSweepUpdates(
	fixtures []DMXFixture,
	baseHue float64,
	intensity float64,
	owned *map[string][512]bool,
) []dmx.DMXOutputUpdate {
	updates := make([]dmx.DMXOutputUpdate, 0)
	for _, fx := range fixtures {
		if !colorSweepActive(fx) {
			continue
		}
		updates = append(updates, buildColorSweepUpdatesForMaster(fixtures, fx, baseHue, intensity, owned)...)
	}
	return updates
}

func (c *WLEDController) startDMXColorSweepLocked() {
	if c.dmxColorSweepRunning {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	c.dmxColorSweepCancel = cancel
	c.dmxColorSweepRunning = true
	c.dmxColorSweepWG.Add(1)
	go c.dmxColorSweepWorker(ctx)
}

// cancelDMXColorSweepLocked cancels the worker without waiting. Caller must Wait
// on dmxColorSweepWG outside dmxLiveMu to avoid deadlock with the worker.
func (c *WLEDController) cancelDMXColorSweepLocked() {
	cancel := c.dmxColorSweepCancel
	c.dmxColorSweepCancel = nil
	c.dmxColorSweepRunning = false
	if cancel != nil {
		cancel()
	}
}

func (c *WLEDController) dmxColorSweepWorker(ctx context.Context) {
	defer func() {
		if recovered := recover(); recovered != nil {
			c.logger.Printf("dmx color sweep worker panic: %v\n%s", recovered, debug.Stack())
		}
		c.dmxColorSweepWG.Done()
	}()
	ticker := time.NewTicker(time.Second / dmxLiveFrameHz)
	defer ticker.Stop()

	hues := map[string]float64{}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			func() {
				defer func() {
					if recovered := recover(); recovered != nil {
						c.logger.Printf("dmx color sweep frame panic: %v\n%s", recovered, debug.Stack())
					}
				}()
				if ctx.Err() != nil {
					return
				}
				c.dmxLiveMu.Lock()
				liveOK := c.dmxLiveRunning && c.hasAnyDMXLiveAdapterLocked()
				partyRunning := c.dmxPartyRunning
				c.dmxLiveMu.Unlock()
				if !liveOK || partyRunning {
					return
				}

				c.mu.RLock()
				fixtures := append([]DMXFixture(nil), c.dmxState.Fixtures...)
				c.mu.RUnlock()

				updates := make([]dmx.DMXOutputUpdate, 0)
				activeIDs := map[string]struct{}{}
				for _, fx := range fixtures {
					if !colorSweepActive(fx) {
						continue
					}
					activeIDs[fx.ID] = struct{}{}
					sweep := normalizeColorSweep(fx.ColorSweep, fx.Type)
					hues[fx.ID] = math.Mod(hues[fx.ID]+colorSweepHueAdvance(sweep.Speed), 360)
					updates = append(updates, buildColorSweepUpdatesForMaster(fixtures, fx, hues[fx.ID], 1.0, nil)...)
				}
				for id := range hues {
					if _, ok := activeIDs[id]; !ok {
						delete(hues, id)
					}
				}
				if len(updates) == 0 {
					return
				}

				c.dmxLiveMu.Lock()
				if !c.dmxLiveRunning || c.dmxPartyRunning {
					c.dmxLiveMu.Unlock()
					return
				}
				c.applyDMXLiveUpdatesLocked(updates)
				changedUniverses := make(map[string]struct{})
				for _, u := range updates {
					changedUniverses[resolveUniverseIDForUpdate(u.UniverseID)] = struct{}{}
				}
				for universeID := range changedUniverses {
					c.fanOutUniverseFrameLocked(universeID)
				}
				c.dmxLiveMu.Unlock()
			}()
		}
	}
}
