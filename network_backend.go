package main

import (
	"context"
	"log"
	"os/exec"
	"runtime"
	"strings"
)

// networkBackend implements OS-specific Wi-Fi / network control (nmcli on Linux,
// airport/networksetup on macOS, netsh on Windows).
type networkBackend interface {
	id() string
	label() string
	available() bool
	// primaryCLI is the main command-line tool name shown in the UI for this host (e.g. nmcli, netsh).
	primaryCLI() string
	// unavailableHint explains what is missing when available() is false.
	unavailableHint() string
	apply(ctx context.Context, settings ControllerSettings) NetworkApplyResult
	scanWiFi(ctx context.Context, iface string) ([]WiFiNetwork, error)
}

func selectNetworkBackend(logger *log.Logger) networkBackend {
	switch runtime.GOOS {
	case "linux":
		return newLinuxBackend(logger)
	case "darwin":
		return newDarwinBackend(logger)
	case "windows":
		return newWindowsBackend(logger)
	default:
		return newStubBackend(logger)
	}
}

func runShellCommand(ctx context.Context, name string, args ...string) NetworkCommandResult {
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
	}
	return result
}
