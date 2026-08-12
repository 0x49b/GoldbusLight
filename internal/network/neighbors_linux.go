//go:build linux

package network

import (
	"context"
	"fmt"
	"log"
	"os/exec"
)

const listIPNeighborsCommand = `nmap -sn $(ip route | awk '/kernel/ {print $1}')`

// ListIPNeighborsSupported reports whether this build can run a local nmap host discovery.
func ListIPNeighborsSupported() bool {
	return true
}

// ListIPNeighbors runs nmap host discovery on local kernel routes and returns the command result.
func ListIPNeighbors(ctx context.Context, logger *log.Logger) NetworkCommandResult {
	for _, bin := range []string{"nmap", "ip", "awk"} {
		if _, err := exec.LookPath(bin); err != nil {
			return NetworkCommandResult{
				Command: listIPNeighborsCommand,
				Success: false,
				Error:   fmt.Sprintf("`%s` was not found in PATH", bin),
			}
		}
	}
	result := runShellCommand(ctx, logger, "sh", "-c", listIPNeighborsCommand)
	result.Command = listIPNeighborsCommand
	return result
}
