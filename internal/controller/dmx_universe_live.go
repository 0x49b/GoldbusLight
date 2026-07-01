package controller

import (
	"fmt"
	"strings"
	"time"

	"goldbus/internal/console"
	"goldbus/internal/dmx"
	serial2 "goldbus/internal/serial"
	"net"

	goserial "go.bug.st/serial"
)

type dmxUniverseLiveRuntime struct {
	buf          [512]byte
	usbFrames    chan [512]byte
	usbPath      string
	usbName      string
	usbRecoverAt time.Time
	artFrames    chan [512]byte
	artPath      string
	artName      string
	artTarget    string
	artHz        int
}

func (c *WLEDController) ensureDMXLiveUniversesLocked() {
	if c.dmxLiveUniverses == nil {
		c.dmxLiveUniverses = map[string]*dmxUniverseLiveRuntime{}
	}
}

func (c *WLEDController) dmxLiveRuntime(universeID string) *dmxUniverseLiveRuntime {
	c.ensureDMXLiveUniversesLocked()
	if rt, ok := c.dmxLiveUniverses[universeID]; ok {
		return rt
	}
	rt := &dmxUniverseLiveRuntime{}
	c.dmxLiveUniverses[universeID] = rt
	return rt
}

func (c *WLEDController) hasAnyDMXLiveAdapterLocked() bool {
	for _, rt := range c.dmxLiveUniverses {
		if rt.usbFrames != nil || rt.artFrames != nil {
			return true
		}
	}
	return false
}

func (c *WLEDController) clearDMXLiveRunningIfNoAdaptersLocked() {
	if !c.hasAnyDMXLiveAdapterLocked() {
		c.dmxLiveRunning = false
		c.dmxLiveErr = ""
		c.dmxLiveFixID = ""
	}
}

func (c *WLEDController) stopDMXUSBAdapterForUniverseLocked(universeID string) {
	rt := c.dmxLiveRuntime(universeID)
	if rt.usbFrames != nil {
		close(rt.usbFrames)
		rt.usbFrames = nil
	}
	rt.usbPath = ""
	rt.usbName = ""
	rt.usbRecoverAt = time.Time{}
}

func (c *WLEDController) stopDMXArtNetAdapterForUniverseLocked(universeID string) {
	rt := c.dmxLiveRuntime(universeID)
	if rt.artFrames != nil {
		close(rt.artFrames)
		rt.artFrames = nil
	}
	rt.artPath = ""
	rt.artName = ""
	rt.artTarget = ""
	rt.artHz = 0
}

func (c *WLEDController) stopDMXUSBAdapterForUniverseAndWait(universeID string) {
	c.dmxLiveMu.Lock()
	hadWorker := c.dmxLiveRuntime(universeID).usbFrames != nil
	c.stopDMXUSBAdapterForUniverseLocked(universeID)
	c.dmxLiveMu.Unlock()
	if hadWorker {
		c.dmxLiveUSBWG.Wait()
	}
}

func (c *WLEDController) stopDMXArtNetAdapterForUniverseAndWait(universeID string) {
	c.dmxLiveMu.Lock()
	hadWorker := c.dmxLiveRuntime(universeID).artFrames != nil
	c.stopDMXArtNetAdapterForUniverseLocked(universeID)
	c.dmxLiveMu.Unlock()
	if hadWorker {
		c.dmxLiveArtWG.Wait()
	}
}

func (c *WLEDController) stopAllDMXLiveAdaptersLocked() {
	for id := range c.dmxLiveUniverses {
		c.stopDMXUSBAdapterForUniverseLocked(id)
		c.stopDMXArtNetAdapterForUniverseLocked(id)
	}
}

func (c *WLEDController) stopAllDMXLiveAdaptersAndWait() {
	c.dmxLiveMu.Lock()
	ids := make([]string, 0, len(c.dmxLiveUniverses))
	for id := range c.dmxLiveUniverses {
		ids = append(ids, id)
	}
	c.stopAllDMXLiveAdaptersLocked()
	c.dmxLiveMu.Unlock()
	c.dmxLiveUSBWG.Wait()
	c.dmxLiveArtWG.Wait()
}

