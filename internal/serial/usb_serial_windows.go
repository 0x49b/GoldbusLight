//go:build windows

package serial

import (
	"bytes"
	"encoding/csv"
	"os/exec"
	"slices"
	"strings"
)

func ListUSBSerialDevices() []USBSerialDevice {
	cmd := exec.Command("powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_SerialPort | Select-Object DeviceID,Name,Description | ConvertTo-Csv -NoTypeInformation")
	out, err := cmd.Output()
	if err != nil {
		return []USBSerialDevice{}
	}
	reader := csv.NewReader(bytes.NewReader(out))
	rows, err := reader.ReadAll()
	if err != nil || len(rows) < 2 {
		return []USBSerialDevice{}
	}
	devices := make([]USBSerialDevice, 0, len(rows)-1)
	for _, row := range rows[1:] {
		if len(row) < 3 {
			continue
		}
		id := strings.TrimSpace(row[0])
		if id == "" {
			continue
		}
		name := strings.TrimSpace(row[1])
		desc := strings.TrimSpace(row[2])
		if name == "" {
			name = id
		}
		devices = append(devices, USBSerialDevice{
			ID:          id,
			Path:        id,
			Name:        name,
			Description: desc,
		})
	}
	slices.SortFunc(devices, func(a, b USBSerialDevice) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})
	return devices
}
