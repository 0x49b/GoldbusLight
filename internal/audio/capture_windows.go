//go:build windows

package audio

import "fmt"

// ListInputDevices returns an empty list on Windows, as audio capture is not implemented.
func ListInputDevices() ([]InputDevice, error) {
	return []InputDevice{}, nil
}

// Start returns an error on Windows, as audio capture is not implemented.
func (c *Capture) Start(deviceID string, onFeatures FeatureHandler) error {
	return fmt.Errorf("audio capture not supported on Windows")
}