func (c *WLEDController) fanOutUniverseFrameLocked(universeID string) {
	rt := c.dmxLiveRuntime(universeID)
	frame := rt.buf
	queueLatestDMXFrame(rt.usbFrames, frame)
	queueLatestDMXFrame(rt.artFrames, frame)
}

func (c *WLEDController) applyDMXUpdatesToUniverseLocked(universeID string, updates []dmx.DMXOutputUpdate) int {
	rt := c.dmxLiveRuntime(universeID)
	changedCount := 0
	for _, u := range updates {
		addr := u.Address
		if addr < 1 || addr > 512 {
			continue
		}
		v := clampDMXByte(u.Value)
		next := byte(v)
		idx := addr - 1
		if rt.buf[idx] == next {
			continue
		}
		rt.buf[idx] = next
		changedCount++
	}
	return changedCount
}

func (c *WLEDController) blackoutAllDMXLiveUniversesLocked() {
	for _, rt := range c.dmxLiveUniverses {
		for i := range rt.buf {
			rt.buf[i] = 0
		}
	}
}

func (c *WLEDController) fanOutAllDMXLiveUniversesLocked() {
	for id := range c.dmxLiveUniverses {
		c.fanOutUniverseFrameLocked(id)
	}
}

func (c *WLEDController) resolveUSBDeviceForUniverse(universeID string) (serial2.USBSerialDevice, error) {
	iface := c.universeInterfaceSettings(universeID)
	deviceID := strings.TrimSpace(iface.SelectedUSBDeviceID)
	if deviceID == "" {
		return serial2.USBSerialDevice{}, fmt.Errorf("no USB DMX device selected for %s; choose one in Settings", universeID)
	}
	dev, ok := dmx.PickUSBSerialDevice(deviceID, c.listUSBSerialDevicesWithSimulators())
	if !ok {
		return serial2.USBSerialDevice{}, fmt.Errorf("selected USB serial device is not currently attached for %s", universeID)
	}
	if strings.TrimSpace(dev.Path) == "" {
		return serial2.USBSerialDevice{}, fmt.Errorf("selected USB device has no path for %s", universeID)
	}
	return dev, nil
}

func (c *WLEDController) startDMXUSBAdapterForUniverse(universeID string) error {
	dev, err := c.resolveUSBDeviceForUniverse(universeID)
	if err != nil {
		return err
	}
	if strings.TrimSpace(dev.ID) == simulatedUSBDMXDeviceID {
		return c.startDMXUSBSimulatorForUniverse(universeID, dev)
	}
	return c.startDMXUSBHardwareForUniverse(universeID, dev)
}

func (c *WLEDController) startDMXUSBSimulatorForUniverse(universeID string, dev serial2.USBSerialDevice) error {
	c.dmxLiveMu.Lock()
	if !c.dmxLiveRunning {
		c.dmxLiveMu.Unlock()
		return nil
	}
	rt := c.dmxLiveRuntime(universeID)
	if rt.usbFrames != nil && rt.usbPath == simulatedUSBDMXPath {
		c.dmxLiveMu.Unlock()
		return nil
	}
	c.stopDMXUSBAdapterForUniverseLocked(universeID)
	frameCh := make(chan [512]byte, dmxAdapterQueueDepth)
	rt.usbFrames = frameCh
	rt.usbPath = simulatedUSBDMXPath
	rt.usbName = simulatedUSBDMXName + " (" + universeID + ")"
	seed := rt.buf
	c.dmxLiveUSBWG.Add(1)
	go c.dmxLiveUSBSimulatorWorkerForUniverse(universeID, frameCh, simulatedUSBDMXPath)
	queueLatestDMXFrame(frameCh, seed)
	c.dmxLiveMu.Unlock()

	c.logger.Printf("dmx live: usb simulator adapter started universe=%s", universeID)
	if c.console != nil {
		c.console.Info(console.TransportUSBDMX, simulatedUSBDMXPath, fmt.Sprintf("USB DMX simulator started @ %dHz (%s)", dmxLiveFrameHz, universeID))
	}
	return nil
}

