//go:build darwin

package serial

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
)

func ListUSBSerialDevices() []USBSerialDevice {
	// Prefer /dev/cu.* only: tty.* is for incoming sessions and often returns "resource busy" when opening for DMX transmit.
	globs := []string{
		"/dev/cu.usb*",
		"/dev/cu.wchusbserial*",
		"/dev/cu.SLAB_USBtoUART*",
	}
	seen := map[string]USBSerialDevice{}
	for _, pattern := range globs {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			continue
		}
		for _, path := range matches {
			base := filepath.Base(path)
			seen[path] = USBSerialDevice{
				ID:   path,
				Path: path,
				Name: base,
			}
		}
	}

	// Catch adapters whose /dev name does not match the narrow prefixes above (still exclude obvious non-serial).
	matches, err := filepath.Glob("/dev/cu.*")
	if err == nil {
		skipSubstr := []string{"bluetooth", "debug-console", "wlan"}
		for _, path := range matches {
			base := strings.ToLower(filepath.Base(path))
			skip := false
			for _, s := range skipSubstr {
				if strings.Contains(base, s) {
					skip = true
					break
				}
			}
			if skip {
				continue
			}
			if _, dup := seen[path]; dup {
				continue
			}
			seen[path] = USBSerialDevice{
				ID:   path,
				Path: path,
				Name: filepath.Base(path),
			}
		}
	}

	// Include symlinked stable device entries when available.
	stableDir := "/dev/serial/by-id"
	entries, err := os.ReadDir(stableDir)
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			link := filepath.Join(stableDir, entry.Name())
			target, targetErr := os.Readlink(link)
			if targetErr != nil {
				continue
			}
			resolved := target
			if !strings.HasPrefix(target, "/") {
				resolved = filepath.Clean(filepath.Join(stableDir, target))
			}
			outPath := SerialPortForDMXWrite(resolved)
			seen[outPath] = USBSerialDevice{
				ID:          outPath,
				Path:        outPath,
				Name:        filepath.Base(outPath),
				Description: entry.Name(),
			}
		}
	}

	out := make([]USBSerialDevice, 0, len(seen))
	for _, dev := range seen {
		out = append(out, dev)
	}
	slices.SortFunc(out, func(a, b USBSerialDevice) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})
	return out
}
