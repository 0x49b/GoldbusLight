//go:build windows

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

type windowsBackend struct {
	logger *log.Logger
}

func newWindowsBackend(logger *log.Logger) networkBackend {
	return &windowsBackend{logger: logger}
}

func (w *windowsBackend) id() string    { return "netsh" }
func (w *windowsBackend) label() string { return "Windows (netsh wlan)" }

func (w *windowsBackend) available() bool {
	if _, err := exec.LookPath("netsh"); err != nil {
		return false
	}
	cmd := exec.Command("netsh", "wlan", "show", "interfaces")
	if err := cmd.Run(); err != nil {
		return false
	}
	return true
}

func (w *windowsBackend) primaryCLI() string { return "netsh" }

func (w *windowsBackend) unavailableHint() string {
	return "`netsh` was not found in PATH, or `netsh wlan show interfaces` failed (Wi-Fi adapter disabled or missing). Enable Wi‑Fi and ensure `netsh.exe` is available for scan and apply."
}

func (w *windowsBackend) apply(ctx context.Context, settings ControllerSettings) NetworkApplyResult {
	result := NetworkApplyResult{
		DryRun: !w.available(),
		Steps:  make([]NetworkCommandResult, 0, 8),
	}
	if result.DryRun {
		result.Warnings = append(result.Warnings, w.unavailableHint())
		return result
	}

	ap := settings.AccessPoint
	if ap.Enabled {
		result.Warnings = append(result.Warnings,
			"Hosted Network / mobile hotspot must be enabled via Settings → Network → Mobile hotspot (netsh hostednetwork is deprecated). CLI AP setup is not applied automatically.")
		result.Steps = append(result.Steps, NetworkCommandResult{
			Command: `Windows: software AP not configured via netsh (use Mobile hotspot UI)`,
			Output:  "See Windows Settings for sharing your connection.",
			Success: false,
			Error:   "configure hotspot in Windows Settings",
		})
	}

	if settings.Upstream.AutoConnect && settings.Upstream.SSID != "" {
		ifName := w.defaultInterfaceName(settings.Upstream.InterfaceName)
		if settings.Upstream.Password != "" {
			profileName := "WLED-" + sanitizeProfileName(settings.Upstream.SSID)
			result.Steps = append(result.Steps, w.addWlanProfile(ctx, profileName, settings.Upstream.SSID, settings.Upstream.Password))
			result.Steps = append(result.Steps, runShellCommand(ctx, "netsh", "wlan", "connect", fmt.Sprintf("name=%s", profileName), fmt.Sprintf("interface=%s", ifName)))
		} else {
			result.Steps = append(result.Steps, runShellCommand(ctx, "netsh", "wlan", "connect", fmt.Sprintf("name=%s", settings.Upstream.SSID), fmt.Sprintf("interface=%s", ifName)))
		}
	}

	if settings.Bridge.Enabled {
		result.Warnings = append(result.Warnings, "Windows connection sharing and routing are configured via the Network adapter UI (ICS); netsh forward not applied here.")
		cmd := exec.CommandContext(ctx, "netsh", "interface", "ipv4", "show", "interfaces")
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
		if !step.Success && step.Error != "" && !strings.Contains(step.Command, "not configured") {
			result.Warnings = append(result.Warnings, fmt.Sprintf("command failed: %s", step.Command))
		}
	}
	return result
}

func (w *windowsBackend) addWlanProfile(ctx context.Context, profileName, ssid, password string) NetworkCommandResult {
	xml := w.wlanProfileXML(profileName, ssid, password)
	tmp, err := os.CreateTemp("", "wled-wlan-*.xml")
	if err != nil {
		return NetworkCommandResult{
			Command: "temp file for wlan profile",
			Output:  "",
			Success: false,
			Error:   err.Error(),
		}
	}
	path := tmp.Name()
	_, _ = tmp.WriteString(xml)
	_ = tmp.Close()
	defer func() { _ = os.Remove(path) }()

	cmd := exec.CommandContext(ctx, "netsh", "wlan", "add", "profile", fmt.Sprintf("filename=%s", path), "user=current")
	out, err := cmd.CombinedOutput()
	result := NetworkCommandResult{
		Command: fmt.Sprintf("netsh wlan add profile filename=%s", path),
		Output:  strings.TrimSpace(string(out)),
		Success: err == nil,
	}
	if err != nil {
		result.Error = err.Error()
	}
	return result
}

