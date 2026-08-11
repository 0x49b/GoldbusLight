//go:build linux

package network

import (
	"context"
	"log"
	"os/exec"
)

// ListIPNeighborsSupported reports whether this build can run `ip neigh`.
func ListIPNeighborsSupported() bool {
	return true
}

// ListIPNeighbors runs `ip neigh` and returns the combined command result.
func ListIPNeighbors(ctx context.Context, logger *log.Logger) NetworkCommandResult {
	if _, err := exec.LookPath("ip"); err != nil {
		return NetworkCommandResult{
			Command: "ip neigh",
			Success: false,
			Error:   "`ip` (iproute2) was not found in PATH",
		}
	}
	return runShellCommand(ctx, logger, "ip", "neigh")
}
