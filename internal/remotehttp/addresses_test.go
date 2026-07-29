package remotehttp

import (
	"net"
	"strings"
	"testing"
)

func TestCompanionURLsUsesPort(t *testing.T) {
	urls := CompanionURLs(8765)
	for _, u := range urls {
		hostPort := strings.TrimPrefix(strings.TrimPrefix(u, "https://"), "http://")
		hostPort = strings.TrimSuffix(hostPort, "/")
		_, p, err := net.SplitHostPort(hostPort)
		if err != nil {
			t.Fatalf("SplitHostPort(%q): %v", hostPort, err)
		}
		if p != "8765" {
			t.Fatalf("expected port 8765 in %q", u)
		}
	}
}

func TestCompanionURLsInvalidPort(t *testing.T) {
	if got := CompanionURLs(0); len(got) != 0 {
		t.Fatalf("expected empty, got %v", got)
	}
}
