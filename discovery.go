package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/grandcat/zeroconf"
	"github.com/hashicorp/mdns"
)

// DiscoveryRunParams configures one synchronous discovery pass (mDNS queries).
type DiscoveryRunParams struct {
	Settings  DiscoverySettings
	BindIface *net.Interface
}

func (d *DiscoveryEngine) DiscoverOnce(ctx context.Context, params DiscoveryRunParams) ([]discoveredDevice, error) {
	settings := params.Settings
	serviceTypes := settings.ServiceTypes
	if len(serviceTypes) == 0 {
		serviceTypes = []string{"_wled._tcp", "_http._tcp"}
	}

	timeout := time.Duration(settings.QueryTimeoutMS) * time.Millisecond
	if timeout <= 0 {
		timeout = 2 * time.Second
	}

	known := map[string]discoveredDevice{}
	for _, serviceType := range serviceTypes {
		serviceType := serviceType
		entries := make(chan *mdns.ServiceEntry, 64)
		var wg sync.WaitGroup
		var mu sync.Mutex

		wg.Add(1)
		go func() {
			defer wg.Done()
			for entry := range entries {
				candidate := toDiscoveredDevice(entry)
				if !isWLEDCandidate(serviceType, candidate) {
					continue
				}
				key := probeDedupeKey(candidate.Host, candidate.Address, candidate.Port)
				mu.Lock()
				known[key] = candidate
				mu.Unlock()
			}
		}()

		queryCtx, cancel := context.WithTimeout(ctx, timeout+500*time.Millisecond)
		q := &mdns.QueryParam{
			Service:             serviceType,
			Domain:              "local",
			Timeout:             timeout,
			Entries:             entries,
			Interface:           params.BindIface,
			WantUnicastResponse: true,
		}
		err := mdns.QueryContext(queryCtx, q)
		cancel()
		close(entries)
		wg.Wait()
		if err != nil {
			d.logger.Printf("mdns query failed for %s: %v", serviceType, err)
		}
	}

	found := make([]discoveredDevice, 0, len(known))
	for _, device := range known {
		found = append(found, device)
	}
	slices.SortFunc(found, func(a, b discoveredDevice) int {
		return strings.Compare(a.Address, b.Address)
	})
	return found, nil
}

func probeDedupeKey(host, address string, port int) string {
	h := strings.TrimSpace(strings.ToLower(host))
	a := strings.TrimSpace(address)
	if ip := net.ParseIP(a); ip != nil {
		a = ip.String()
	}
	return net.JoinHostPort(a, fmt.Sprintf("%d", port)) + "|" + h
}

func resolveDiscoveryNetInterface(logger *log.Logger, settings ControllerSettings) *net.Interface {
	name := strings.TrimSpace(settings.Discovery.BindInterface)
	if name == "" && settings.AccessPoint.Enabled {
		name = strings.TrimSpace(settings.AccessPoint.InterfaceName)
	}
	if name == "" {
		return nil
	}
	ifi, err := net.InterfaceByName(name)
	if err != nil {
		if logger != nil {
			logger.Printf("discovery: bind interface %q: %v", name, err)
		}
		return nil
	}
	return ifi
}

func discoveryBrowseSignature(settings ControllerSettings) string {
	d := settings.Discovery
	if !d.Enabled || !d.PassiveBrowse {
		return ""
	}
	ap := settings.AccessPoint
	st := strings.Join(d.ServiceTypes, ",")
	if st == "" {
		st = "_wled._tcp,_http._tcp"
	}
	bind := strings.TrimSpace(d.BindInterface)
	if bind == "" && ap.Enabled {
		bind = strings.TrimSpace(ap.InterfaceName)
	}
	return fmt.Sprintf("%s|%s|%v", bind, st, ap.Enabled)
}

func zeroconfClientOptions(iface *net.Interface) []zeroconf.ClientOption {
	if iface == nil {
		return nil
	}
	return []zeroconf.ClientOption{zeroconf.SelectIfaces([]net.Interface{*iface})}
}

func discoveredFromZeroconf(entry *zeroconf.ServiceEntry) discoveredDevice {
	host := strings.TrimSuffix(strings.TrimSpace(entry.HostName), ".")
	port := entry.Port
	if port == 0 {
		port = 80
	}
	name := strings.TrimSpace(entry.Instance)
	if name == "" {
		name = host
	}
	address := host
	if len(entry.AddrIPv4) > 0 {
		address = entry.AddrIPv4[0].String()
	} else if len(entry.AddrIPv6) > 0 {
		address = entry.AddrIPv6[0].String()
	}
	return discoveredDevice{
		Name:    name,
		Host:    host,
		Address: address,
		Port:    port,
	}
}

func serviceTypesOrDefault(list []string) []string {
	if len(list) == 0 {
		return []string{"_wled._tcp", "_http._tcp"}
	}
	out := make([]string, 0, len(list))
	for _, s := range list {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return []string{"_wled._tcp", "_http._tcp"}
	}
	return out
}

func toDiscoveredDevice(entry *mdns.ServiceEntry) discoveredDevice {
	host := strings.TrimSuffix(entry.Host, ".")
	address := host
	switch {
	case entry.AddrV4 != nil:
		address = entry.AddrV4.String()
	case entry.AddrV6IPAddr != nil && entry.AddrV6IPAddr.IP != nil:
		address = entry.AddrV6IPAddr.IP.String()
	case entry.AddrV6 != nil:
		address = entry.AddrV6.String()
	}
	name := strings.TrimSuffix(entry.Name, ".")
	if name == "" {
		name = host
	}
	port := entry.Port
	if port == 0 {
		port = 80
	}
	return discoveredDevice{
		Name:    name,
		Host:    host,
		Address: address,
		Port:    port,
	}
}

func isWLEDCandidate(serviceType string, device discoveredDevice) bool {
	if serviceType == "_wled._tcp" {
		return true
	}
	haystack := strings.ToLower(device.Name + " " + device.Host + " " + device.Address)
	return strings.Contains(haystack, "wled")
}
