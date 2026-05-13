//go:build !darwin && !linux && !windows

package serial

func ListUSBSerialDevices() []USBSerialDevice {
	return []USBSerialDevice{}
}
