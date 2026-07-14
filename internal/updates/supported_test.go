package updates

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestSupportedForExecutable_nonLinux(t *testing.T) {
	if runtime.GOOS == "linux" {
		t.Skip("linux-specific paths tested separately")
	}
	if !supportedForExecutable("/opt/goldbuslight/GoldbusLight") {
		t.Fatal("expected in-app updates on non-linux")
	}
}

func TestIsManagedInstall(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("linux only")
	}
	dir := t.TempDir()
	bin := filepath.Join(dir, "GoldbusLight")
	if err := os.WriteFile(bin, []byte("test"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GOLDBUS_INSTALL_DIR", dir)
	if !isManagedInstall(bin) {
		t.Fatal("expected binary under managed install dir to be detected")
	}
	if isManagedInstall(filepath.Join(dir, "other-binary")) {
		t.Fatal("unexpected managed install for unrelated path")
	}
	if supportedForExecutable(bin) {
		t.Fatal("expected managed install to disable in-app updates")
	}
	if !supportedForExecutable("/usr/local/bin/GoldbusLight") {
		t.Fatal("expected non-managed linux path to allow in-app updates")
	}
}
