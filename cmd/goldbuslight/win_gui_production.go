//go:build windows && production

package main

import "os"

func init() {
	// GUI subsystem (-H windowsgui) has no console; any stderr/stdout write from the
	// runtime or dependencies can still make Windows briefly show a terminal.
	devNull, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
	if err != nil {
		return
	}
	os.Stderr = devNull
	os.Stdout = devNull
}
