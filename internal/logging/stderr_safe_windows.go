//go:build windows && !production

package logging

import "syscall"

// stderrSafe reports whether the process has an attached console window.
// GUI builds (-H windowsgui) must not write to stderr — Windows would flash a console.
func stderrSafe() bool {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getConsoleWindow := kernel32.NewProc("GetConsoleWindow")
	handle, _, _ := getConsoleWindow.Call()
	return handle != 0
}
