package audio

import (
	"encoding/hex"
	"fmt"
	"runtime"
	"strings"
	"sync"
	"time"
	"unsafe"

	"github.com/gen2brain/malgo"
)

const (
	partySampleRate   = 44100
	partyChannels     = 1
	featureInterval   = 80 * time.Millisecond
	noSignalThreshold = 3 * time.Second
)

var loopbackPatterns = []string{
	"blackhole",
	"stereo mix",
	"what u hear",
	"loopback",
	"vb-audio",
	"vb audio",
	"monitor",
	"soundflower",
}

var builtinMicPatterns = []string{
	"built-in",
	"builtin",
	"internal",
	"macbook",
	"imac",
	"facetime",
	"apple audio",
	"microphone array",
	"default input",
}

var usbMicPatterns = []string{
	"usb",
	"uac",
	"external",
	"snowball",
	"yeti",
	"rode",
	"blue ",
	"audio-technica",
	"shure",
	"samson",
	"fifine",
	"hyperx",
	"logitech",
	"elgato",
	"focusrite",
	"behringer",
	"m-audio",
	"presonus",
	"mic pod",
	"podcaster",
}

// InputDevice describes a native audio capture device.
type InputDevice struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	IsDefault  bool   `json:"isDefault"`
	IsLoopback bool   `json:"isLoopback"`
	IsBuiltin  bool   `json:"isBuiltin"`
	IsUSB      bool   `json:"isUSB"`
}

// FeatureHandler receives extracted party audio features.
type FeatureHandler func(features PartyFeatures, deviceID string, capturedAt time.Time)

// Capture manages native microphone/line-in capture via malgo.
type Capture struct {
	mu               sync.Mutex
	ctx              *malgo.AllocatedContext
	device           *malgo.Device
	running          bool
	deviceID         string
	selectedDeviceID malgo.DeviceID
	deviceIDPinned   bool
	pinner           runtime.Pinner
	captureStartedAt time.Time
	lastLevelAt      time.Time
	noSignal         bool
	onFeatures       FeatureHandler
	sampleBuf        []int16
	featureStop      chan struct{}
	featureDone      chan struct{}
}

// ListInputDevices returns available capture devices.
func ListInputDevices() ([]InputDevice, error) {
	ctx, err := malgo.InitContext(nil, malgo.ContextConfig{}, nil)
	if err != nil {
		return nil, fmt.Errorf("init audio context: %w", err)
	}
	defer func() {
		_ = ctx.Uninit()
		ctx.Free()
	}()

	infos, err := ctx.Devices(malgo.Capture)
	if err != nil {
		return nil, fmt.Errorf("list capture devices: %w", err)
	}

	out := make([]InputDevice, 0, len(infos))
	for _, info := range infos {
		name := strings.TrimSpace(info.Name())
		isDefault := info.IsDefault != 0
		isLoopback := isLoopbackDeviceName(name)
		isBuiltin := isBuiltinDeviceName(name)
		isUSB := classifyUSBMic(isLoopback, isBuiltin, isDefault, name)
		out = append(out, InputDevice{
			ID:         info.ID.String(),
			Name:       name,
			IsDefault:  isDefault,
			IsLoopback: isLoopback,
			IsBuiltin:  isBuiltin,
			IsUSB:      isUSB,
		})
	}
	return out, nil
}

