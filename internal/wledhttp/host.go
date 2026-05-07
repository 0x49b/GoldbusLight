package wledhttp

import (
	"net"
	"strconv"
	"strings"
)

// HostForHTTP chooses the host segment for HTTP URLs to a WLED device discovered via mDNS.
// Responses often include an A record for the device's IP on another subnet (e.g. STA vs AP).
// Dialing that IP from the controller can yield ENETUNREACH while multicast DNS still finds the service.
// Prefer the advertised *.local hostname so the resolver picks the correct interface.
// Raw IPv6 literals are normalized so net.JoinHostPort can bracket them in BaseHTTPURL.
func HostForHTTP(host, address string) string {
	h := strings.TrimSuffix(strings.TrimSpace(host), ".")
	if h != "" && strings.HasSuffix(strings.ToLower(h), ".local") {
		return h
	}
	addr := strings.TrimSpace(address)
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
