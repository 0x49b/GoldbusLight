//go:build !darwin

package serial

// SerialPortForDMXWrite returns the device path to open for DMX output.
// Non-macOS platforms use the path as-is.
func SerialPortForDMXWrite(path string) string {
	return path
}
