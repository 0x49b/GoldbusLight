//go:build linux

package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os/exec"
	"slices"
	"strings"
)

type linuxBackend struct {
	logger *log.Logger
}

func newLinuxBackend(logger *log.Logger) networkBackend {
	return &linuxBackend{logger: logger}
}

func (n *linuxBackend) id() string    { return "nmcli" }
func (n *linuxBackend) label() string { return "Linux (nmcli / NetworkManager)" }

func (n *linuxBackend) available() bool {
	_, err := exec.LookPath("nmcli")
	return err == nil
}

func (n *linuxBackend) primaryCLI() string { return "nmcli" }

func (n *linuxBackend) unavailableHint() string {
	return "`nmcli` (NetworkManager CLI) was not found in PATH. Install NetworkManager and ensure the `nmcli` binary is available for Wi-Fi scan and apply."
}

func (n *linuxBackend) apply(ctx context.Context, settings ControllerSettings) NetworkApplyResult {
	result := NetworkApplyResult{
		DryRun: !n.available(),
		Steps:  make([]NetworkCommandResult, 0, 8),
	}
	if result.DryRun {
		result.Warnings = append(result.Warnings, n.unavailableHint()+" Returning dry-run output.")
		return result
	}

	ap := settings.AccessPoint
	if ap.Enabled {
		connectionName := ap.Connection
		if connectionName == "" {
			connectionName = "wled-controller-ap"
		}
		iface := defaultString(ap.InterfaceName, "wlan0")
		ssid := defaultString(ap.SSID, "WLED-Controller-Net")
		channel := ap.Channel
		if channel <= 0 {
			channel = 6
		}

		if !n.connectionExists(ctx, connectionName) {
			result.Steps = append(result.Steps, runShellCommand(ctx, n.logger, "nmcli", "connection", "add", "type", "wifi", "ifname", iface, "con-name", connectionName, "autoconnect", "yes", "ssid", ssid))
		}

		result.Steps = append(result.Steps,
			runShellCommand(ctx, n.logger, "nmcli", "connection", "modify", connectionName,
				"802-11-wireless.mode", "ap",
				"802-11-wireless.band", "bg",
				"802-11-wireless.channel", fmt.Sprintf("%d", channel),
				"802-11-wireless.ssid", ssid,
				"wifi-sec.key-mgmt", "wpa-psk",
				"wifi-sec.psk", ap.Password,
				"ipv4.method", "shared"),
		)
		result.Steps = append(result.Steps, runShellCommand(ctx, n.logger, "nmcli", "connection", "up", connectionName))
	}

	if settings.Upstream.AutoConnect && settings.Upstream.SSID != "" {
		iface := defaultString(settings.Upstream.InterfaceName, "wlan1")
		result.Steps = append(result.Steps, runShellCommand(ctx, n.logger, "nmcli", "device", "wifi", "connect", settings.Upstream.SSID, "password", settings.Upstream.Password, "ifname", iface))
	}

	if settings.Bridge.Enabled {
		result.Steps = append(result.Steps, runShellCommand(ctx, n.logger, "sysctl", "-w", "net.ipv4.ip_forward=1"))

		upstream := defaultString(settings.Bridge.UpstreamInterface, settings.Upstream.InterfaceName)
		if upstream == "" {
			upstream = "wlan1"
		}
		result.Steps = append(result.Steps, runShellCommand(ctx, n.logger, "iptables", "-t", "nat", "-C", "POSTROUTING", "-o", upstream, "-j", "MASQUERADE"))
		lastStep := result.Steps[len(result.Steps)-1]
		if !lastStep.Success {
			result.Steps = append(result.Steps, runShellCommand(ctx, n.logger, "iptables", "-t", "nat", "-A", "POSTROUTING", "-o", upstream, "-j", "MASQUERADE"))
		}
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

func (n *linuxBackend) scanWiFi(ctx context.Context, iface string) ([]WiFiNetwork, error) {
	if !n.available() {
		return nil, errors.New(n.unavailableHint())
	}

	if iface == "" {
		iface = "wlan1"
	}
	cmd := exec.CommandContext(ctx, "nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY", "device", "wifi", "list", "ifname", iface)
	output, err := cmd.CombinedOutput()
	if err != nil {
		if n.logger != nil {
			n.logger.Printf("nmcli wifi scan failed ifname=%s: %v; output=%q", iface, err, strings.TrimSpace(string(output)))
		}
		return nil, fmt.Errorf("nmcli scan failed: %w", err)
	}

	seen := make(map[string]WiFiNetwork)
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		parts := strings.Split(line, ":")
		if len(parts) < 3 {
			continue
		}
		ssid := strings.TrimSpace(parts[0])
		if ssid == "" {
			continue
		}
		network := WiFiNetwork{
			SSID:     ssid,
			Signal:   parseSignal(parts[1]),
			Security: strings.TrimSpace(parts[2]),
		}
		if existing, ok := seen[ssid]; !ok || network.Signal > existing.Signal {
			seen[ssid] = network
		}
	}

	networks := make([]WiFiNetwork, 0, len(seen))
	for _, network := range seen {
		networks = append(networks, network)
	}
	slices.SortFunc(networks, func(a, b WiFiNetwork) int {
		if a.Signal == b.Signal {
			return strings.Compare(a.SSID, b.SSID)
		}
		return b.Signal - a.Signal
	})
	return networks, nil
}

func selectNetworkBackend(logger *log.Logger) networkBackend {
	return newLinuxBackend(logger)
}
