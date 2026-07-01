//go:build darwin

package discovery

import (
	"bufio"
	"context"
	"log"
	"net"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var dnssdReachableRE = regexp.MustCompile(`can be reached at ([^:]+):(\d+)`)

func platformDiscoverOnce(ctx context.Context, serviceTypes []string, timeout time.Duration, logger *log.Logger) []DiscoveredDevice {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	browseTimeout := timeout
	if browseTimeout < 3*time.Second {
		browseTimeout = 3 * time.Second
	}

	known := map[string]DiscoveredDevice{}
	for _, serviceType := range serviceTypes {
		serviceType := strings.TrimSpace(serviceType)
		if serviceType == "" {
			continue
		}
		if serviceType != "_wled._tcp" {
			continue
		}
		for _, dev := range browseDNSSD(ctx, serviceType, browseTimeout, logger) {
			if !IsWLEDCandidate(serviceType, dev) {
				continue
			}
			key := ProbeDedupeKey(dev.Host, dev.Address, dev.Port)
			known[key] = dev
		}
	}

	out := make([]DiscoveredDevice, 0, len(known))
	for _, dev := range known {
		out = append(out, dev)
	}
	return out
}

func browseDNSSD(ctx context.Context, serviceType string, timeout time.Duration, logger *log.Logger) []DiscoveredDevice {
	browseCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(browseCtx, "dns-sd", "-B", serviceType, "local")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		if logger != nil {
			logger.Printf("discovery: dns-sd browse %s: %v", serviceType, err)
		}
		return nil
	}
	if err := cmd.Start(); err != nil {
		return nil
	}

	instances := make([]string, 0, 4)
	seen := map[string]struct{}{}
	var mu sync.Mutex
	foundCh := make(chan struct{}, 1)
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.Contains(line, "Add") || !strings.Contains(line, serviceType) {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) == 0 {
				continue
			}
			inst := strings.TrimSpace(fields[len(fields)-1])
			if inst == "" || inst == "Name" {
				continue
			}
			mu.Lock()
			if _, ok := seen[inst]; ok {
				mu.Unlock()
				continue
			}
			seen[inst] = struct{}{}
			instances = append(instances, inst)
			mu.Unlock()
			select {
			case foundCh <- struct{}{}:
			default:
			}
		}
	}()

	select {
	case <-foundCh:
		select {
		case <-time.After(400 * time.Millisecond):
		case <-browseCtx.Done():
		}
	case <-readDone:
	case <-browseCtx.Done():
	}

	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
	_ = cmd.Wait()
	<-readDone

	devices := make([]DiscoveredDevice, 0, len(instances))
	for _, inst := range instances {
		dev, ok := resolveDNSSDInstance(ctx, inst, serviceType)
		if !ok {
			continue
		}
		devices = append(devices, dev)
	}
	return devices
}

func resolveDNSSDInstance(parentCtx context.Context, instance, serviceType string) (DiscoveredDevice, bool) {
	resolveCtx, cancel := context.WithTimeout(parentCtx, 3*time.Second)
	defer cancel()

	cmd := exec.CommandContext(resolveCtx, "dns-sd", "-L", instance, serviceType, "local")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return DiscoveredDevice{}, false
	}
	if err := cmd.Start(); err != nil {
		return DiscoveredDevice{}, false
	}

	var out strings.Builder
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			out.WriteString(line)
			out.WriteByte('\n')
			if strings.Contains(line, "can be reached at") {
				return
			}
		}
	}()

	select {
	case <-readDone:
	case <-resolveCtx.Done():
	}
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
	_ = cmd.Wait()
	<-readDone

	output := out.String()
	if output == "" {
		return DiscoveredDevice{}, false
	}

	m := dnssdReachableRE.FindStringSubmatch(output)
	if len(m) != 3 {
		return DiscoveredDevice{}, false
	}
	host := strings.TrimSuffix(strings.TrimSpace(m[1]), ".")
	port, err := strconv.Atoi(m[2])
	if err != nil || port <= 0 {
		port = 80
	}

	address := host
	if ip := lookupDNSSDIPv4(parentCtx, host); ip != "" {
		address = ip
	} else if parsed := net.ParseIP(host); parsed != nil {
		address = parsed.String()
	}

	name := strings.TrimSpace(instance)
	if name == "" {
		name = host
	}
	return DiscoveredDevice{
		Name:    name,
		Host:    host,
		Address: address,
		Port:    port,
	}, true
}

func lookupDNSSDIPv4(parentCtx context.Context, host string) string {
	if host == "" {
		return ""
	}
	queryHost := strings.TrimSuffix(host, ".")
	if !strings.HasSuffix(strings.ToLower(queryHost), ".local") {
		queryHost += ".local"
	}
	ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "dns-sd", "-G", "v4", queryHost)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return ""
	}
	if err := cmd.Start(); err != nil {
		return ""
	}
	var ip string
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "Timestamp") || !strings.Contains(line, "Add") {
				continue
			}
			fields := strings.Fields(line)
			for i := len(fields) - 1; i >= 0; i-- {
				if parsed := net.ParseIP(fields[i]); parsed != nil && parsed.To4() != nil {
					ip = parsed.String()
					return
				}
			}
		}
	}()
	select {
	case <-readDone:
	case <-ctx.Done():
	}
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
	_ = cmd.Wait()
	<-readDone
	return ip
}