func isLoopbackDeviceName(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	for _, pattern := range loopbackPatterns {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}

func isBuiltinDeviceName(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	for _, pattern := range builtinMicPatterns {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}

func isUSBDeviceName(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	for _, pattern := range usbMicPatterns {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}

func classifyUSBMic(isLoopback, isBuiltin, isDefault bool, name string) bool {
	if isLoopback || isBuiltin {
		return false
	}
	if isUSBDeviceName(name) {
		return true
	}
	// Non-default external inputs are usually USB or line-in mics.
	return !isDefault
}

// PickUSBMicDevice returns the preferred USB/external microphone if any.
func PickUSBMicDevice(devices []InputDevice) *InputDevice {
	var fallback *InputDevice
	for i := range devices {
		device := &devices[i]
		if !device.IsUSB {
			continue
		}
		if fallback == nil {
			fallback = device
		}
		if isUSBDeviceName(device.Name) {
			return device
		}
	}
	return fallback
}

// PickLoopbackDevice returns the first loopback-like device if any.
func PickLoopbackDevice(devices []InputDevice) *InputDevice {
	for i := range devices {
		if devices[i].IsLoopback {
			return &devices[i]
		}
	}
	return nil
}

// Start begins capture on the given device ID (empty string = default device).
func (c *Capture) Start(deviceID string, onFeatures FeatureHandler) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.running {
		if c.deviceID == strings.TrimSpace(deviceID) {
			return nil
		}
		c.stopLocked()
	}

	ctx, err := malgo.InitContext(nil, malgo.ContextConfig{}, nil)
	if err != nil {
		return fmt.Errorf("init audio context: %w", err)
	}

	deviceConfig := malgo.DefaultDeviceConfig(malgo.Capture)
	deviceConfig.Capture.Format = malgo.FormatS16
	deviceConfig.Capture.Channels = partyChannels
	deviceConfig.SampleRate = partySampleRate
	deviceConfig.Alsa.NoMMap = 1

	selectedID := strings.TrimSpace(deviceID)
	if selectedID != "" {
		id, err := parseDeviceID(selectedID)
		if err != nil {
			_ = ctx.Uninit()
			ctx.Free()
			return err
		}
		// DeviceID must live on the heap and stay pinned while malgo retains the pointer.
		c.selectedDeviceID = id
		c.pinner.Pin(&c.selectedDeviceID)
		c.deviceIDPinned = true
		deviceConfig.Capture.DeviceID = unsafe.Pointer(&c.selectedDeviceID)
	}

	c.sampleBuf = make([]int16, 0, partySampleRate)
	c.onFeatures = onFeatures
	c.deviceID = selectedID
	c.captureStartedAt = time.Now()
	c.lastLevelAt = time.Time{}
	c.noSignal = false

	onRecvFrames := func(_, input []byte, frameCount uint32) {
		if len(input) == 0 || frameCount == 0 {
			return
		}
		samples := bytesToInt16(input)
		c.mu.Lock()
		c.sampleBuf = append(c.sampleBuf, samples...)
		maxKeep := partySampleRate * 2
		if len(c.sampleBuf) > maxKeep {
			c.sampleBuf = append([]int16(nil), c.sampleBuf[len(c.sampleBuf)-maxKeep:]...)
		}
		c.mu.Unlock()
	}

	device, err := malgo.InitDevice(ctx.Context, deviceConfig, malgo.DeviceCallbacks{Data: onRecvFrames})
	if err != nil {
		c.releaseDeviceIDPinLocked()
		_ = ctx.Uninit()
		ctx.Free()
		return fmt.Errorf("init capture device: %w", err)
	}
	if err := device.Start(); err != nil {
		device.Uninit()
		c.releaseDeviceIDPinLocked()
		_ = ctx.Uninit()
		ctx.Free()
		return fmt.Errorf("start capture device: %w", err)
	}

	c.ctx = ctx
	c.device = device
	c.running = true
	c.featureStop = make(chan struct{})
	c.featureDone = make(chan struct{})
	go c.featureLoop()
	return nil
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

// Stop halts capture.
func (c *Capture) Stop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.stopLocked()
}

func (c *Capture) stopLocked() {
	if c.featureStop != nil {
		close(c.featureStop)
		<-c.featureDone
		c.featureStop = nil
		c.featureDone = nil
	}
	if c.device != nil {
		_ = c.device.Stop()
		c.device.Uninit()
		c.device = nil
	}
	if c.ctx != nil {
		_ = c.ctx.Uninit()
		c.ctx.Free()
		c.ctx = nil
	}
	c.releaseDeviceIDPinLocked()
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

func (c *Capture) releaseDeviceIDPinLocked() {
	if c.deviceIDPinned {
		c.pinner.Unpin()
		c.deviceIDPinned = false
	}
	c.selectedDeviceID = malgo.DeviceID{}
}

func parseDeviceID(id string) (malgo.DeviceID, error) {
	raw, err := hex.DecodeString(strings.TrimSpace(id))
	if err != nil {
		return malgo.DeviceID{}, fmt.Errorf("invalid audio device id %q: %w", id, err)
	}
	var out malgo.DeviceID
	if len(raw) > len(out) {
		return malgo.DeviceID{}, fmt.Errorf("audio device id too long")
	}
	copy(out[:], raw)
	return out, nil
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
