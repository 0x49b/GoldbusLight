package discovery

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

type AccessPointSettings struct {
	Enabled       bool
	InterfaceName string
}

type Settings struct {
	Enabled        bool
	ServiceTypes   []string
	QueryTimeoutMS int
	BindInterface  string
	PassiveBrowse  bool
	SubnetProbe    bool
}

type ControllerSettings struct {
	Discovery   Settings
	AccessPoint AccessPointSettings
}

type DiscoveredDevice struct {
	Name    string
	Host    string
	Address string
	Port    int
}

// DiscoveryRunParams configures one synchronous discovery pass (mDNS queries).
type DiscoveryRunParams struct {
	Settings  Settings
	BindIface *net.Interface
	Logger    *log.Logger
}

func DiscoverOnce(ctx context.Context, params DiscoveryRunParams) ([]DiscoveredDevice, error) {
	settings := params.Settings
	serviceTypes := settings.ServiceTypes
	if len(serviceTypes) == 0 {
		serviceTypes = []string{"_wled._tcp", "_http._tcp"}
	}

	timeout := time.Duration(settings.QueryTimeoutMS) * time.Millisecond
	if timeout <= 0 {
		timeout = 2 * time.Second
	}

	known := map[string]DiscoveredDevice{}
	var knownMu sync.Mutex
	addCandidate := func(serviceType string, candidate DiscoveredDevice) {
		if !IsWLEDCandidate(serviceType, candidate) {
			return
		}
		key := ProbeDedupeKey(candidate.Host, candidate.Address, candidate.Port)
		knownMu.Lock()
		known[key] = candidate
		knownMu.Unlock()
	}

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for _, candidate := range platformDiscoverOnce(ctx, serviceTypes, timeout, params.Logger) {
			addCandidate("_wled._tcp", candidate)
		}
		for _, candidate := range zeroconfDiscoverOnce(ctx, params.BindIface, serviceTypes, timeout, params.Logger) {
			addCandidate("_wled._tcp", candidate)
		}
		knownMu.Lock()
		empty := len(known) == 0
		knownMu.Unlock()
		if empty {
			hashicorpDiscoverOnce(ctx, params, serviceTypes, timeout, addCandidate)
		}
	}()

	if params.BindIface != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for _, candidate := range httpProbeSubnet(ctx, params.BindIface, params.Logger) {
				addCandidate("_wled._tcp", candidate)
			}
		}()
	}
	wg.Wait()

	found := make([]DiscoveredDevice, 0, len(known))
	for _, device := range known {
		found = append(found, device)
	}
	slices.SortFunc(found, func(a, b DiscoveredDevice) int {
		return strings.Compare(a.Address, b.Address)
	})
	return found, nil
}

func hashicorpDiscoverOnce(
	ctx context.Context,
	params DiscoveryRunParams,
	serviceTypes []string,
	timeout time.Duration,
	addCandidate func(string, DiscoveredDevice),
) {
	for _, serviceType := range serviceTypes {
		serviceType := serviceType
		entries := make(chan *mdns.ServiceEntry, 64)
		var wg sync.WaitGroup

		wg.Add(1)
		go func() {
			defer wg.Done()
			for entry := range entries {
				candidate := toDiscoveredDevice(entry)
				if !IsWLEDCandidate(serviceType, candidate) {
					continue
				}
				addCandidate(serviceType, candidate)
			}
		}()

		queryCtx, cancel := context.WithTimeout(ctx, timeout+500*time.Millisecond)
		q := &mdns.QueryParam{
			Service:             serviceType,
			Domain:              "local",
			Timeout:             timeout,
			Entries:             entries,
			Interface:           params.BindIface,
			WantUnicastResponse: false,
		}
		err := mdns.QueryContext(queryCtx, q)
		cancel()
		close(entries)
		wg.Wait()
		if err != nil && params.Logger != nil {
			params.Logger.Printf("mdns query failed for %s: %v", serviceType, err)
		}
	}
}

func ProbeDedupeKey(host, address string, port int) string {
	h := strings.TrimSpace(strings.ToLower(host))
	a := strings.TrimSpace(address)
	if ip := net.ParseIP(a); ip != nil {
		a = ip.String()
	}
	return net.JoinHostPort(a, fmt.Sprintf("%d", port)) + "|" + h
}

func DiscoveryBrowseSignature(settings ControllerSettings) string {
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

func ZeroconfClientOptions(iface *net.Interface) []zeroconf.ClientOption {
	opts := []zeroconf.ClientOption{zeroconf.SelectIPTraffic(zeroconf.IPv4)}
	if iface != nil {
		opts = append(opts, zeroconf.SelectIfaces([]net.Interface{*iface}))
	}
	return opts
}

func DiscoveredFromZeroconf(entry *zeroconf.ServiceEntry) DiscoveredDevice {
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
	return DiscoveredDevice{
		Name:    name,
		Host:    host,
		Address: address,
		Port:    port,
	}
}

func ServiceTypesOrDefault(list []string) []string {
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

func toDiscoveredDevice(entry *mdns.ServiceEntry) DiscoveredDevice {
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
	return DiscoveredDevice{
		Name:    name,
		Host:    host,
		Address: address,
		Port:    port,
	}
}

func IsWLEDCandidate(serviceType string, device DiscoveredDevice) bool {
	if serviceType == "_wled._tcp" {
		return true
	}
	haystack := strings.ToLower(device.Name + " " + device.Host + " " + device.Address)
	return strings.Contains(haystack, "wled")
}
