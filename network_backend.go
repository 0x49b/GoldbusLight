package main

import (
	"context"
	"log"
	"os/exec"
	"strings"
)

// networkBackend implements OS-specific Wi-Fi access point control (nmcli on Linux,
// networksetup on macOS, netsh on Windows).
type networkBackend interface {
	id() string
	label() string
	available() bool
	// primaryCLI is the main command-line tool name shown in the UI for this host (e.g. nmcli, netsh).
	primaryCLI() string
	// unavailableHint explains what is missing when available() is false.
	unavailableHint() string
	apply(ctx context.Context, settings ControllerSettings) NetworkApplyResult
}

func runShellCommand(ctx context.Context, logger *log.Logger, name string, args ...string) NetworkCommandResult {
	full := strings.Join(append([]string{name}, args...), " ")
	cmd := exec.CommandContext(ctx, name, args...)
	output, err := cmd.CombinedOutput()
	result := NetworkCommandResult{
		Command: full,
		Output:  strings.TrimSpace(string(output)),
		Success: err == nil,
	}
	if err != nil {
		result.Error = err.Error()
		if logger != nil {
			logger.Printf("network apply command failed: %s; err=%v; output=%q", full, err, result.Output)
		}
	}
	return result
}
