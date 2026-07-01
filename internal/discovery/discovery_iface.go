package discovery

import (
	"log"
	"net"
	"net/http"
	"slices"
	"strings"
	"time"

	"goldbus/internal/wledhttp"
)

var preferredDiscoveryIfaceNames = []string{
	"wlan0", "wlp", "wlx", "en0", "en1", "eth0", "enp",
}

func ResolveDiscoveryNetInterface(logger *log.Logger, settings ControllerSettings) *net.Interface {
	name := strings.TrimSpace(settings.Discovery.BindInterface)
	if name == "" && settings.AccessPoint.Enabled {
		apName := strings.TrimSpace(settings.AccessPoint.InterfaceName)
		if apName != "" {
			if _, err := net.InterfaceByName(apName); err == nil {
				name = apName
			}
		}
	}
	if name != "" {
		ifi, err := net.InterfaceByName(name)
		if err != nil {
			if logger != nil {
				logger.Printf("discovery: bind interface %q: %v; falling back to auto-select", name, err)
			}
			return autoSelectDiscoveryNetInterface(logger)
		}
		return ifi
	}
	return autoSelectDiscoveryNetInterface(logger)
}

func autoSelectDiscoveryNetInterface(logger *log.Logger) *net.Interface {
	ifaces, err := net.Interfaces()
	if err != nil {
		if logger != nil {
			logger.Printf("discovery: list interfaces: %v", err)
		}
		return nil
	}

	candidates := make([]*net.Interface, 0, len(ifaces))
	for i := range ifaces {
		iface := &ifaces[i]
		if !isDiscoveryIfaceCandidate(iface) {
			continue
		}
		candidates = append(candidates, iface)
	}
	if len(candidates) == 0 {
		if logger != nil {
			logger.Printf("discovery: no suitable network interface for mDNS")
		}
		return nil
	}

	if selected := pickPreferredDiscoveryIface(candidates); selected != nil {
		if logger != nil {
			logger.Printf("discovery: auto-selected interface %q for mDNS", selected.Name)
		}
		return selected
	}
	return nil
}

func isDiscoveryIfaceCandidate(iface *net.Interface) bool {
	if iface == nil {
		return false
	}
	if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
		return false
	}
	if iface.Flags&net.FlagMulticast == 0 {
		return false
	}
	addrs, err := iface.Addrs()
	if err != nil {
		return false
	}
	for _, a := range addrs {
		ipNet, ok := a.(*net.IPNet)
		if !ok || ipNet.IP.To4() == nil || ipNet.IP.IsLoopback() {
			continue
		}
		return true
	}
	return false
}

func pickPreferredDiscoveryIface(candidates []*net.Interface) *net.Interface {
	if len(candidates) == 0 {
		return nil
	}
	for _, pref := range preferredDiscoveryIfaceNames {
		for _, iface := range candidates {
			name := iface.Name
			if name == pref || strings.HasPrefix(name, pref) {
				return iface
			}
		}
	}
	slices.SortFunc(candidates, func(a, b *net.Interface) int {
		return strings.Compare(a.Name, b.Name)
	})
	return candidates[0]
}

func httpClientForInterface(iface *net.Interface) *http.Client {
	return wledhttp.ClientForInterface(iface, 3*time.Second)
}
