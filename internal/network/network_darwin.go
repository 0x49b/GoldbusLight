//go:build darwin

package network

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"strings"
)

type darwinBackend struct {
	logger *log.Logger
}

func newDarwinBackend(logger *log.Logger) Backend {
	return &darwinBackend{logger: logger}
}

func (d *darwinBackend) ID() string    { return "darwin" }
func (d *darwinBackend) Label() string { return "macOS (networksetup)" }

func (d *darwinBackend) Available() bool {
	_, err := exec.LookPath("networksetup")
	return err == nil
}

func (d *darwinBackend) PrimaryCLI() string {
	return "networksetup"
}

func (d *darwinBackend) UnavailableHint() string {
	return "`networksetup` was not found in PATH (needed for Wi‑Fi hardware ports). Install full macOS command-line tools."
}

func (d *darwinBackend) Apply(ctx context.Context, settings ControllerSettings) NetworkApplyResult {
	_ = ctx
	result := NetworkApplyResult{
		DryRun: !d.Available(),
		Steps:  make([]NetworkCommandResult, 0, 8),
	}
	if result.DryRun {
		result.Warnings = append(result.Warnings, d.UnavailableHint())
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

	for _, step := range result.Steps {
		if !step.Success && step.Error != "" && !strings.Contains(step.Command, "skipped") {
			result.Warnings = append(result.Warnings, fmt.Sprintf("command failed: %s", step.Command))
		}
	}
	return result
}

func SelectNetworkBackend(logger *log.Logger) Backend {
	return newDarwinBackend(logger)
}
