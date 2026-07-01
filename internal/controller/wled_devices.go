package controller

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"

	wledpkg "goldbus/internal/wled"
)

// AddWLEDDeviceInput is the payload for manually registering a WLED device by IP.
type AddWLEDDeviceInput struct {
	Address string `json:"address"`
	Port    int    `json:"port"`
}

type deviceCandidate struct {
	Name    string
	Host    string
	Address string
	Port    int
}

func parseWLEDDeviceAddress(raw string, port int) (address string, resolvedPort int, err error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", 0, fmt.Errorf("address is required")
	}
	raw = strings.TrimPrefix(strings.TrimPrefix(raw, "http://"), "https://")
	raw = strings.TrimSuffix(raw, "/")
	if host, p, splitErr := net.SplitHostPort(raw); splitErr == nil {
		raw = host
		if port <= 0 {
			if parsedPort, parseErr := net.LookupPort("tcp", p); parseErr == nil {
				port = parsedPort
			}
		}
	}
	if port <= 0 {
		port = 80
	}
	ip := net.ParseIP(raw)
	if ip == nil || ip.To4() == nil {
		return "", 0, fmt.Errorf("enter a valid IPv4 address")
	}
	return ip.To4().String(), port, nil
}

func deviceEndpointKey(address string, port int) string {
	return net.JoinHostPort(strings.TrimSpace(address), fmt.Sprintf("%d", port))
}

func (c *WLEDController) findDeviceByEndpoint(address string, port int) (WLEDDevice, bool) {
	key := deviceEndpointKey(address, port)
	for _, d := range c.devices {
		if deviceEndpointKey(d.Address, d.Port) == key {
			return d, true
		}
	}
	return WLEDDevice{}, false
}

// AddWLEDDevice health-checks the given IP via GET /json, registers the device, and persists it.
func (c *WLEDController) AddWLEDDevice(ctx context.Context, input AddWLEDDeviceInput) (WLEDDevice, error) {
	if !c.wledEnabled() {
		return WLEDDevice{}, fmt.Errorf("wled component is disabled in settings")
	}
	address, port, err := parseWLEDDeviceAddress(input.Address, input.Port)
	if err != nil {
		return WLEDDevice{}, err
	}

	c.mu.RLock()
	if existing, ok := c.findDeviceByEndpoint(address, port); ok {
		c.mu.RUnlock()
		if existing.Ignored {
			return WLEDDevice{}, fmt.Errorf("device at %s is ignored; restore it from Settings first", deviceEndpointKey(address, port))
		}
		return WLEDDevice{}, fmt.Errorf("device already exists at %s", deviceEndpointKey(address, port))
	}
	c.mu.RUnlock()

	candidate := deviceCandidate{
		Address: address,
		Port:    port,
	}
	device, err := c.registerDeviceFromCandidate(ctx, candidate)
	if err != nil {
		return WLEDDevice{}, err
	}
	if err := c.persist(); err != nil {
		c.logger.Printf("persist after add device failed: %v", err)
	}
	return device, nil
}

func (c *WLEDController) registerDeviceFromCandidate(ctx context.Context, candidate deviceCandidate) (WLEDDevice, error) {
	if !c.wledEnabled() {
		return WLEDDevice{}, fmt.Errorf("wled component is disabled in settings")
	}
	engineDev := wledpkg.Device{
		Host:    candidate.Host,
		Address: candidate.Address,
		Port:    candidate.Port,
	}
	res, err := c.wled.Inspect(ctx, engineDev)
	if err != nil {
		return WLEDDevice{}, fmt.Errorf("health check failed: %w", err)
	}

	device := WLEDDevice{
		ID:          res.ID,
		Name:        res.Name,
		Host:        candidate.Host,
		Address:     candidate.Address,
		Port:        candidate.Port,
		LastSeen:    c.now(),
		Online:      true,
		Provisioned: false,
		Info:        res.Info,
		LastState:   cloneJSONMap(res.State),
	}

	c.mu.RLock()
	if existing, ok := c.devices[device.ID]; ok && existing.Ignored {
		c.mu.RUnlock()
		return WLEDDevice{}, fmt.Errorf("device is ignored: %s", device.ID)
	}
	c.mu.RUnlock()

	c.mu.Lock()
	existing, hasExisting := c.devices[device.ID]
	restoreState := cloneJSONMap(nil)
	if hasExisting {
		if existing.Provisioned {
			device.Provisioned = true
		}
		if len(existing.LastState) > 0 {
			device.LastState = cloneJSONMap(existing.LastState)
			restoreState = cloneJSONMap(existing.LastState)
		}
	}
	c.devices[device.ID] = device
	settings := c.settings.WLED.Provisioning
	c.updated = c.now()
	c.mu.Unlock()

	if len(restoreState) > 0 {
		if err := c.applyWLEDState(ctx, device, restoreState); err != nil {
			c.logger.Printf("restore last state to %s failed: %v", device.ID, err)
		} else {
			c.mu.Lock()
			if latest, ok := c.devices[device.ID]; ok {
				latest.Online = true
				latest.LastSeen = c.now()
				if latest.Info == nil {
					latest.Info = map[string]any{}
				}
				if v, ok := restoreState["on"]; ok {
					latest.Info["on"] = v
				}
				if v, ok := restoreState["bri"]; ok {
					latest.Info["bri"] = v
				}
				c.devices[device.ID] = latest
				device = latest
				c.updated = c.now()
			}
			c.mu.Unlock()
		}
	}

	if settings.AutoProvision && !device.Provisioned {
		if err := c.provisionWLED(ctx, device, settings.DefaultConfigPatch, settings.DefaultStatePayload); err == nil {
			c.mu.Lock()
			device.Provisioned = true
			c.devices[device.ID] = device
			c.updated = c.now()
			c.mu.Unlock()
		}
	}

	return device, nil
}

func (c *WLEDController) now() time.Time {
	return time.Now()
}
