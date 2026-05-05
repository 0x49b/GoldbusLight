//go:build darwin

package main

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

func newDarwinBackend(logger *log.Logger) networkBackend {
	return &darwinBackend{logger: logger}
}

func (d *darwinBackend) id() string    { return "darwin" }
func (d *darwinBackend) label() string { return "macOS (networksetup)" }

func (d *darwinBackend) available() bool {
	_, err := exec.LookPath("networksetup")
	return err == nil
}

func (d *darwinBackend) primaryCLI() string {
	return "networksetup"
}

func (d *darwinBackend) unavailableHint() string {
	return "`networksetup` was not found in PATH (needed for Wi‑Fi hardware ports). Install full macOS command-line tools."
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

	for _, step := range result.Steps {
		if !step.Success && step.Error != "" && !strings.Contains(step.Command, "skipped") {
			result.Warnings = append(result.Warnings, fmt.Sprintf("command failed: %s", step.Command))
		}
	}
	return result
}

func selectNetworkBackend(logger *log.Logger) networkBackend {
	return newDarwinBackend(logger)
}
