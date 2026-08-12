//go:build !linux

package network

import (
	"context"
	"log"
)

const listIPNeighborsCommand = `nmap -sn $(ip route | awk '/kernel/ {print $1}')`

// ListIPNeighborsSupported reports whether this build can run a local nmap host discovery.
func ListIPNeighborsSupported() bool {
	return false
}

// ListIPNeighbors is unavailable off Linux.
func ListIPNeighbors(ctx context.Context, logger *log.Logger) NetworkCommandResult {
	_ = ctx
	_ = logger
	return NetworkCommandResult{
		Command: listIPNeighborsCommand,
		Success: false,
		Error:   "listing IP neighbors is only available on Linux",
	}
}
