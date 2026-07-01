package discovery

import (
	"net"
	"testing"
)

func TestPickPreferredDiscoveryIfacePrefersWLAN(t *testing.T) {
	wlan := &net.Interface{Name: "wlan0", Flags: net.FlagUp | net.FlagMulticast}
	eth := &net.Interface{Name: "eth0", Flags: net.FlagUp | net.FlagMulticast}
	got := pickPreferredDiscoveryIface([]*net.Interface{eth, wlan})
	if got == nil || got.Name != "wlan0" {
		t.Fatalf("pickPreferredDiscoveryIface() = %v, want wlan0", got)
	}
}

func TestPickPreferredDiscoveryIfaceStableFallback(t *testing.T) {
	a := &net.Interface{Name: "bridge100"}
	b := &net.Interface{Name: "bridge10"}
	got := pickPreferredDiscoveryIface([]*net.Interface{a, b})
	if got == nil || got.Name != "bridge10" {
		t.Fatalf("pickPreferredDiscoveryIface() = %v, want bridge10", got)
	}
}

func TestAutoSelectDiscoveryNetInterfaceReturnsUpIface(t *testing.T) {
	iface := autoSelectDiscoveryNetInterface(nil)
	if iface == nil {
		t.Skip("no suitable network interface in test environment")
	}
	if iface.Flags&net.FlagUp == 0 {
		t.Fatalf("auto-selected iface %q is not up", iface.Name)
	}
}
