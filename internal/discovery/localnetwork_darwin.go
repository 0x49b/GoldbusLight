//go:build darwin

package discovery

import (
	"context"
	"log"
	"net"
	"strconv"
	"strings"
	"time"
)

// WarmupLocalNetworkAccess performs LAN operations so macOS can show the Local Network
// permission prompt before discovery/inspect traffic. UDP mDNS alone is not enough on
// some macOS versions — a TCP dial to a discovered peer is required to unlock peer access.
func WarmupLocalNetworkAccess(logger *log.Logger) {
	conn, err := net.DialTimeout("udp", "224.0.0.251:5353", 2*time.Second)
	if err != nil {
		if logger != nil {
			logger.Printf("discovery: local network warmup udp: %v", err)
		}
	} else {
		_, _ = conn.Write([]byte("warmup"))
		_ = conn.Close()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	devices := platformDiscoverOnce(ctx, []string{"_wled._tcp"}, 3*time.Second, logger)
	for _, dev := range devices {
		addr := strings.TrimSpace(dev.Address)
		if addr == "" || net.ParseIP(addr) == nil {
			continue
		}
		port := dev.Port
		if port <= 0 {
			port = 80
		}
		target := net.JoinHostPort(addr, strconv.Itoa(port))
		tcp, err := net.DialTimeout("tcp", target, 3*time.Second)
		if err != nil {
			if logger != nil {
				logger.Printf("discovery: local network TCP warmup %s: %v", target, err)
				logger.Printf("discovery: enable “Goldbus Light Controller” in System Settings → Privacy & Security → Local Network, then restart the app")
			}
			continue
		}
		_ = tcp.Close()
		return
	}
}
