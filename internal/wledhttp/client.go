package wledhttp

import (
	"net"
	"net/http"
	"time"
)

// IPv4OnInterface returns the first non-loopback IPv4 assigned to iface.
func IPv4OnInterface(iface *net.Interface) net.IP {
	if iface == nil {
		return nil
	}
	addrs, err := iface.Addrs()
	if err != nil {
		return nil
	}
	for _, a := range addrs {
		ipNet, ok := a.(*net.IPNet)
		if !ok || ipNet.IP.To4() == nil || ipNet.IP.IsLoopback() {
			continue
		}
		return ipNet.IP.To4()
	}
	return nil
}

// ClientForInterface returns an HTTP client that dials from iface's IPv4 when available.
// On macOS this avoids "no route to host" when reaching devices on the local subnet.
func ClientForInterface(iface *net.Interface, timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = 4 * time.Second
	}
	dialer := &net.Dialer{
		Timeout:   timeout / 2,
		KeepAlive: -1,
	}
	if localIP := IPv4OnInterface(iface); localIP != nil {
		dialer.LocalAddr = &net.TCPAddr{IP: localIP}
	}
	return &http.Client{
		Transport: &http.Transport{
			DialContext:       dialer.DialContext,
			DisableKeepAlives: true,
		},
		Timeout: timeout,
	}
}