func (w *windowsBackend) wlanProfileXML(profileName, ssid, password string) string {
	// Minimal WPA2-PSK profile; suitable for most home networks.
	esc := func(s string) string {
		return strings.ReplaceAll(strings.ReplaceAll(s, "&", "&amp;"), "\"", "&quot;")
	}
	return fmt.Sprintf(`<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
	<name>%s</name>
	<SSIDConfig>
		<SSID>
			<name>%s</name>
		</SSID>
	</SSIDConfig>
	<connectionType>ESS</connectionType>
	<connectionMode>auto</connectionMode>
	<MSM>
		<security>
			<authEncryption>
				<authentication>WPA2PSK</authentication>
				<encryption>AES</encryption>
				<useOneX>false</useOneX>
			</authEncryption>
			<sharedKey>
				<keyType>passPhrase</keyType>
				<protected>false</protected>
				<keyMaterial>%s</keyMaterial>
			</sharedKey>
		</security>
	</MSM>
</WLANProfile>`, esc(profileName), esc(ssid), esc(password))
}

func sanitizeProfileName(s string) string {
	b := strings.Builder{}
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "net"
	}
	if b.Len() > 16 {
		return b.String()[:16]
	}
	return b.String()
}

func (w *windowsBackend) defaultInterfaceName(iface string) string {
	iface = strings.TrimSpace(iface)
	if iface != "" && !strings.HasPrefix(strings.ToLower(iface), "wlan")) {
		return iface
	}
	cmd := exec.Command("netsh", "wlan", "show", "interfaces")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "Wi-Fi"
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(strings.ToLower(line), "name") && strings.Contains(line, ":") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return "Wi-Fi"
}

func (w *windowsBackend) scanWiFi(ctx context.Context, iface string) ([]WiFiNetwork, error) {
	if !w.available() {
		return nil, errors.New(w.unavailableHint())
	}
	_ = iface
	cmd := exec.CommandContext(ctx, "netsh", "wlan", "show", "networks", "mode=Bssid")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("netsh wlan scan failed: %w", err)
	}
	return parseNetshWLANNetworks(string(output)), nil
}

var netshSSIDLine = regexp.MustCompile(`^\s*SSID\s+\d+\s*:\s*(.*)$`)
var netshSignalLine = regexp.MustCompile(`^\s*Signal\s*:\s*(\d+)\s*%`)
var netshAuthLine = regexp.MustCompile(`^\s*Authentication\s*:\s*(.*)$`)

func parseNetshWLANNetworks(output string) []WiFiNetwork {
	var currentSSID string
	var currentSignal int
	var currentAuth string
	seen := make(map[string]WiFiNetwork)

	flush := func() {
		if currentSSID == "" {
			return
		}
		sec := strings.TrimSpace(currentAuth)
		if sec == "" {
			sec = "unknown"
		}
		net := WiFiNetwork{
			SSID:     currentSSID,
			Signal:   currentSignal,
			Security: sec,
		}
		if existing, ok := seen[currentSSID]; !ok || net.Signal > existing.Signal {
			seen[currentSSID] = net
		}
		currentSSID = ""
		currentSignal = 0
		currentAuth = ""
	}

	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimRight(line, "\r")
		if m := netshSSIDLine.FindStringSubmatch(line); m != nil {
			flush()
			currentSSID = strings.TrimSpace(m[1])
			continue
		}
		if m := netshSignalLine.FindStringSubmatch(line); m != nil {
			if v, err := strconv.Atoi(m[1]); err == nil {
				currentSignal = v
			}
			continue
		}
		if m := netshAuthLine.FindStringSubmatch(line); m != nil {
			currentAuth = strings.TrimSpace(m[1])
			flush()
			continue
		}
	}
	flush()

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