func (c *WLEDController) startDMXUSBHardwareForUniverse(universeID string, dev serial2.USBSerialDevice) error {
	path := strings.TrimSpace(dev.Path)
	rawPath := path
	path = serial2.SerialPortForDMXWrite(path)
	c.dmxLiveMu.Lock()
	if !c.dmxLiveRunning {
		c.dmxLiveMu.Unlock()
		return nil
	}
	rt := c.dmxLiveRuntime(universeID)
	if rt.usbFrames != nil && rt.usbPath == path {
		c.dmxLiveMu.Unlock()
		return nil
	}
	needReplace := rt.usbFrames != nil
	c.dmxLiveMu.Unlock()
	if needReplace {
		c.stopDMXUSBAdapterForUniverseAndWait(universeID)
	}

	mode := &goserial.Mode{BaudRate: 250000, DataBits: 8, Parity: goserial.NoParity, StopBits: goserial.TwoStopBits}
	const openTimeout = 2 * time.Second
	type openResult struct {
		port goserial.Port
		err  error
	}
	attemptPaths := make([]string, 0, 4)
	seenPath := make(map[string]struct{}, 3)
	appendPath := func(candidate string) {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			return
		}
		if _, exists := seenPath[candidate]; exists {
			return
		}
		seenPath[candidate] = struct{}{}
		attemptPaths = append(attemptPaths, candidate)
	}
	ttyFromCu := func(candidate string) string {
		if !strings.HasPrefix(candidate, "/dev/cu.") {
			return ""
		}
		return "/dev/tty." + strings.TrimPrefix(candidate, "/dev/cu.")
	}
	preferTTYFirst := strings.HasPrefix(path, "/dev/cu.usbmodem")
	if preferTTYFirst {
		appendPath(ttyFromCu(path))
		appendPath(path)
		appendPath(ttyFromCu(rawPath))
		appendPath(rawPath)
	} else {
		appendPath(path)
		appendPath(rawPath)
		appendPath(ttyFromCu(path))
		appendPath(ttyFromCu(rawPath))
	}
	var port goserial.Port
	var lastErr error
	openedPath := ""
	for _, attemptPath := range attemptPaths {
		resultCh := make(chan openResult, 1)
		timedOutCh := make(chan struct{})
		go func(openPath string) {
			p, openErr := goserial.Open(openPath, mode)
			select {
			case <-timedOutCh:
				if openErr == nil && p != nil {
					_ = p.Close()
				}
			case resultCh <- openResult{port: p, err: openErr}:
			}
		}(attemptPath)
		select {
		case res := <-resultCh:
			if res.err != nil {
				lastErr = res.err
				continue
			}
			port = res.port
			openedPath = attemptPath
		case <-time.After(openTimeout):
			close(timedOutCh)
			lastErr = fmt.Errorf("open serial port timed out after %dms: %s", openTimeout.Milliseconds(), attemptPath)
			continue
		}
		if port != nil {
			break
		}
	}
	if port == nil {
		if lastErr != nil {
			return lastErr
		}
		return fmt.Errorf("open serial port failed: no usable path for selected adapter")
	}
	path = openedPath
	_ = port.SetReadTimeout(50 * time.Millisecond)

	c.dmxLiveMu.Lock()
	if !c.dmxLiveRunning {
		c.dmxLiveMu.Unlock()
		_ = port.Close()
		return nil
	}
	rt = c.dmxLiveRuntime(universeID)
	frameCh := make(chan [512]byte, dmxAdapterQueueDepth)
	rt.usbFrames = frameCh
	rt.usbPath = path
	rt.usbName = c.dmxLiveUSBDisplayName(path) + " (" + universeID + ")"
	rt.usbRecoverAt = time.Time{}
	seed := rt.buf
	c.dmxLiveUSBWG.Add(1)
	useEnttecPro := dmx.UsesEnttecProProtocol(dev.Description, dev.Name, path)
	go c.dmxLiveUSBWorkerForUniverse(universeID, frameCh, port, path, useEnttecPro)
	queueLatestDMXFrame(frameCh, seed)
	c.dmxLiveMu.Unlock()

	if path != rawPath {
		c.logger.Printf("dmx live: using %s for usb transmit universe=%s (configured path was %s)", path, universeID, rawPath)
	}
	c.logger.Printf("dmx live: usb adapter started universe=%s on %s", universeID, path)
	if c.console != nil {
		proto := "raw 513-byte"
		if useEnttecPro {
			proto = "Enttec Pro"
		}
		c.console.Info(console.TransportUSBDMX, path, fmt.Sprintf("USB DMX adapter started @ %dHz (%s, %s)", dmxLiveFrameHz, proto, universeID))
	}
	return nil
}

