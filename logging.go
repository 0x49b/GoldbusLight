package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
)

// initFileLogger tees the standard library logger to stderr and a log file.
// The default path matches the controller state directory: UserConfigDir/wled-controller/app.log.
// Override with GOLDBUS_LOG_FILE (absolute or relative path).
func initFileLogger() (cleanup func()) {
	path := os.Getenv("GOLDBUS_LOG_FILE")
	if path == "" {
		path = defaultLogFilePath()
	}

	dir := filepath.Dir(path)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			fmt.Fprintf(os.Stderr, "goldbus: cannot create log directory %s: %v\n", dir, err)
			return func() {}
		}
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		fmt.Fprintf(os.Stderr, "goldbus: cannot open log file %s: %v\n", path, err)
		return func() {}
	}

	log.SetOutput(io.MultiWriter(os.Stderr, f))
	log.Printf("file logging enabled: %s", path)

	return func() { _ = f.Close() }
}

func defaultLogFilePath() string {
	cfgDir, err := os.UserConfigDir()
	if err != nil || cfgDir == "" {
		return filepath.Join(".", "app.log")
	}
	return filepath.Join(cfgDir, "wled-controller", "app.log")
}
