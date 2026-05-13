package network

import (
	"context"
	"log"
	"os/exec"
	"strings"
)

type AccessPointSettings struct {
	Enabled       bool
	Connection    string
	InterfaceName string
	SSID          string
	Password      string
	Channel       int
}

type ControllerSettings struct {
	AccessPoint AccessPointSettings
}

type NetworkCommandResult struct {
	Command string
	Output  string
	Success bool
	Error   string
}

type NetworkApplyResult struct {
	DryRun   bool
	Warnings []string
	Steps    []NetworkCommandResult
}

// NetworkBackend implements OS-specific Wi-Fi access point control (nmcli on Linux,
// networksetup on macOS, netsh on Windows).
type Backend interface {
	ID() string
	Label() string
	Available() bool
	// primaryCLI is the main command-line tool name shown in the UI for this host (e.g. nmcli, netsh).
	PrimaryCLI() string
	// unavailableHint explains what is missing when available() is false.
	UnavailableHint() string
	Apply(ctx context.Context, settings ControllerSettings) NetworkApplyResult
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

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