func (c *WLEDController) startDMXArtNetSimulatorForUniverse(universeID string, settings ArtNetSettings) error {
	path := fmt.Sprintf("sim://artnet/net-%d/subnet-%d/universe-%d", settings.Net, settings.Subnet, settings.Universe)
	name := fmt.Sprintf("Simulated Art-Net (N%d S%d U%d, %s)", settings.Net, settings.Subnet, settings.Universe, universeID)
	hz := settings.RefreshHz
	if hz <= 0 {
		hz = dmxLiveFrameHz
	}
	c.dmxLiveMu.Lock()
	if !c.dmxLiveRunning {
		c.dmxLiveMu.Unlock()
		return nil
	}
	rt := c.dmxLiveRuntime(universeID)
	if rt.artFrames != nil && rt.artPath == path && rt.artHz == hz {
		c.dmxLiveMu.Unlock()
		return nil
	}
	needReplace := rt.artFrames != nil
	c.dmxLiveMu.Unlock()
	if needReplace {
		c.stopDMXArtNetAdapterForUniverseAndWait(universeID)
	}
	c.dmxLiveMu.Lock()
	if !c.dmxLiveRunning {
		c.dmxLiveMu.Unlock()
		return nil
	}
	rt = c.dmxLiveRuntime(universeID)
	frameCh := make(chan [512]byte, dmxAdapterQueueDepth)
	rt.artFrames = frameCh
	rt.artPath = path
	rt.artName = name
	rt.artTarget = path
	rt.artHz = hz
	seed := rt.buf
	c.dmxLiveArtWG.Add(1)
	go c.dmxLiveArtNetSimulatorWorkerForUniverse(universeID, frameCh, settings, path)
	queueLatestDMXFrame(frameCh, seed)
	c.dmxLiveMu.Unlock()

	c.logger.Printf("dmx live: artnet simulator adapter started universe=%s net=%d subnet=%d universe=%d hz=%d", universeID, settings.Net, settings.Subnet, settings.Universe, hz)
	if c.console != nil {
		c.console.Info(console.TransportArtNet, path,
			fmt.Sprintf("Art-Net simulator started net=%d subnet=%d universe=%d hz=%d (%s)", settings.Net, settings.Subnet, settings.Universe, hz, universeID))
	}
	return nil
}

