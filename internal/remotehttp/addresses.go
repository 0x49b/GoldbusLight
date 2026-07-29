package remotehttp

import (
	"encoding/base64"
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"

	qrcode "github.com/skip2/go-qrcode"
)

// ListRoutableIPv4 returns non-loopback IPv4 addresses on up interfaces.
func ListRoutableIPv4() []string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	seen := map[string]struct{}{}
	var out []string
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil {
				continue
			}
			ip4 := ip.To4()
			if ip4 == nil || ip4.IsLoopback() || ip4.IsLinkLocalUnicast() {
				continue
			}
			s := ip4.String()
			if _, ok := seen[s]; ok {
				continue
			}
			seen[s] = struct{}{}
			out = append(out, s)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		// Prefer common AP gateway subnet first (NetworkManager shared).
		pi := strings.HasPrefix(out[i], "10.42.")
		pj := strings.HasPrefix(out[j], "10.42.")
		if pi != pj {
			return pi
		}
		return out[i] < out[j]
	})
	return out
}

// CompanionURLs builds http://ip:port/ URLs for phone access.
func CompanionURLs(port int) []string {
	if port <= 0 || port > 65535 {
		return nil
	}
	portStr := strconv.Itoa(port)
	ips := ListRoutableIPv4()
	out := make([]string, 0, len(ips)+1)
	for _, ip := range ips {
		out = append(out, fmt.Sprintf("http://%s/", net.JoinHostPort(ip, portStr)))
	}
	return out
}

// CompanionQRDataURL returns a PNG data URL for the first companion URL.
func CompanionQRDataURL(urls []string) string {
	if len(urls) == 0 {
		return ""
	}
	png, err := qrcode.Encode(urls[0], qrcode.Medium, 256)
	if err != nil {
		return ""
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
}
