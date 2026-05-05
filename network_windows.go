//go:build windows

package main

import (
	"context"
	"fmt"
	"log"
	"os/exec"
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
	return "`netsh` was not found in PATH, or `netsh wlan show interfaces` failed (Wi-Fi adapter disabled or missing). Enable Wi‑Fi and ensure `netsh.exe` is available."
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

	for _, step := range result.Steps {
		if !step.Success && step.Error != "" && !strings.Contains(step.Command, "not configured") {
			result.Warnings = append(result.Warnings, fmt.Sprintf("command failed: %s", step.Command))
		}
	}
	return result
}

func selectNetworkBackend(logger *log.Logger) networkBackend {
	return newWindowsBackend(logger)
}
