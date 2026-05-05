package wledhttp

import "strings"

// HostForHTTP chooses the host segment for HTTP URLs to a WLED device discovered via mDNS.
// Responses often include an A record for the device's IP on another subnet (e.g. STA vs AP).
// Dialing that IP from the controller can yield ENETUNREACH while multicast DNS still finds the service.
// Prefer the advertised *.local hostname so the resolver picks the correct interface.
func HostForHTTP(host, address string) string {
	h := strings.TrimSuffix(strings.TrimSpace(host), ".")
	if h != "" && strings.HasSuffix(strings.ToLower(h), ".local") {
		return h
	}
	return address
}
