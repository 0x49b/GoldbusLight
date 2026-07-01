package logging

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
)

// InitFileLogger writes the standard library logger to a log file, and to stderr
// only when a console is attached (avoids a flashing terminal on Windows GUI builds).
// The default path matches the controller state directory: UserConfigDir/wled-controller/app.log.
// Override with GOLDBUS_LOG_FILE (absolute or relative path).
func InitFileLogger() (cleanup func()) {
	path := os.Getenv("GOLDBUS_LOG_FILE")
	if path == "" {
		path = defaultLogFilePath()
	}

	dir := filepath.Dir(path)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			if stderrSafe() {
				fmt.Fprintf(os.Stderr, "goldbus: cannot create log directory %s: %v\n", dir, err)
			}
			return func() {}
		}
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		if stderrSafe() {
			fmt.Fprintf(os.Stderr, "goldbus: cannot open log file %s: %v\n", path, err)
		}
		return func() {}
	}

	out := io.Writer(f)
	if stderrSafe() {
		out = io.MultiWriter(os.Stderr, f)
	}
	log.SetOutput(out)
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
