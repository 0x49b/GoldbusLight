package controller

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"goldbus/internal/dmx"
)

const DefaultDMXUniverseID = "universe-1"

// DMXUniverse is the single logical DMX universe (512 channels) managed by the app.
type DMXUniverse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// DMXUniverseInterfaceSettings holds output interface configuration (Settings → DMX).
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

// normalizeDMXUniverses collapses any saved multi-universe list to the single fixed universe.
func normalizeDMXUniverses(universes []DMXUniverse) []DMXUniverse {
	_ = universes
	return defaultDMXUniverses()
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
	_ = universes
	return DefaultDMXUniverseID
}

// normalizeFixtureUniverseID always maps fixtures onto the single fixed universe.
func normalizeFixtureUniverseID(universeID string, universes []DMXUniverse) string {
	_ = universeID
	_ = universes
	return DefaultDMXUniverseID
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

func dmxUniverseInterfaceConfigured(iface DMXUniverseInterfaceSettings) bool {
	if strings.TrimSpace(iface.SelectedUSBDeviceID) != "" {
		return true
	}
	return iface.ArtNet.Enabled
}

func mergeDMXUniverseInterface(base, fallback DMXUniverseInterfaceSettings) DMXUniverseInterfaceSettings {
	out := base
	out.SelectedUSBDeviceID = strings.TrimSpace(out.SelectedUSBDeviceID)
	out.ArtNet = clampArtNetSettingsPtr(&out.ArtNet)
	if out.SelectedUSBDeviceID == "" {
		out.SelectedUSBDeviceID = strings.TrimSpace(fallback.SelectedUSBDeviceID)
	}
	if !out.ArtNet.Enabled {
		fb := clampArtNetSettingsPtr(&fallback.ArtNet)
		if fb.Enabled || (strings.TrimSpace(out.ArtNet.TargetHost) == "" && strings.TrimSpace(fb.TargetHost) != "") {
			out.ArtNet = fb
		}
	}
	return out
}

// normalizeDMXUniverseInterfaces keeps only universe-1, migrating USB/Art-Net from
// legacy fields or any previously saved per-universe entry.
//
// Important: an empty universe-1 entry must not win over a configured interface that
// lived on another universe id before the single-universe collapse.
func normalizeDMXUniverseInterfaces(
	interfaces map[string]DMXUniverseInterfaceSettings,
	universes []DMXUniverse,
	legacyUSB string,
	legacyArtNet ArtNetSettings,
) map[string]DMXUniverseInterfaceSettings {
	_ = universes
	legacy := defaultDMXUniverseInterfaceSettings()
	legacy.SelectedUSBDeviceID = strings.TrimSpace(legacyUSB)
	if legacyArtNet.Enabled || strings.TrimSpace(legacyArtNet.TargetHost) != "" {
		legacy.ArtNet = clampArtNetSettingsPtr(&legacyArtNet)
	}

	var chosen DMXUniverseInterfaceSettings
	found := false

	if existing, ok := interfaces[DefaultDMXUniverseID]; ok && dmxUniverseInterfaceConfigured(existing) {
		chosen = existing
		found = true
	} else if len(interfaces) > 0 {
		keys := make([]string, 0, len(interfaces))
		for id := range interfaces {
			if id == DefaultDMXUniverseID {
				continue
			}
			keys = append(keys, id)
		}
		slices.Sort(keys)
		for _, id := range keys {
			if dmxUniverseInterfaceConfigured(interfaces[id]) {
				chosen = interfaces[id]
				found = true
				break
			}
		}
		if !found {
			if existing, ok := interfaces[DefaultDMXUniverseID]; ok {
				chosen = existing
				found = true
			} else if len(keys) > 0 {
				chosen = interfaces[keys[0]]
				found = true
			}
		}
	}

	if !found {
		chosen = legacy
	} else {
		chosen = mergeDMXUniverseInterface(chosen, legacy)
	}

	return map[string]DMXUniverseInterfaceSettings{DefaultDMXUniverseID: chosen}
}

// clampDMXUniverseInterfaces sanitizes interface entries and collapses to universe-1.
func clampDMXUniverseInterfaces(interfaces map[string]DMXUniverseInterfaceSettings) map[string]DMXUniverseInterfaceSettings {
	return normalizeDMXUniverseInterfaces(interfaces, nil, "", DefaultControllerSettings().DMX.ArtNet)
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

// SetDMXUniverseUSBDevice sets the USB device for the single universe interface.
func (c *WLEDController) SetDMXUniverseUSBDevice(universeID, deviceID string) error {
	if !c.dmxEnabled() {
		return fmt.Errorf("dmx component is disabled in settings")
	}
	_ = universeID
	universeID = DefaultDMXUniverseID
	deviceID = strings.TrimSpace(deviceID)
	if deviceID != "" {
		dev, ok := dmx.PickUSBSerialDevice(deviceID, c.listUSBSerialDevicesWithSimulators())
		if !ok {
			return fmt.Errorf("selected usb serial device is not currently attached: %s", deviceID)
		}
		deviceID = dev.ID
	}

	c.mu.Lock()
	c.dmxState.Universes = normalizeDMXUniverses(c.dmxState.Universes)
	if c.settings.DMX.UniverseInterfaces == nil {
		c.settings.DMX.UniverseInterfaces = map[string]DMXUniverseInterfaceSettings{}
	}
	iface := c.settings.DMX.UniverseInterfaces[universeID]
	iface.SelectedUSBDeviceID = deviceID
	c.settings.DMX.UniverseInterfaces[universeID] = iface
	c.dmxState.SelectedUSBDeviceID = deviceID
	c.updated = time.Now()
	c.mu.Unlock()

	if err := c.persist(); err != nil {
		return err
	}
	if err := c.persistDMX(); err != nil {
		return err
	}
	return c.reconcileDMXLiveAdapters()
}

func (c *WLEDController) universeInterfaceSettings(universeID string) DMXUniverseInterfaceSettings {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.universeInterfaceSettingsLocked(universeID)
}

func (c *WLEDController) universeInterfaceSettingsLocked(universeID string) DMXUniverseInterfaceSettings {
	universeID = DefaultDMXUniverseID
	if c.settings.DMX.UniverseInterfaces != nil {
		if iface, ok := c.settings.DMX.UniverseInterfaces[universeID]; ok {
			return iface
		}
	}
	def := defaultDMXUniverseInterfaceSettings()
	def.SelectedUSBDeviceID = strings.TrimSpace(c.dmxState.SelectedUSBDeviceID)
	def.ArtNet = c.settings.DMX.ArtNet
	return def
}
