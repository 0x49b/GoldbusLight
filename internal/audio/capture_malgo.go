//go:build !linux

package audio

import (
	"encoding/hex"
	"fmt"
	"runtime"
	"strings"
	"unsafe"

	"github.com/gen2brain/malgo"
)

type malgoBackend struct {
	ctx              *malgo.AllocatedContext
	device           *malgo.Device
	selectedDeviceID malgo.DeviceID
	deviceIDPinned   bool
	pinner           runtime.Pinner
}

func (b *malgoBackend) Stop() {
	if b.device != nil {
		_ = b.device.Stop()
		b.device.Uninit()
		b.device = nil
	}
	if b.ctx != nil {
		_ = b.ctx.Uninit()
		b.ctx.Free()
		b.ctx = nil
	}
	if b.deviceIDPinned {
		b.pinner.Unpin()
		b.deviceIDPinned = false
	}
	b.selectedDeviceID = malgo.DeviceID{}
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
		out = append(out, deviceFromName(info.ID.String(), name, isDefault))
	}
	return out, nil
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

	backend := &malgoBackend{ctx: ctx}
	selectedID := strings.TrimSpace(deviceID)
	if selectedID != "" {
		id, err := parseMalgoDeviceID(selectedID)
		if err != nil {
			backend.Stop()
			return err
		}
		backend.selectedDeviceID = id
		backend.pinner.Pin(&backend.selectedDeviceID)
		backend.deviceIDPinned = true
		deviceConfig.Capture.DeviceID = unsafe.Pointer(&backend.selectedDeviceID)
	}

	onRecvFrames := func(_, input []byte, frameCount uint32) {
		if len(input) == 0 || frameCount == 0 {
			return
		}
		c.appendSamples(bytesToInt16(input))
	}

	device, err := malgo.InitDevice(ctx.Context, deviceConfig, malgo.DeviceCallbacks{Data: onRecvFrames})
	if err != nil {
		backend.Stop()
		return fmt.Errorf("init capture device: %w", err)
	}
	if err := device.Start(); err != nil {
		device.Uninit()
		backend.Stop()
		return fmt.Errorf("start capture device: %w", err)
	}
	backend.device = device

	c.backend = backend
	c.beginCaptureLocked(selectedID, onFeatures)
	return nil
}

func parseMalgoDeviceID(id string) (malgo.DeviceID, error) {
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
