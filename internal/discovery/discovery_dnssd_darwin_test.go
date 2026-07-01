//go:build darwin

package discovery

import (
	"context"
	"testing"
	"time"
)

func TestBrowseDNSSDLive(t *testing.T) {
	if testing.Short() {
		t.Skip("live dns-sd browse")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	devices := browseDNSSD(ctx, "_wled._tcp", 4*time.Second, nil)
	if len(devices) == 0 {
		t.Fatal("expected at least one WLED device via dns-sd on LAN")
	}
	t.Logf("found: %+v", devices[0])
}
