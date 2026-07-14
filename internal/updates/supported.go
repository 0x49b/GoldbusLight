package updates

import (
	"os"
	"path/filepath"
	"runtime"
)

// DefaultManagedInstallDir is where the Raspberry Pi installer places the app.
const DefaultManagedInstallDir = "/opt/goldbuslight"

// InAppUpdatesSupported reports whether the built-in Wails updater should be used.
//
// Managed Pi/kiosk installs under /opt/goldbuslight must use install-release.sh
// instead. The Wails helper swaps the binary in place and relaunches it directly,
// which breaks systemd-managed deployments: no launch.sh (DISPLAY / wait-for-X),
// and a failed relaunch can leave only GoldbusLight.bak behind.
func InAppUpdatesSupported() bool {
	exe, err := os.Executable()
	if err != nil {
		return true
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return true
	}
	return supportedForExecutable(exe)
}

func supportedForExecutable(exe string) bool {
	if runtime.GOOS != "linux" {
		return true
	}
	return !isManagedInstall(exe)
}

func isManagedInstall(exe string) bool {
	return samePath(exe, managedInstallBinary())
}

func managedInstallBinary() string {
	installDir := os.Getenv("GOLDBUS_INSTALL_DIR")
	if installDir == "" {
		installDir = DefaultManagedInstallDir
	}
	return filepath.Join(installDir, "GoldbusLight")
}

func samePath(a, b string) bool {
	a = filepath.Clean(a)
	b = filepath.Clean(b)
	if a == b {
		return true
	}
	ra, err1 := filepath.EvalSymlinks(a)
	rb, err2 := filepath.EvalSymlinks(b)
	return err1 == nil && err2 == nil && ra == rb
}
