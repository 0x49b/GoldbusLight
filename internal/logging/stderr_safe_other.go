//go:build !windows

package logging

func stderrSafe() bool {
	return true
}
