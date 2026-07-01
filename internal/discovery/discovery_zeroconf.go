package discovery

import (
	"context"
	"log"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/grandcat/zeroconf"
)

func zeroconfDiscoverOnce(
	ctx context.Context,
	iface *net.Interface,
	serviceTypes []string,
	timeout time.Duration,
	logger *log.Logger,
) []DiscoveredDevice {
	opts := []zeroconf.ClientOption{zeroconf.SelectIPTraffic(zeroconf.IPv4)}
	if iface != nil {
		opts = append(opts, zeroconf.SelectIfaces([]net.Interface{*iface}))
	}
	resolver, err := zeroconf.NewResolver(opts...)
	if err != nil {
		if logger != nil {
			logger.Printf("zeroconf resolver: %v", err)
		}
		return nil
	}

	queryCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	known := map[string]DiscoveredDevice{}
	var mu sync.Mutex
	var readWG sync.WaitGroup

	for _, serviceType := range serviceTypes {
		serviceType := serviceType
		entries := make(chan *zeroconf.ServiceEntry, 64)
		readWG.Add(1)
		go func() {
			defer readWG.Done()
			for ent := range entries {
				if ent == nil {
					continue
				}
				candidate := DiscoveredFromZeroconf(ent)
				inferredType := inferZeroconfServiceType(ent, serviceTypes)
				if !IsWLEDCandidate(inferredType, candidate) {
					continue
				}
				key := ProbeDedupeKey(candidate.Host, candidate.Address, candidate.Port)
				mu.Lock()
				known[key] = candidate
				mu.Unlock()
			}
		}()
		go func() {
			if err := resolver.Browse(queryCtx, serviceType, "local.", entries); err != nil && logger != nil {
				logger.Printf("zeroconf browse %s: %v", serviceType, err)
			}
		}()
	}

	<-queryCtx.Done()
	readWG.Wait()

	found := make([]DiscoveredDevice, 0, len(known))
	for _, device := range known {
		found = append(found, device)
	}
	return found
}

func inferZeroconfServiceType(ent *zeroconf.ServiceEntry, serviceTypes []string) string {
	service := strings.TrimSuffix(strings.TrimSpace(ent.Service), ".")
	for _, svc := range serviceTypes {
		if service == svc {
			return svc
		}
	}
	if strings.Contains(strings.ToLower(service), "wled") {
		return "_wled._tcp"
	}
	return "_http._tcp"
}
