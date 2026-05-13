//go:build darwin

package serial

import (
	"os"
	"strings"
)

// SerialPortForDMXWrite maps /dev/tty.* to /dev/cu.* when the cu node exists.
// On macOS, tty devices are often busy or wrong for outgoing-only DMX; cu (call-out) is intended for transmit.
func SerialPortForDMXWrite(path string) string {
	if !strings.HasPrefix(path, "/dev/tty.") {
		return path
	}
	cu := "/dev/cu." + strings.TrimPrefix(path, "/dev/tty.")
	st, err := os.Stat(cu)
	if err != nil || st.IsDir() {
		return path
	}
	return cu
}
