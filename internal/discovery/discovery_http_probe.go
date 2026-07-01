package discovery

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
)

const httpProbeConcurrency = 6

type wledProbeResponse struct {
	Info struct {
		Name string `json:"name"`
		Mac  string `json:"mac"`
		Ver  string `json:"ver"`
	} `json:"info"`
}

func httpProbeSubnet(ctx context.Context, iface *net.Interface, logger *log.Logger) []DiscoveredDevice {
	targets := IPv4ProbeTargets(iface)
	if len(targets) == 0 {
		return nil
	}

	client := httpClientForInterface(iface)
	sem := make(chan struct{}, httpProbeConcurrency)
	var wg sync.WaitGroup
	var mu sync.Mutex
	found := map[string]DiscoveredDevice{}
	matched := 0

	for _, ip := range targets {
		ip := ip
		wg.Add(1)
		go func() {
			defer wg.Done()
			select {
			case <-ctx.Done():
				return
			case sem <- struct{}{}:
			}
			defer func() { <-sem }()

			candidate, ok := probeWLEDAtIP(ctx, client, ip)
			mu.Lock()
			if ok {
				matched++
				key := ProbeDedupeKey(candidate.Host, candidate.Address, candidate.Port)
				found[key] = candidate
			}
			mu.Unlock()
		}()
	}
	wg.Wait()

	if logger != nil && matched > 0 {
		logger.Printf("discovery: http subnet probe found %d WLED device(s) on %q", matched, iface.Name)
	}

	out := make([]DiscoveredDevice, 0, len(found))
	for _, device := range found {
		out = append(out, device)
	}
	return out
}

func probeWLEDAtIP(ctx context.Context, client *http.Client, ip string) (DiscoveredDevice, bool) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+ip+"/json", nil)
	if err != nil {
		return DiscoveredDevice{}, false
	}
	resp, err := client.Do(req)
	if err != nil {
		return DiscoveredDevice{}, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		io.Copy(io.Discard, resp.Body)
		return DiscoveredDevice{}, false
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return DiscoveredDevice{}, false
	}
	var payload wledProbeResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return DiscoveredDevice{}, false
	}
	if strings.TrimSpace(payload.Info.Mac) == "" && strings.TrimSpace(payload.Info.Ver) == "" {
		return DiscoveredDevice{}, false
	}
	name := strings.TrimSpace(payload.Info.Name)
	if name == "" {
		name = ip
	}
	return DiscoveredDevice{
		Name:    name,
		Host:    ip,
		Address: ip,
		Port:    80,
	}, true
}
