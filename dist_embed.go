package goldbus

import "embed"

// AppVersion is surfaced to the Wails frontend via GoldbusLightService.AppVersion.
// Production builds may override via -ldflags=-X goldbus.AppVersion=...
var AppVersion = "0.0.1"

//go:embed all:frontend/dist
var Dist embed.FS
