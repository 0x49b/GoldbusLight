//go:build linux

package serial

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
)

func ListUSBSerialDevices() []USBSerialDevice {
	globs := []string{
		"/dev/ttyUSB*",
		"/dev/ttyACM*",
	}
	seen := map[string]USBSerialDevice{}
	for _, pattern := range globs {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			continue
		}
		for _, path := range matches {
			seen[path] = USBSerialDevice{
				ID:   path,
				Path: path,
				Name: filepath.Base(path),
			}
		}
	}

	byIDDir := "/dev/serial/by-id"
	entries, err := os.ReadDir(byIDDir)
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			link := filepath.Join(byIDDir, entry.Name())
			target, targetErr := os.Readlink(link)
			if targetErr != nil {
				continue
			}
			resolved := target
			if !strings.HasPrefix(target, "/") {
				resolved = filepath.Clean(filepath.Join(byIDDir, target))
			}
			seen[resolved] = USBSerialDevice{
				ID:          resolved,
				Path:        resolved,
				Name:        filepath.Base(resolved),
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
