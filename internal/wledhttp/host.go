package wledhttp

import (
	"net"
	"strconv"
	"strings"
)

// HostForHTTP chooses the host segment for HTTP URLs to a WLED device.
// When a usable IPv4 address is known, prefer it: Go's resolver does not resolve Bonjour
// *.local names on all platforms (notably macOS dev builds), while dns-sd already provides
// the correct LAN address. Fall back to the advertised *.local hostname when no IP is known.
func HostForHTTP(host, address string) string {
	addr := strings.TrimSpace(address)
	if ip := net.ParseIP(addr); ip != nil && ip.To4() != nil {
		return ip.String()
	}
	h := strings.TrimSuffix(strings.TrimSpace(host), ".")
	if h != "" && strings.HasSuffix(strings.ToLower(h), ".local") {
		return h
	}
	if ip := net.ParseIP(addr); ip != nil {
		return ip.String()
	}
	return addr
}

// BaseHTTPURL builds an http URL for the WLED JSON API, handling IPv6 host literals correctly.
func BaseHTTPURL(host, address string, port int) string {
	h := HostForHTTP(host, address)
	return "http://" + net.JoinHostPort(h, strconv.Itoa(port))
}
