//go:build !linux && !darwin && !windows

package network

import (
	"context"
	"log"
)

type stubBackend struct {
	logger *log.Logger
}

func newStubBackend(logger *log.Logger) Backend {
	return &stubBackend{logger: logger}
}

func (s *stubBackend) ID() string    { return "stub" }
func (s *stubBackend) Label() string { return "none" }

func (s *stubBackend) Available() bool {
	return false
}

func (s *stubBackend) PrimaryCLI() string { return "—" }

func (s *stubBackend) UnavailableHint() string {
	return "No OS Wi-Fi integration is built for this platform (expected Linux `nmcli`, macOS `networksetup`, or Windows `netsh`)."
}

func (s *stubBackend) Apply(ctx context.Context, settings ControllerSettings) NetworkApplyResult {
	_ = settings
	return NetworkApplyResult{
		DryRun: true,
		Warnings: []string{
			"network control is not implemented for this platform",
		},
		Steps: nil,
	}
}

func SelectNetworkBackend(logger *log.Logger) Backend {
	return newStubBackend(logger)
}
