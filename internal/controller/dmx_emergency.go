package controller

import (
	"fmt"
	"goldbus/internal/console"
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
	hadOutput := c.dmxLiveRunning && (c.dmxLiveUSBFrames != nil || c.dmxLiveArtFrames != nil)
	if hadOutput {
		for i := range c.dmxLiveBuf {
			c.dmxLiveBuf[i] = 0
		}
		c.partyOwnedAddrs = [512]bool{}
		frame := c.dmxLiveBuf
		queueLatestDMXFrame(c.dmxLiveUSBFrames, frame)
		queueLatestDMXFrame(c.dmxLiveArtFrames, frame)

		if c.console != nil {
			now := time.Now()
			if now.Sub(c.dmxLivePatchLog) >= dmxLivePatchConsoleInterval {
				c.dmxLivePatchLog = now
				summary := "Emergency stop: party off, universe blackout, live output stopped"
				if c.dmxLiveUSBFrames != nil {
					target := c.dmxLiveUSBPath
					if target == "" {
						target = "usb"
					}
					c.console.Out(console.TransportUSBDMX, target, summary, "all channels 0")
				}
				if c.dmxLiveArtFrames != nil {
					target := c.dmxLiveArtTarget
					if target == "" {
						target = c.dmxLiveArtPath
					}
					if target == "" {
						target = "artnet"
					}
					c.console.Out(console.TransportArtNet, target, summary, "all channels 0")
				}
			}
		}
	}
	c.dmxLiveMu.Unlock()

	c.StopDMXLive()
	return nil
}