func (c *WLEDController) startDMXArtNetHardwareForUniverse(universeID string, settings ArtNetSettings) error {
	target := net.JoinHostPort(settings.TargetHost, fmt.Sprintf("%d", settings.Port))
	remote, err := net.ResolveUDPAddr("udp", target)
	if err != nil {
		return fmt.Errorf("resolve art-net target: %w", err)
	}
	conn, err := net.DialUDP("udp", nil, remote)
	if err != nil {
		return fmt.Errorf("open art-net socket: %w", err)
	}
	path := fmt.Sprintf("artnet://%s/net-%d/subnet-%d/universe-%d", remote.String(), settings.Net, settings.Subnet, settings.Universe)
	name := fmt.Sprintf("Art-Net %s (N%d S%d U%d, %s)", remote.String(), settings.Net, settings.Subnet, settings.Universe, universeID)
	hz := settings.RefreshHz
	if hz <= 0 {
		hz = dmxLiveFrameHz
	}
	c.dmxLiveMu.Lock()
	if !c.dmxLiveRunning {
		c.dmxLiveMu.Unlock()
		_ = conn.Close()
		return nil
	}
	rt := c.dmxLiveRuntime(universeID)
	if rt.artFrames != nil && rt.artPath == path && rt.artHz == hz {
		c.dmxLiveMu.Unlock()
		_ = conn.Close()
		return nil
	}
	needReplace := rt.artFrames != nil
	c.dmxLiveMu.Unlock()
	if needReplace {
		c.stopDMXArtNetAdapterForUniverseAndWait(universeID)
	}

	c.dmxLiveMu.Lock()
	if !c.dmxLiveRunning {
		c.dmxLiveMu.Unlock()
		_ = conn.Close()
		return nil
	}
	rt = c.dmxLiveRuntime(universeID)
	frameCh := make(chan [512]byte, dmxAdapterQueueDepth)
	rt.artFrames = frameCh
	rt.artPath = path
	rt.artName = name
	rt.artTarget = remote.String()
	rt.artHz = hz
	seed := rt.buf
	c.dmxLiveArtWG.Add(1)
	go c.dmxLiveArtNetWorkerForUniverse(universeID, frameCh, conn, settings, remote.String())
	queueLatestDMXFrame(frameCh, seed)
	c.dmxLiveMu.Unlock()

	c.logger.Printf("dmx live: artnet adapter started universe=%s target=%s net=%d subnet=%d universe=%d hz=%d", universeID, remote.String(), settings.Net, settings.Subnet, settings.Universe, hz)
	if c.console != nil {
		c.console.Info(console.TransportArtNet, remote.String(),
			fmt.Sprintf("Art-Net adapter started net=%d subnet=%d universe=%d hz=%d (%s)", settings.Net, settings.Subnet, settings.Universe, hz, universeID))
	}
	return nil
}

func (c *WLEDController) startDMXArtNetAdapterForUniverse(universeID string, settings ArtNetSettings) error {
	clampArtNetSettings(&settings)
	c.mu.RLock()
	simulated := c.settings.DMX.Testing.SimulateArtNet
	c.mu.RUnlock()
	if simulated {
		return c.startDMXArtNetSimulatorForUniverse(universeID, settings)
	}
	return c.startDMXArtNetHardwareForUniverse(universeID, settings)
}

// reconcileDMXLiveAdaptersLocked starts/stops per-universe USB and Art-Net adapters.
func (c *WLEDController) reconcileDMXLiveAdaptersLocked() error {
	c.dmxLiveMu.Lock()
	running := c.dmxLiveRunning
	c.dmxLiveMu.Unlock()
	if !running {
		return nil
	}

	c.mu.RLock()
	settings := c.settings.DMX
	universes := normalizeDMXUniverses(c.dmxState.Universes)
	c.mu.RUnlock()

	var firstErr error
	active := make(map[string]struct{}, len(universes))

	for _, u := range universes {
		active[u.ID] = struct{}{}
		iface := c.universeInterfaceSettings(u.ID)

		usbDevice := strings.TrimSpace(iface.SelectedUSBDeviceID)
		if !settings.Enabled || !isDMXUSBEnabled(settings) || usbDevice == "" {
			c.stopDMXUSBAdapterForUniverseAndWait(u.ID)
		} else if err := c.startDMXUSBAdapterForUniverse(u.ID); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			c.setDMXLiveError(fmt.Sprintf("usb adapter (%s): %s", u.ID, err.Error()))
			c.stopDMXUSBAdapterForUniverseAndWait(u.ID)
		}

		if !settings.Enabled || !iface.ArtNet.Enabled {
			c.stopDMXArtNetAdapterForUniverseAndWait(u.ID)
		} else if err := c.startDMXArtNetAdapterForUniverse(u.ID, iface.ArtNet); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			c.setDMXLiveError(fmt.Sprintf("artnet adapter (%s): %s", u.ID, err.Error()))
			c.stopDMXArtNetAdapterForUniverseAndWait(u.ID)
		}
	}

	// Stop adapters for removed universes.
	c.dmxLiveMu.Lock()
	for id := range c.dmxLiveUniverses {
		if _, ok := active[id]; !ok {
			c.stopDMXUSBAdapterForUniverseLocked(id)
			c.stopDMXArtNetAdapterForUniverseLocked(id)
			delete(c.dmxLiveUniverses, id)
		}
	}
	c.clearDMXLiveRunningIfNoAdaptersLocked()
	c.dmxLiveMu.Unlock()

	return firstErr
}

