//go:build darwin

package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

const appleAirportBinary = "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport"

type darwinBackend struct {
	logger *log.Logger
}

func newDarwinBackend(logger *log.Logger) networkBackend {
	return &darwinBackend{logger: logger}
}

func (d *darwinBackend) id() string    { return "darwin" }
func (d *darwinBackend) label() string { return "macOS (networksetup / airport)" }

func (d *darwinBackend) available() bool {
	if _, err := exec.LookPath("networksetup"); err != nil {
		return false
	}
	_, err := os.Stat(appleAirportBinary)
	return err == nil
}

func (d *darwinBackend) primaryCLI() string {
	return "networksetup + airport"
}

func (d *darwinBackend) unavailableHint() string {
	return "`networksetup` was not found in PATH, or Apple's private `airport` tool is missing. Install a full macOS system; Wi-Fi scan needs `airport` at " + appleAirportBinary + " and `networksetup` for connect/apply."
}

func (d *darwinBackend) apply(ctx context.Context, settings ControllerSettings) NetworkApplyResult {
	result := NetworkApplyResult{
		DryRun: !d.available(),
		Steps:  make([]NetworkCommandResult, 0, 8),
	}
	if result.DryRun {
		result.Warnings = append(result.Warnings, d.unavailableHint())
		return result
	}

	ap := settings.AccessPoint
	if ap.Enabled {
		result.Warnings = append(result.Warnings,
			"Wi-Fi Access Point mode is not configurable via CLI on macOS; use System Settings → General → Sharing → Internet Sharing, or run this controller on Linux with nmcli.")
		result.Steps = append(result.Steps, NetworkCommandResult{
			Command: "macOS: AP mode skipped (not supported via networksetup)",
			Output:  "Configure Internet Sharing manually if you need a software AP.",
			Success: false,
			Error:   "unsupported on macOS CLI",
		})
	}

	if settings.Upstream.AutoConnect && settings.Upstream.SSID != "" {
		wifiDev := d.resolveWiFiDevice(settings.Upstream.InterfaceName)
		args := []string{"-setairportnetwork", wifiDev, settings.Upstream.SSID}
		if settings.Upstream.Password != "" {
			args = append(args, settings.Upstream.Password)
		}
		result.Steps = append(result.Steps, runShellCommand(ctx, "networksetup", args...))
	}

	if settings.Bridge.Enabled {
		result.Warnings = append(result.Warnings,
			"NAT/IP forwarding on macOS requires pf or Internet Sharing; iptables is not used. Enable forwarding manually if needed.")
		cmd := exec.CommandContext(ctx, "sysctl", "-w", "net.inet.ip.forwarding=1")
		out, err := cmd.CombinedOutput()
		step := NetworkCommandResult{
			Command: strings.Join(cmd.Args, " "),
			Output:  strings.TrimSpace(string(out)),
			Success: err == nil,
		}
		if err != nil {
			step.Error = err.Error()
		}
		result.Steps = append(result.Steps, step)
	}

	for _, step := range result.Steps {
		if !step.Success && step.Error != "" && !strings.Contains(step.Command, "skipped") {
			result.Warnings = append(result.Warnings, fmt.Sprintf("command failed: %s", step.Command))
		}
	}
	return result
}

// resolveWiFiDevice maps common Linux-style names to typical macOS en* devices, or discovers en0 via networksetup.
func (d *darwinBackend) resolveWiFiDevice(iface string) string {
	iface = strings.TrimSpace(iface)
	switch iface {
	case "", "wlan0", "wlan1":
		if dev := d.defaultWiFiDevice(); dev != "" {
			return dev
		}
		return "en0"
	default:
		if strings.HasPrefix(iface, "en") {
			return iface
		}
		if dev := d.defaultWiFiDevice(); dev != "" {
			return dev
		}
		return iface
	}
}

func (d *darwinBackend) defaultWiFiDevice() string {
	cmd := exec.Command("networksetup", "-listallhardwareports")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return ""
	}
	var currentPort string
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Hardware Port:") {
			currentPort = strings.TrimPrefix(line, "Hardware Port:")
			currentPort = strings.TrimSpace(currentPort)
			continue
		}
		if strings.HasPrefix(line, "Device:") && strings.Contains(strings.ToLower(currentPort), "wi-fi") {
			dev := strings.TrimPrefix(line, "Device:")
			return strings.TrimSpace(dev)
		}
	}
	return ""
}

func (d *darwinBackend) scanWiFi(ctx context.Context, iface string) ([]WiFiNetwork, error) {
	if !d.available() {
		return nil, errors.New(d.unavailableHint())
	}
	// airport -s scans visible networks on the default Wi-Fi interface.
	cmd := exec.CommandContext(ctx, appleAirportBinary, "-s")
	_ = iface
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("airport scan failed: %w", err)
	}

	networks := parseAirportScan(string(output))
	if len(networks) == 0 && strings.TrimSpace(string(output)) != "" {
		d.logger.Printf("airport scan produced no networks; raw length=%d", len(output))
	}
	return networks, nil
}

var macAddrPattern = regexp.MustCompile(`([0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5})`)

func parseAirportScan(output string) []WiFiNetwork {
	seen := make(map[string]WiFiNetwork)
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimRight(line, "\r")
		if line == "" || strings.Contains(line, "SSID") && strings.Contains(line, "BSSID") {
			continue
		}
		idx := macAddrPattern.FindStringIndex(line)
		if idx == nil {
			continue
		}
		ssid := strings.TrimSpace(line[:idx[0]])
		if ssid == "" {
			continue
		}
		rest := strings.TrimSpace(line[idx[1]:])
		fields := strings.Fields(rest)
		rssi := 0
		if len(fields) > 0 {
			if v, err := strconv.Atoi(fields[0]); err == nil {
				rssi = v
			}
		}
		security := "unknown"
		if len(fields) > 1 {
			security = strings.Join(fields[1:], " ")
		}

		signal := rssiToPercent(rssi)
		net := WiFiNetwork{
			SSID:     ssid,
			Signal:   signal,
			Security: security,
		}
		if existing, ok := seen[ssid]; !ok || net.Signal > existing.Signal {
			seen[ssid] = net
		}
	}

	out := make([]WiFiNetwork, 0, len(seen))
	for _, n := range seen {
		out = append(out, n)
	}
	slices.SortFunc(out, func(a, b WiFiNetwork) int {
		if a.Signal == b.Signal {
			return strings.Compare(a.SSID, b.SSID)
		}
		return b.Signal - a.Signal
	})
	return out
}

// rssiToPercent maps dBm (-100..0) to a rough 0-100 scale for UI consistency with nmcli.
func rssiToPercent(rssi int) int {
	if rssi >= -50 {
		return 100
	}
	if rssi <= -100 {
		return 0
	}
	return 2 * (rssi + 100)
}
