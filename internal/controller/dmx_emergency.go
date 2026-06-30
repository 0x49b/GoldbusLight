package controller

import (
	"fmt"
	"goldbus/internal/console"
	"strings"
	"time"
)

// DMXEmergencyStop stops party mode, sends a full-universe blackout when live output
// is active, then stops DMX live output (USB/Art-Net workers).
func (c *WLEDController) DMXEmergencyStop() error {
	if !c.dmxEnabled() {
		return fmt.Errorf("dmx component is disabled in settings")
	}

	c.StopDMXParty()

	c.dmxLiveMu.Lock()
	hadOutput := c.dmxLiveRunning && c.hasAnyDMXLiveAdapterLocked()
	if hadOutput {
		c.blackoutAllDMXLiveUniversesLocked()
		c.clearAllPartyOwnedLocked()
		c.fanOutAllDMXLiveUniversesLocked()

		if c.console != nil {
			now := time.Now()
			if now.Sub(c.dmxLivePatchLog) >= dmxLivePatchConsoleInterval {
				c.dmxLivePatchLog = now
				summary := "Emergency stop: party off, universe blackout, live output stopped"
				paths, _ := c.collectDMXLiveStatusPaths()
				for _, target := range paths {
					if strings.Contains(target, "artnet") || strings.HasPrefix(target, "sim://artnet") {
						c.console.Out(console.TransportArtNet, target, summary, "all channels 0")
					} else {
						c.console.Out(console.TransportUSBDMX, target, summary, "all channels 0")
					}
				}
			}
		}
	}
	c.dmxLiveMu.Unlock()

	c.StopDMXLive()
	return nil
}
