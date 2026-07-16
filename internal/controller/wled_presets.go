package controller

import (
	"context"
	"fmt"
	"strings"
	"time"
)

func cloneWLEDDevicePresets(in []WLEDDevicePreset) []WLEDDevicePreset {
	if len(in) == 0 {
		return nil
	}
	out := make([]WLEDDevicePreset, len(in))
	for i, p := range in {
		out[i] = WLEDDevicePreset{
			ID:        p.ID,
			Name:      p.Name,
			State:     cloneJSONMap(p.State),
			CreatedAt: p.CreatedAt,
			UpdatedAt: p.UpdatedAt,
		}
	}
	return out
}

func findWLEDDevicePreset(presets []WLEDDevicePreset, id string) (WLEDDevicePreset, bool) {
	id = strings.TrimSpace(id)
	for _, p := range presets {
		if p.ID == id {
			return p, true
		}
	}
	return WLEDDevicePreset{}, false
}

// CreateWLEDDevicePreset captures the device's current live state as a named preset.
func (c *WLEDController) CreateWLEDDevicePreset(ctx context.Context, deviceID, name string) (WLEDDevicePreset, error) {
	if !c.wledEnabled() {
		return WLEDDevicePreset{}, fmt.Errorf("wled component is disabled in settings")
	}
	deviceID = strings.TrimSpace(deviceID)
	name = strings.TrimSpace(name)
	if deviceID == "" {
		return WLEDDevicePreset{}, fmt.Errorf("device id is required")
	}
	if name == "" {
		return WLEDDevicePreset{}, fmt.Errorf("preset name is required")
	}

	c.mu.RLock()
	device, ok := c.devices[deviceID]
	c.mu.RUnlock()
	if !ok {
		return WLEDDevicePreset{}, fmt.Errorf("unknown device: %s", deviceID)
	}
	if device.Ignored {
		return WLEDDevicePreset{}, fmt.Errorf("device is ignored: %s", deviceID)
	}

	state, err := c.getWLEDState(ctx, device)
	if err != nil {
		// Fall back to last known state when the device is briefly unreachable.
		c.mu.RLock()
		latest := c.devices[deviceID]
		c.mu.RUnlock()
		if len(latest.LastState) == 0 {
			return WLEDDevicePreset{}, fmt.Errorf("capture device state: %w", err)
		}
		state = cloneJSONMap(latest.LastState)
		c.logger.Printf("wled preset: using lastState for %s after live capture failed: %v", deviceID, err)
	} else {
		state = cloneJSONMap(state)
	}

	now := time.Now().UTC()
	preset := WLEDDevicePreset{
		ID:        fmt.Sprintf("wled-preset-%d", now.UnixNano()),
		Name:      name,
		State:     cloneJSONMap(state),
		CreatedAt: now,
		UpdatedAt: now,
	}

	c.mu.Lock()
	device, ok = c.devices[deviceID]
	if !ok {
		c.mu.Unlock()
		return WLEDDevicePreset{}, fmt.Errorf("unknown device: %s", deviceID)
	}
	device.Presets = append(cloneWLEDDevicePresets(device.Presets), preset)
	c.devices[deviceID] = device
	c.updated = time.Now()
	c.mu.Unlock()

	if err := c.persist(); err != nil {
		return WLEDDevicePreset{}, err
	}
	return preset, nil
}

// UpdateWLEDDevicePreset renames a preset and optionally replaces its state when state is non-nil.
func (c *WLEDController) UpdateWLEDDevicePreset(deviceID, presetID, name string, state map[string]any) (WLEDDevicePreset, error) {
	if !c.wledEnabled() {
		return WLEDDevicePreset{}, fmt.Errorf("wled component is disabled in settings")
	}
	deviceID = strings.TrimSpace(deviceID)
	presetID = strings.TrimSpace(presetID)
	name = strings.TrimSpace(name)
	if deviceID == "" || presetID == "" {
		return WLEDDevicePreset{}, fmt.Errorf("device id and preset id are required")
	}
	if name == "" {
		return WLEDDevicePreset{}, fmt.Errorf("preset name is required")
	}

	c.mu.Lock()
	device, ok := c.devices[deviceID]
	if !ok {
		c.mu.Unlock()
		return WLEDDevicePreset{}, fmt.Errorf("unknown device: %s", deviceID)
	}
	idx := -1
	for i := range device.Presets {
		if device.Presets[i].ID == presetID {
			idx = i
			break
		}
	}
	if idx < 0 {
		c.mu.Unlock()
		return WLEDDevicePreset{}, fmt.Errorf("unknown preset: %s", presetID)
	}
	presets := cloneWLEDDevicePresets(device.Presets)
	presets[idx].Name = name
	presets[idx].UpdatedAt = time.Now().UTC()
	if state != nil {
		presets[idx].State = cloneJSONMap(state)
	}
	device.Presets = presets
	c.devices[deviceID] = device
	updated := presets[idx]
	c.updated = time.Now()
	c.mu.Unlock()

	if err := c.persist(); err != nil {
		return WLEDDevicePreset{}, err
	}
	return updated, nil
}

// DeleteWLEDDevicePreset removes a preset from a device.
func (c *WLEDController) DeleteWLEDDevicePreset(deviceID, presetID string) error {
	if !c.wledEnabled() {
		return fmt.Errorf("wled component is disabled in settings")
	}
	deviceID = strings.TrimSpace(deviceID)
	presetID = strings.TrimSpace(presetID)
	if deviceID == "" || presetID == "" {
		return fmt.Errorf("device id and preset id are required")
	}

	c.mu.Lock()
	device, ok := c.devices[deviceID]
	if !ok {
		c.mu.Unlock()
		return fmt.Errorf("unknown device: %s", deviceID)
	}
	next := make([]WLEDDevicePreset, 0, len(device.Presets))
	found := false
	for _, p := range device.Presets {
		if p.ID == presetID {
			found = true
			continue
		}
		next = append(next, p)
	}
	if !found {
		c.mu.Unlock()
		return fmt.Errorf("unknown preset: %s", presetID)
	}
	device.Presets = next
	c.devices[deviceID] = device
	c.updated = time.Now()
	c.mu.Unlock()

	return c.persist()
}

// ApplyWLEDDevicePreset posts the stored preset state to the device.
func (c *WLEDController) ApplyWLEDDevicePreset(ctx context.Context, deviceID, presetID string) error {
	if !c.wledEnabled() {
		return fmt.Errorf("wled component is disabled in settings")
	}
	deviceID = strings.TrimSpace(deviceID)
	presetID = strings.TrimSpace(presetID)

	c.mu.RLock()
	device, ok := c.devices[deviceID]
	c.mu.RUnlock()
	if !ok {
		return fmt.Errorf("unknown device: %s", deviceID)
	}
	preset, ok := findWLEDDevicePreset(device.Presets, presetID)
	if !ok {
		return fmt.Errorf("unknown preset: %s", presetID)
	}
	if len(preset.State) == 0 {
		return fmt.Errorf("preset %s has empty state", presetID)
	}
	return c.SetDeviceState(ctx, deviceID, cloneJSONMap(preset.State))
}
