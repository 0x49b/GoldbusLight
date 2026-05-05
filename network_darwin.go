//go:build darwin

package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os/exec"
	"runtime"
	"slices"
	"strings"

	"github.com/jaisonerick/macwifi"
)

type darwinBackend struct {
	logger *log.Logger
}

func newDarwinBackend(logger *log.Logger) networkBackend {
	return &darwinBackend{logger: logger}
}

func (d *darwinBackend) id() string    { return "darwin" }
func (d *darwinBackend) label() string { return "macOS (networksetup / macwifi)" }

func (d *darwinBackend) available() bool {
	_, err := exec.LookPath("networksetup")
	return err == nil
}

func (d *darwinBackend) primaryCLI() string {
	return "networksetup + macwifi"
}

func (d *darwinBackend) unavailableHint() string {
	return "`networksetup` was not found in PATH (needed for Wi‑Fi join / hardware ports). Install full macOS command-line tools."
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
	_ = iface
	if runtime.GOARCH != "arm64" {
		return nil, errors.New("Wi‑Fi scan on macOS requires Apple Silicon (arm64); use an Apple Silicon Mac or run the controller on Linux with nmcli")
	}
	if !d.available() {
		return nil, errors.New(d.unavailableHint())
	}

	nets, err := macwifi.Scan(ctx)
	if err != nil {
		if d.logger != nil {
			d.logger.Printf("macwifi scan failed: %v", err)
		}
		return nil, fmt.Errorf("macwifi scan: %w", err)
	}

	out := networksFromMacwifi(nets)
	if len(out) == 0 && len(nets) > 0 {
		d.logger.Printf("macwifi returned %d networks but none had usable SSIDs", len(nets))
	}
	return out, nil
}

func networksFromMacwifi(nets []macwifi.Network) []WiFiNetwork {
	seen := make(map[string]WiFiNetwork)
	for _, n := range nets {
		if strings.TrimSpace(n.SSID) == "" {
			continue
		}
		signal := rssiToPercent(n.RSSI)
		w := WiFiNetwork{
			SSID:     n.SSID,
			Signal:   signal,
			Security: n.Security.String(),
		}
		if existing, ok := seen[n.SSID]; !ok || w.Signal > existing.Signal {
			seen[n.SSID] = w
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

func selectNetworkBackend(logger *log.Logger) networkBackend {
	return newDarwinBackend(logger)
}