// dmxLiveArtNetSimulatorWorkerForUniverse wraps the Art-Net simulator worker.
func (c *WLEDController) dmxLiveArtNetSimulatorWorkerForUniverse(universeID string, frameCh <-chan [512]byte, settings ArtNetSettings, path string) {
	c.dmxLiveArtNetSimulatorWorker(frameCh, settings, path)
}

// dmxLiveArtNetWorkerForUniverse wraps the Art-Net hardware worker.
func (c *WLEDController) dmxLiveArtNetWorkerForUniverse(universeID string, frameCh <-chan [512]byte, conn *net.UDPConn, settings ArtNetSettings, target string) {
	c.dmxLiveArtNetWorker(frameCh, conn, settings, target)
}

// dmxLiveUSBSimulatorWorkerForUniverse wraps the USB simulator worker with universe context.
func (c *WLEDController) dmxLiveUSBSimulatorWorkerForUniverse(universeID string, frameCh <-chan [512]byte, path string) {
	c.dmxLiveUSBSimulatorWorker(frameCh, path)
}

// dmxLiveUSBWorkerForUniverse wraps the USB hardware worker with universe context.
func (c *WLEDController) dmxLiveUSBWorkerForUniverse(universeID string, frameCh <-chan [512]byte, port goserial.Port, path string, enttecPro bool) {
	c.dmxLiveUSBWorker(frameCh, port, path, enttecPro)
}

func (c *WLEDController) partyOwnedAddrLocked(universeID string, addr int) bool {
	if c.partyOwnedByUniverse == nil {
		return false
	}
	owned, ok := c.partyOwnedByUniverse[universeID]
	if !ok {
		return false
	}
	if addr < 1 || addr > 512 {
		return false
	}
	return owned[addr-1]
}

func (c *WLEDController) setPartyOwnedForUniverse(universeID string, owned [512]bool) {
	if c.partyOwnedByUniverse == nil {
		c.partyOwnedByUniverse = map[string][512]bool{}
	}
	c.partyOwnedByUniverse[universeID] = owned
}

func (c *WLEDController) clearAllPartyOwnedLocked() {
	c.partyOwnedByUniverse = map[string][512]bool{}
}

// resolveUniverseIDForUpdate returns the universe id for a DMX patch, defaulting to universe 1.
func resolveUniverseIDForUpdate(universeID string) string {
	universeID = strings.TrimSpace(universeID)
	if universeID == "" {
		return DefaultDMXUniverseID
	}
	return universeID
}

// liveUniversesSnapshot builds the live universe buffers for GetDMXState.
func (c *WLEDController) liveUniversesSnapshot() (map[string][]int, []int) {
	c.dmxLiveMu.Lock()
	defer c.dmxLiveMu.Unlock()
	if !c.dmxLiveRunning || !c.hasAnyDMXLiveAdapterLocked() {
		return nil, nil
	}
	out := make(map[string][]int, len(c.dmxLiveUniverses))
	var legacy []int
	for id, rt := range c.dmxLiveUniverses {
		u := make([]int, 512)
		for i := 0; i < 512; i++ {
			u[i] = int(rt.buf[i])
		}
		out[id] = u
		if id == DefaultDMXUniverseID {
			legacy = u
		}
	}
	return out, legacy
}

// collectDMXLiveStatusPaths aggregates adapter paths/names across universes.
func (c *WLEDController) collectDMXLiveStatusPaths() (paths []string, names []string) {
	for _, rt := range c.dmxLiveUniverses {
		if rt.usbPath != "" {
			paths = append(paths, rt.usbPath)
		}
		if rt.artPath != "" {
			paths = append(paths, rt.artPath)
		}
		if rt.usbName != "" {
			names = append(names, rt.usbName)
		}
		if rt.artName != "" {
			names = append(names, rt.artName)
		}
	}
	return paths, names
}
