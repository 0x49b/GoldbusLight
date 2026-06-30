package controller

import (
	"fmt"
	"strings"
	"time"

	"goldbus/internal/dmx"
)

const (
	DefaultDMXUniverseID = "universe-1"
	MaxDMXUniverses      = 4
)

// DMXUniverse is a logical DMX universe (up to 512 channels) managed by the app.
type DMXUniverse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// DMXUniverseInterfaceSettings holds per-universe output interface configuration (Settings → DMX).
type DMXUniverseInterfaceSettings struct {
	SelectedUSBDeviceID string         `json:"selectedUSBDeviceId"`
	ArtNet              ArtNetSettings `json:"artNet"`
}

func defaultDMXUniverseInterfaceSettings() DMXUniverseInterfaceSettings {
	def := DefaultControllerSettings()
	return DMXUniverseInterfaceSettings{
		SelectedUSBDeviceID: "",
		ArtNet:              def.DMX.ArtNet,
	}
}

func defaultDMXUniverses() []DMXUniverse {
	return []DMXUniverse{{ID: DefaultDMXUniverseID, Name: "Universe 1"}}
}

func normalizeDMXUniverses(universes []DMXUniverse) []DMXUniverse {
	if len(universes) == 0 {
		return defaultDMXUniverses()
	}
	out := make([]DMXUniverse, 0, len(universes))
	seen := make(map[string]struct{}, len(universes))
	for i, u := range universes {
		id := strings.TrimSpace(u.ID)
		if id == "" {
			id = fmt.Sprintf("universe-%d", i+1)
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		name := strings.TrimSpace(u.Name)
		if name == "" {
			name = fmt.Sprintf("Universe %d", len(out)+1)
		}
		out = append(out, DMXUniverse{ID: id, Name: name})
		if len(out) >= MaxDMXUniverses {
			break
		}
	}
	if len(out) == 0 {
		return defaultDMXUniverses()
	}
	return out
}

func universeIDs(universes []DMXUniverse) []string {
	ids := make([]string, 0, len(universes))
	for _, u := range universes {
		ids = append(ids, u.ID)
	}
	return ids
}

func findDMXUniverse(universes []DMXUniverse, id string) (DMXUniverse, bool) {
	id = strings.TrimSpace(id)
	for _, u := range universes {
		if u.ID == id {
			return u, true
		}
	}
	return DMXUniverse{}, false
}

func defaultUniverseIDForFixture(universes []DMXUniverse) string {
	norm := normalizeDMXUniverses(universes)
	if len(norm) == 0 {
		return DefaultDMXUniverseID
	}
	return norm[0].ID
}

func normalizeFixtureUniverseID(universeID string, universes []DMXUniverse) string {
	universeID = strings.TrimSpace(universeID)
	norm := normalizeDMXUniverses(universes)
	if universeID == "" {
		return defaultUniverseIDForFixture(norm)
	}
	for _, u := range norm {
		if u.ID == universeID {
			return universeID
		}
	}
	return defaultUniverseIDForFixture(norm)
}

func countFixturesOnUniverse(fixtures []DMXFixture, universes []DMXUniverse, universeID string) int {
	count := 0
	for _, fx := range fixtures {
		if normalizeFixtureUniverseID(fx.UniverseID, universes) == universeID {
			count++
		}
	}
	return count
}

func normalizeDMXUniverseInterfaces(
	interfaces map[string]DMXUniverseInterfaceSettings,
	universes []DMXUniverse,
	legacyUSB string,
	legacyArtNet ArtNetSettings,
) map[string]DMXUniverseInterfaceSettings {
	out := make(map[string]DMXUniverseInterfaceSettings, len(universes))
	for _, u := range universes {
		if existing, ok := interfaces[u.ID]; ok {
			cp := existing
			cp.ArtNet = clampArtNetSettingsPtr(&cp.ArtNet)
			out[u.ID] = cp
			continue
		}
		def := defaultDMXUniverseInterfaceSettings()
		if u.ID == DefaultDMXUniverseID {
			def.SelectedUSBDeviceID = strings.TrimSpace(legacyUSB)
			if legacyArtNet.Enabled || strings.TrimSpace(legacyArtNet.TargetHost) != "" {
				def.ArtNet = legacyArtNet
			}
		}
		out[u.ID] = def
	}
	return out
}

func clampArtNetSettingsPtr(s *ArtNetSettings) ArtNetSettings {
	if s == nil {
		def := DefaultControllerSettings().DMX.ArtNet
		return def
	}
	cp := *s
	clampArtNetSettings(&cp)
	return cp
}

// CreateDMXUniverse adds a new universe (up to MaxDMXUniverses).
func (c *WLEDController) CreateDMXUniverse(name string) (DMXUniverse, error) {
	if !c.dmxEnabled() {
		return DMXUniverse{}, fmt.Errorf("dmx component is disabled in settings")
	}
	name = strings.TrimSpace(name)

	c.mu.Lock()
	defer c.mu.Unlock()

	c.dmxState.Universes = normalizeDMXUniverses(c.dmxState.Universes)
	if len(c.dmxState.Universes) >= MaxDMXUniverses {
		return DMXUniverse{}, fmt.Errorf("maximum of %d universes reached", MaxDMXUniverses)
	}

	nextIndex := len(c.dmxState.Universes) + 1
	id := fmt.Sprintf("universe-%d", time.Now().UnixNano())
	if name == "" {
		name = fmt.Sprintf("Universe %d", nextIndex)
	}
	created := DMXUniverse{ID: id, Name: name}
	c.dmxState.Universes = append(c.dmxState.Universes, created)

	// Ensure interface settings entry exists for the new universe.
	if c.settings.DMX.UniverseInterfaces == nil {
		c.settings.DMX.UniverseInterfaces = map[string]DMXUniverseInterfaceSettings{}
	}
	c.settings.DMX.UniverseInterfaces[id] = defaultDMXUniverseInterfaceSettings()

	c.dmxState = normalizeDMXState(c.dmxState)
	c.dmxPersistEnabled = true
	c.updated = time.Now()

	if err := c.persistDMX(); err != nil {
		return DMXUniverse{}, err
	}
	if err := c.persist(); err != nil {
		return DMXUniverse{}, err
	}
	return created, nil
}

// DeleteDMXUniverse removes a universe when DMX is not live and it has no fixtures.
func (c *WLEDController) DeleteDMXUniverse(universeID string) error {
	if !c.dmxEnabled() {
		return fmt.Errorf("dmx component is disabled in settings")
	}
	universeID = strings.TrimSpace(universeID)
	if universeID == "" {
		return fmt.Errorf("universe id is required")
	}

	c.dmxLiveMu.Lock()
	live := c.dmxLiveRunning
	c.dmxLiveMu.Unlock()
	if live {
		return fmt.Errorf("cannot delete universe while DMX live output is running")
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	c.dmxState.Universes = normalizeDMXUniverses(c.dmxState.Universes)
	if len(c.dmxState.Universes) <= 1 {
		return fmt.Errorf("cannot delete the last universe")
	}
	if _, ok := findDMXUniverse(c.dmxState.Universes, universeID); !ok {
		return fmt.Errorf("unknown universe: %s", universeID)
	}
	if countFixturesOnUniverse(c.dmxState.Fixtures, c.dmxState.Universes, universeID) > 0 {
		return fmt.Errorf("cannot delete universe with fixtures; move or delete fixtures first")
	}

	next := make([]DMXUniverse, 0, len(c.dmxState.Universes)-1)
	for _, u := range c.dmxState.Universes {
		if u.ID != universeID {
			next = append(next, u)
		}
	}
	c.dmxState.Universes = next
	delete(c.settings.DMX.UniverseInterfaces, universeID)

	c.dmxState = normalizeDMXState(c.dmxState)
	c.dmxPersistEnabled = true
	c.updated = time.Now()

	if err := c.persistDMX(); err != nil {
		return err
	}
	return c.persist()
}

// SetDMXUniverseUSBDevice sets the USB device for a specific universe interface.
func (c *WLEDController) SetDMXUniverseUSBDevice(universeID, deviceID string) error {
	if !c.dmxEnabled() {
		return fmt.Errorf("dmx component is disabled in settings")
	}
	universeID = strings.TrimSpace(universeID)
	deviceID = strings.TrimSpace(deviceID)
	if universeID == "" {
		return fmt.Errorf("universe id is required")
	}
	if deviceID != "" {
		dev, ok := dmx.PickUSBSerialDevice(deviceID, c.listUSBSerialDevicesWithSimulators())
		if !ok {
			return fmt.Errorf("selected usb serial device is not currently attached: %s", deviceID)
		}
		deviceID = dev.ID
	}

	c.mu.Lock()
	c.dmxState.Universes = normalizeDMXUniverses(c.dmxState.Universes)
	if _, ok := findDMXUniverse(c.dmxState.Universes, universeID); !ok {
		c.mu.Unlock()
		return fmt.Errorf("unknown universe: %s", universeID)
	}
	if c.settings.DMX.UniverseInterfaces == nil {
		c.settings.DMX.UniverseInterfaces = map[string]DMXUniverseInterfaceSettings{}
	}
	iface := c.settings.DMX.UniverseInterfaces[universeID]
	iface.SelectedUSBDeviceID = deviceID
	c.settings.DMX.UniverseInterfaces[universeID] = iface
	// Keep legacy field in sync for universe 1.
	if universeID == DefaultDMXUniverseID {
		c.dmxState.SelectedUSBDeviceID = deviceID
	}
	c.updated = time.Now()
	c.mu.Unlock()

	if err := c.persist(); err != nil {
		return err
	}
	if universeID == DefaultDMXUniverseID {
		if err := c.persistDMX(); err != nil {
			return err
		}
	}
	return c.reconcileDMXLiveAdapters()
}

func (c *WLEDController) universeInterfaceSettings(universeID string) DMXUniverseInterfaceSettings {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.universeInterfaceSettingsLocked(universeID)
}

func (c *WLEDController) universeInterfaceSettingsLocked(universeID string) DMXUniverseInterfaceSettings {
	if c.settings.DMX.UniverseInterfaces != nil {
		if iface, ok := c.settings.DMX.UniverseInterfaces[universeID]; ok {
			return iface
		}
	}
	def := defaultDMXUniverseInterfaceSettings()
	if universeID == DefaultDMXUniverseID {
		def.SelectedUSBDeviceID = strings.TrimSpace(c.dmxState.SelectedUSBDeviceID)
		def.ArtNet = c.settings.DMX.ArtNet
	}
	return def
}
