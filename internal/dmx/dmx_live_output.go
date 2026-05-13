package dmx

import (
	serial2 "goldbus/internal/serial"
	"strings"
)

// DMXOutputUpdate sets one DMX slot (address 1-512) to a value 0-255.
type DMXOutputUpdate struct {
	Address int `json:"address"`
	Value   int `json:"value"`
}

// DMXLiveStatus describes the USB DMX streaming session for the UI.
type DMXLiveStatus struct {
	Connected  bool   `json:"connected"`
	Error      string `json:"error,omitempty"`
	DevicePath string `json:"devicePath,omitempty"`
	DeviceName string `json:"deviceName,omitempty"`
	FixtureID  string `json:"fixtureId,omitempty"`
}

// PickUSBSerialDevice resolves a persisted or UI device id to a listed USB serial entry.
// On macOS, settings may still reference /dev/tty.* while enumeration exposes /dev/cu.* only;
// SerialPortForDMXWrite bridges those to the same underlying port.
func PickUSBSerialDevice(deviceID string, devices []serial2.USBSerialDevice) (serial2.USBSerialDevice, bool) {
	deviceID = strings.TrimSpace(deviceID)
	if deviceID == "" {
		return serial2.USBSerialDevice{}, false
	}
	for _, dev := range devices {
		if dev.ID == deviceID {
			if strings.TrimSpace(dev.Path) == "" {
				return serial2.USBSerialDevice{}, false
			}
			return dev, true
		}
	}
	want := serial2.SerialPortForDMXWrite(deviceID)
	if want == "" {
		return serial2.USBSerialDevice{}, false
	}
	for _, dev := range devices {
		p := strings.TrimSpace(dev.Path)
		if p == "" {
			continue
		}
		if serial2.SerialPortForDMXWrite(p) == want {
			return dev, true
		}
	}
	return serial2.USBSerialDevice{}, false
}

func CanonicalizePersistedDMXUSBSelectionID(deviceID string) string {
	dev, ok := PickUSBSerialDevice(deviceID, serial2.ListUSBSerialDevices())
	if !ok {
		return strings.TrimSpace(deviceID)
	}
	return dev.ID
}
