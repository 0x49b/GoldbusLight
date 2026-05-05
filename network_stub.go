//go:build !linux && !darwin && !windows

package main

import (
	"context"
	"log"
)

type stubBackend struct {
	logger *log.Logger
}

func newStubBackend(logger *log.Logger) networkBackend {
	return &stubBackend{logger: logger}
}

func (s *stubBackend) id() string    { return "stub" }
func (s *stubBackend) label() string { return "none" }

func (s *stubBackend) available() bool {
	return false
}

func (s *stubBackend) primaryCLI() string { return "—" }

func (s *stubBackend) unavailableHint() string {
	return "No OS Wi-Fi integration is built for this platform (expected Linux `nmcli`, macOS `networksetup`, or Windows `netsh`)."
}

func (s *stubBackend) apply(ctx context.Context, settings ControllerSettings) NetworkApplyResult {
	_ = settings
	return NetworkApplyResult{
		DryRun: true,
		Warnings: []string{
			"network control is not implemented for this platform",
		},
		Steps: nil,
	}
}

func selectNetworkBackend(logger *log.Logger) networkBackend {
	return newStubBackend(logger)
}
