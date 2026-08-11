//go:build !linux

package network

import (
	"context"
	"log"
)

// ListIPNeighborsSupported reports whether this build can run `ip neigh`.
func ListIPNeighborsSupported() bool {
	return false
}

// ListIPNeighbors is unavailable off Linux.
func ListIPNeighbors(ctx context.Context, logger *log.Logger) NetworkCommandResult {
	_ = ctx
	_ = logger
	return NetworkCommandResult{
		Command: "ip neigh",
		Success: false,
		Error:   "listing IP neighbors is only available on Linux",
	}
}
