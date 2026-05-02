//go:build !linux && !darwin && !windows

package main

import (
	"context"
	"errors"
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

func (s *stubBackend) scanWiFi(ctx context.Context, iface string) ([]WiFiNetwork, error) {
	_ = ctx
	_ = iface
	return nil, errors.New("Wi-Fi scan is not available on this platform")
}
