//go:build linux

package network

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"strings"
)

type linuxBackend struct {
	logger *log.Logger
}

func newLinuxBackend(logger *log.Logger) Backend {
	return &linuxBackend{logger: logger}
}

func (n *linuxBackend) ID() string    { return "nmcli" }
func (n *linuxBackend) Label() string { return "Linux (nmcli / NetworkManager)" }

func (n *linuxBackend) Available() bool {
	_, err := exec.LookPath("nmcli")
	return err == nil
}

func (n *linuxBackend) PrimaryCLI() string { return "nmcli" }

func (n *linuxBackend) UnavailableHint() string {
	return "`nmcli` (NetworkManager CLI) was not found in PATH. Install NetworkManager and ensure the `nmcli` binary is available for AP apply."
}

func (n *linuxBackend) Apply(ctx context.Context, settings ControllerSettings) NetworkApplyResult {
	result := NetworkApplyResult{
		DryRun: !n.Available(),
		Steps:  make([]NetworkCommandResult, 0, 8),
	}
	if result.DryRun {
		result.Warnings = append(result.Warnings, n.UnavailableHint()+" Returning dry-run output.")
		return result
	}

	ap := settings.AccessPoint
	connectionName := ap.Connection
	if connectionName == "" {
		connectionName = "wled-controller-ap"
	}

	if ap.Enabled {
		apIface := n.resolveWiFiIface(ctx, defaultString(ap.InterfaceName, "wlan0"))
		iface := apIface
		ssid := defaultString(ap.SSID, "WLED-Controller-Net")
		channel := ap.Channel
		if channel <= 0 {
			channel = 6
		}

		if !n.connectionExists(ctx, connectionName) {
			result.Steps = append(result.Steps, runShellCommand(ctx, n.logger, "nmcli", "connection", "add", "type", "wifi", "ifname", iface, "con-name", connectionName, "autoconnect", "yes", "ssid", ssid))
		}

		// 802-11-wireless.band "bg" is 2.4 GHz (802.11b/g). WLED clients expect a 2.4 GHz AP; do not use "a" (5 GHz).
		result.Steps = append(result.Steps,
			runShellCommand(ctx, n.logger, "nmcli", "connection", "modify", connectionName,
				"connection.autoconnect", "yes",
				"802-11-wireless.mode", "ap",
				"802-11-wireless.band", "bg",
				"802-11-wireless.channel", fmt.Sprintf("%d", channel),
				"802-11-wireless.ssid", ssid,
				"wifi-sec.key-mgmt", "wpa-psk",
				"wifi-sec.psk", ap.Password,
				"ipv4.method", "shared"),
		)
		result.Steps = append(result.Steps, runShellCommand(ctx, n.logger, "nmcli", "connection", "up", connectionName))
	} else if n.connectionExists(ctx, connectionName) {
		// Tear down a previously applied AP and stop NetworkManager from bringing it back.
		result.Steps = append(result.Steps,
			runShellCommand(ctx, n.logger, "nmcli", "connection", "modify", connectionName, "connection.autoconnect", "no"),
			runShellCommand(ctx, n.logger, "nmcli", "connection", "down", connectionName),
		)
	}

	for _, step := range result.Steps {
		if !step.Success {
			result.Warnings = append(result.Warnings, fmt.Sprintf("command failed: %s", step.Command))
		}
	}
	return result
}

func (n *linuxBackend) connectionExists(ctx context.Context, connectionName string) bool {
	cmd := exec.CommandContext(ctx, "nmcli", "-t", "-f", "NAME", "connection", "show")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(output), "\n") {
		if strings.TrimSpace(line) == connectionName {
			return true
		}
	}
	return false
}

func SelectNetworkBackend(logger *log.Logger) Backend {
	return newLinuxBackend(logger)
}

// listWiFiDevices returns NetworkManager Wi-Fi interface names (e.g. wlan0, wlp2s0).
func (n *linuxBackend) listWiFiDevices(ctx context.Context) ([]string, error) {
	cmd := exec.CommandContext(ctx, "nmcli", "-t", "-f", "DEVICE,TYPE", "device")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("nmcli device list: %w", err)
	}
	var devs []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		dev := strings.TrimSpace(parts[0])
		typ := strings.TrimSpace(parts[1])
		if typ == "wifi" && dev != "" {
			devs = append(devs, dev)
		}
	}
	return devs, nil
}

// resolveWiFiIface picks a Wi-Fi device reported by nmcli when the configured name is missing.
func (n *linuxBackend) resolveWiFiIface(ctx context.Context, preferred string) string {
	preferred = strings.TrimSpace(preferred)

	devices, err := n.listWiFiDevices(ctx)
	if err != nil {
		if n.logger != nil {
			n.logger.Printf("linux wifi: list devices failed: %v; using preferred %q", err, preferred)
		}
		if preferred != "" {
			return preferred
		}
		return "wlan0"
	}
	if len(devices) == 0 {
		if preferred != "" {
			return preferred
		}
		return "wlan0"
	}

	if preferred != "" {
		for _, d := range devices {
			if d == preferred {
				return preferred
			}
		}
	}

	return devices[0]
}
