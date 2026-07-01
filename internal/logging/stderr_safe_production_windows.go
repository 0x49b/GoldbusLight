//go:build windows && production

package logging

// Production Windows GUI builds must never write to stderr — Windows flashes a console.
func stderrSafe() bool {
	return false
}
