//go:build !darwin

package discovery

import (
	"context"
	"log"
	"time"
)

func platformDiscoverOnce(context.Context, []string, time.Duration, *log.Logger) []DiscoveredDevice {
	return nil
}
