//go:build linux

package main

import "goldbus/internal/platform"

func afterWebviewCreated() {
	platform.InstallGoCompatibleSignalHandlers()
}
