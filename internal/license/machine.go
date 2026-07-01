package license

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"runtime"
	"strings"
)

// MachineFingerprint returns a stable identifier for the current host.
func MachineFingerprint() string {
	parts := []string{runtime.GOOS, runtime.GOARCH, hostname()}
	if id := readMachineID(); id != "" {
		parts = append(parts, id)
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "|")))
	return "sha256:" + hex.EncodeToString(sum[:])
}

func hostname() string {
	name, err := os.Hostname()
	if err != nil {
		return "unknown-host"
	}
	return strings.TrimSpace(name)
}

func readMachineID() string {
	switch runtime.GOOS {
	case "linux":
		data, err := os.ReadFile("/etc/machine-id")
		if err != nil {
			data, err = os.ReadFile("/var/lib/dbus/machine-id")
		}
		if err != nil {
			return ""
		}
		return strings.TrimSpace(string(data))
	case "darwin":
		// IOPlatformUUID via ioreg is brittle in sandboxed builds; hostname+arch is enough for binding.
		return ""
	default:
		return ""
	}
}
