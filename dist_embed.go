package goldbus

import (
	"embed"
	"io/fs"
	"strings"
)

const DefaultAppVersion = "0.0.1"

// AppVersion is surfaced to the Wails frontend via GoldbusLightService.AppVersion.
// Production builds may override via -ldflags=-X goldbus.AppVersion=...
var AppVersion = DefaultAppVersion

// EffectiveAppVersion returns the installed application version, falling back when
// ldflags inject an empty value.
func EffectiveAppVersion() string {
	v := strings.TrimSpace(AppVersion)
	if v == "" {
		return DefaultAppVersion
	}
	return v
}

//go:embed all:frontend/dist
var Dist embed.FS

// FrontendDist returns the embedded Vite build root (index.html, companion.html, assets).
func FrontendDist() (fs.FS, error) {
	return fs.Sub(Dist, "frontend/dist")
}
