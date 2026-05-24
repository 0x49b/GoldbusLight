package audio

import "strings"

// InputDevice describes a native audio capture device.
type InputDevice struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	IsDefault  bool   `json:"isDefault"`
	IsLoopback bool   `json:"isLoopback"`
	IsBuiltin  bool   `json:"isBuiltin"`
	IsUSB      bool   `json:"isUSB"`
}

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

func deviceFromName(id, description string, isDefault bool) InputDevice {
	name := strings.TrimSpace(description)
	if name == "" {
		name = id
	}
	isLoopback := isLoopbackDeviceName(name) || strings.HasSuffix(id, ".monitor")
	isBuiltin := isBuiltinDeviceName(name)
	isUSB := classifyUSBMic(isLoopback, isBuiltin, isDefault, name)
	return InputDevice{
		ID:         id,
		Name:       name,
		IsDefault:  isDefault,
		IsLoopback: isLoopback,
		IsBuiltin:  isBuiltin,
		IsUSB:      isUSB,
	}
}
