package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"goldbus/internal/dmx"
)

const lightingSceneExportVersion = 1

// PortableLightingSceneBundle is the shareable single-scene export format.
type PortableLightingSceneBundle struct {
	Version    int                       `json:"version"`
	ExportedAt time.Time                 `json:"exportedAt"`
	Scene      PortableLightingSceneData `json:"scene"`
}

type PortableLightingSceneData struct {
	Name string                     `json:"name"`
	WLED []PortableSceneWLEDEntry   `json:"wled"`
	DMX  []PortableSceneDMXEntry    `json:"dmx"`
}

type PortableSceneWLEDEntry struct {
	DeviceID   string         `json:"deviceId,omitempty"`
	DeviceName string         `json:"deviceName"`
	Host       string         `json:"host,omitempty"`
	Address    string         `json:"address,omitempty"`
	PresetName string         `json:"presetName"`
	State      map[string]any `json:"state"`
}

type PortableSceneDMXEntry struct {
	FixtureID    string             `json:"fixtureId,omitempty"`
	FixtureBrand string             `json:"fixtureBrand"`
	FixtureName  string             `json:"fixtureName"`
	CueLabel     string             `json:"cueLabel"`
	Values       map[string]int     `json:"values"`
}

func cloneLightingScenes(in []LightingScene) []LightingScene {
	if len(in) == 0 {
		return nil
	}
	out := make([]LightingScene, len(in))
	for i, s := range in {
		out[i] = LightingScene{
			ID:                 s.ID,
			Name:               s.Name,
			WLED:               append([]SceneWLEDEntry(nil), s.WLED...),
			DMX:                append([]SceneDMXEntry(nil), s.DMX...),
			PartyWLEDDeviceIDs: append([]string(nil), s.PartyWLEDDeviceIDs...),
			PartyFixtureIDs:    append([]string(nil), s.PartyFixtureIDs...),
			CreatedAt:          s.CreatedAt,
			UpdatedAt:          s.UpdatedAt,
		}
	}
	return out
}

func normalizeLightingScenes(in []LightingScene) []LightingScene {
	if len(in) == 0 {
		return nil
	}
	out := make([]LightingScene, 0, len(in))
	for _, s := range in {
		s.ID = strings.TrimSpace(s.ID)
		s.Name = strings.TrimSpace(s.Name)
		if s.ID == "" || s.Name == "" {
			continue
		}
		s.WLED = normalizeSceneWLEDEntries(s.WLED)
		s.DMX = normalizeSceneDMXEntries(s.DMX)
		s.PartyWLEDDeviceIDs = normalizeScenePartyDeviceIDs(s.PartyWLEDDeviceIDs)
		s.PartyFixtureIDs = normalizeScenePartyFixtureIDs(s.PartyFixtureIDs)
		out = append(out, s)
	}
	return out
}

func normalizeSceneWLEDEntries(in []SceneWLEDEntry) []SceneWLEDEntry {
	wled := make([]SceneWLEDEntry, 0, len(in))
	for _, e := range in {
		e.DeviceID = strings.TrimSpace(e.DeviceID)
		e.PresetID = strings.TrimSpace(e.PresetID)
		if e.DeviceID == "" || e.PresetID == "" {
			continue
		}
		wled = append(wled, e)
	}
	return wled
}

func normalizeSceneDMXEntries(in []SceneDMXEntry) []SceneDMXEntry {
	dmxEntries := make([]SceneDMXEntry, 0, len(in))
	for _, e := range in {
		e.FixtureID = strings.TrimSpace(e.FixtureID)
		e.CueID = strings.TrimSpace(e.CueID)
		if e.FixtureID == "" || e.CueID == "" {
			continue
		}
		dmxEntries = append(dmxEntries, e)
	}
	return dmxEntries
}

func normalizeScenePartyDeviceIDs(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, id := range in {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func normalizeScenePartyFixtureIDs(in []string) []string {
	return normalizeScenePartyDeviceIDs(in)
}

func normalizeUpsertLightingScene(input UpsertLightingSceneInput) (LightingScene, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return LightingScene{}, fmt.Errorf("scene name is required")
	}
	return LightingScene{
		ID:                 strings.TrimSpace(input.ID),
		Name:               name,
		WLED:               normalizeSceneWLEDEntries(input.WLED),
		DMX:                normalizeSceneDMXEntries(input.DMX),
		PartyWLEDDeviceIDs: normalizeScenePartyDeviceIDs(input.PartyWLEDDeviceIDs),
		PartyFixtureIDs:    normalizeScenePartyFixtureIDs(input.PartyFixtureIDs),
	}, nil
}

func (c *WLEDController) findSceneLocked(id string) (int, LightingScene, bool) {
	id = strings.TrimSpace(id)
	for i, s := range c.scenes {
		if s.ID == id {
			return i, s, true
		}
	}
	return -1, LightingScene{}, false
}

// CreateLightingScene adds a new named scene.
func (c *WLEDController) CreateLightingScene(input UpsertLightingSceneInput) (LightingScene, error) {
	scene, err := normalizeUpsertLightingScene(input)
	if err != nil {
		return LightingScene{}, err
	}
	if err := c.validateSceneReferences(scene); err != nil {
		return LightingScene{}, err
	}
	now := time.Now().UTC()
	scene.ID = fmt.Sprintf("scene-%d", now.UnixNano())
	scene.CreatedAt = now
	scene.UpdatedAt = now

	c.mu.Lock()
	c.scenes = append(cloneLightingScenes(c.scenes), scene)
	c.updated = time.Now()
	c.mu.Unlock()

	if err := c.persist(); err != nil {
		return LightingScene{}, err
	}
	return scene, nil
}

// UpdateLightingScene replaces an existing scene.
func (c *WLEDController) UpdateLightingScene(input UpsertLightingSceneInput) (LightingScene, error) {
	scene, err := normalizeUpsertLightingScene(input)
	if err != nil {
		return LightingScene{}, err
	}
	if scene.ID == "" {
		return LightingScene{}, fmt.Errorf("scene id is required")
	}
	if err := c.validateSceneReferences(scene); err != nil {
		return LightingScene{}, err
	}

	c.mu.Lock()
	idx, existing, ok := c.findSceneLocked(scene.ID)
	if !ok {
		c.mu.Unlock()
		return LightingScene{}, fmt.Errorf("unknown scene: %s", scene.ID)
	}
	scene.CreatedAt = existing.CreatedAt
	scene.UpdatedAt = time.Now().UTC()
	scenes := cloneLightingScenes(c.scenes)
	scenes[idx] = scene
	c.scenes = scenes
	c.updated = time.Now()
	c.mu.Unlock()

	if err := c.persist(); err != nil {
		return LightingScene{}, err
	}
	return scene, nil
}

// DeleteLightingScene removes a scene by id.
func (c *WLEDController) DeleteLightingScene(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("scene id is required")
	}
	c.mu.Lock()
	idx, _, ok := c.findSceneLocked(id)
	if !ok {
		c.mu.Unlock()
		return fmt.Errorf("unknown scene: %s", id)
	}
	scenes := cloneLightingScenes(c.scenes)
	c.scenes = append(scenes[:idx], scenes[idx+1:]...)
	if c.activeSceneID == id {
		c.activeSceneID = ""
	}
	if c.defaultSceneID == id {
		c.defaultSceneID = ""
	}
	if c.partySceneID == id {
		c.partySceneID = ""
	}
	c.updated = time.Now()
	c.mu.Unlock()
	return c.persist()
}

func (c *WLEDController) validateSceneReferences(scene LightingScene) error {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, e := range scene.WLED {
		device, ok := c.devices[e.DeviceID]
		if !ok || device.Ignored {
			return fmt.Errorf("unknown wled device: %s", e.DeviceID)
		}
		if _, ok := findWLEDDevicePreset(device.Presets, e.PresetID); !ok {
			return fmt.Errorf("unknown preset %s on device %s", e.PresetID, e.DeviceID)
		}
	}
	for _, e := range scene.DMX {
		fixture, ok := findFixtureByID(c.dmxState.Fixtures, e.FixtureID)
		if !ok {
			return fmt.Errorf("unknown dmx fixture: %s", e.FixtureID)
		}
		if _, ok := cueByID(fixture.SceneCues, e.CueID); !ok {
			return fmt.Errorf("unknown scene cue %s on fixture %s", e.CueID, e.FixtureID)
		}
	}
	for _, id := range scene.PartyWLEDDeviceIDs {
		device, ok := c.devices[id]
		if !ok || device.Ignored {
			return fmt.Errorf("unknown wled device: %s", id)
		}
	}
	for _, id := range scene.PartyFixtureIDs {
		fixture, ok := findFixtureByID(c.dmxState.Fixtures, id)
		if !ok {
			return fmt.Errorf("unknown dmx fixture: %s", id)
		}
		if fixture.MasterFixtureID != "" {
			return fmt.Errorf("dmx fixture %s is a slave and cannot be a party target", id)
		}
	}
	return nil
}

func findFixtureByID(fixtures []DMXFixture, id string) (DMXFixture, bool) {
	id = strings.TrimSpace(id)
	for _, fx := range fixtures {
		if fx.ID == id {
			return fx, true
		}
	}
	return DMXFixture{}, false
}

// ApplyLightingScene stops party mode and applies all WLED presets and DMX cues in the scene.
func (c *WLEDController) ApplyLightingScene(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	c.mu.RLock()
	_, scene, ok := c.findSceneLocked(id)
	c.mu.RUnlock()
	if !ok {
		return fmt.Errorf("unknown scene: %s", id)
	}

	c.StopDMXParty()

	var warnings []string

	for _, e := range scene.WLED {
		c.mu.RLock()
		device, exists := c.devices[e.DeviceID]
		c.mu.RUnlock()
		if !exists || device.Ignored {
			warnings = append(warnings, fmt.Sprintf("skip missing wled device %s", e.DeviceID))
			continue
		}
		if !device.Online {
			warnings = append(warnings, fmt.Sprintf("skip offline wled device %s", device.Name))
			continue
		}
		if err := c.ApplyWLEDDevicePreset(ctx, e.DeviceID, e.PresetID); err != nil {
			return fmt.Errorf("apply wled preset on %s: %w", device.Name, err)
		}
	}

	if len(scene.DMX) > 0 {
		if !c.dmxEnabled() {
			return fmt.Errorf("dmx component is disabled in settings")
		}
		if !c.dmxLiveIsConnected() {
			if err := c.StartDMXLive(""); err != nil {
				return fmt.Errorf(
					"no DMX interface is available to apply this scene: open Settings → DMX, enable USB DMX and/or Art-Net, select a USB device or Art-Net target, then try again (%v)",
					err,
				)
			}
		}
		updates, err := c.buildSceneDMXUpdates(scene.DMX)
		if err != nil {
			return err
		}
		if len(updates) > 0 {
			if err := c.ApplyDMXLivePatch(updates); err != nil {
				return fmt.Errorf("apply dmx scene patch: %w", err)
			}
		}
	}

	for _, w := range warnings {
		c.logger.Printf("scene %s: %s", scene.Name, w)
	}

	c.mu.Lock()
	c.activeSceneID = scene.ID
	c.updated = time.Now()
	c.mu.Unlock()
	if err := c.persist(); err != nil {
		c.logger.Printf("persist active scene after apply: %v", err)
	}
	return nil
}

// clearActiveSceneLocked clears activeSceneID if set. Caller must hold c.mu.
// Returns true when the ID was non-empty and cleared.
func (c *WLEDController) clearActiveSceneLocked() bool {
	if c.activeSceneID == "" {
		return false
	}
	c.activeSceneID = ""
	c.updated = time.Now()
	return true
}

// SetDefaultLightingScene marks a scene as the startup default. Pass an empty id to clear.
func (c *WLEDController) SetDefaultLightingScene(id string) error {
	id = strings.TrimSpace(id)
	c.mu.Lock()
	if id != "" {
		if _, _, ok := c.findSceneLocked(id); !ok {
			c.mu.Unlock()
			return fmt.Errorf("unknown scene: %s", id)
		}
	}
	c.defaultSceneID = id
	c.updated = time.Now()
	c.mu.Unlock()
	return c.persist()
}

// SetPartyLightingScene marks a scene as the designated party-mode scene. Pass an empty id to clear.
func (c *WLEDController) SetPartyLightingScene(id string) error {
	id = strings.TrimSpace(id)
	c.mu.Lock()
	if id != "" {
		if _, _, ok := c.findSceneLocked(id); !ok {
			c.mu.Unlock()
			return fmt.Errorf("unknown scene: %s", id)
		}
	}
	c.partySceneID = id
	c.updated = time.Now()
	c.mu.Unlock()
	return c.persist()
}

// StartLightingSceneParty applies the scene's party targets to party config and starts party mode.
func (c *WLEDController) StartLightingSceneParty() error {
	c.mu.RLock()
	partySceneID := strings.TrimSpace(c.partySceneID)
	if partySceneID == "" {
		c.mu.RUnlock()
		return fmt.Errorf("no party scene is configured")
	}
	_, scene, ok := c.findSceneLocked(partySceneID)
	c.mu.RUnlock()
	if !ok {
		return fmt.Errorf("unknown party scene: %s", partySceneID)
	}

	wledIDs := normalizeScenePartyDeviceIDs(scene.PartyWLEDDeviceIDs)
	fixtureIDs := normalizeScenePartyFixtureIDs(scene.PartyFixtureIDs)
	if len(wledIDs) == 0 && len(fixtureIDs) == 0 {
		return fmt.Errorf("party scene %q has no WLED or DMX targets selected", scene.Name)
	}

	state := c.GetDMXPartyState()
	config := state.Config
	config.WLEDDeviceIDs = wledIDs
	config.FixtureIDs = fixtureIDs
	if _, err := c.SetDMXPartyConfig(config); err != nil {
		return err
	}
	return c.StartDMXParty()
}

func (c *WLEDController) buildSceneDMXUpdates(entries []SceneDMXEntry) ([]dmx.DMXOutputUpdate, error) {
	c.mu.RLock()
	fixtures := append([]DMXFixture(nil), c.dmxState.Fixtures...)
	c.mu.RUnlock()

	updates := make([]dmx.DMXOutputUpdate, 0)
	for _, e := range entries {
		fixture, ok := findFixtureByID(fixtures, e.FixtureID)
		if !ok {
			return nil, fmt.Errorf("unknown dmx fixture: %s", e.FixtureID)
		}
		cue, ok := cueByID(fixture.SceneCues, e.CueID)
		if !ok {
			return nil, fmt.Errorf("unknown scene cue %s on fixture %s", e.CueID, e.FixtureID)
		}
		universeID := normalizeFixtureUniverseID(fixture.UniverseID, nil)
		base := fixture.DMXAddress
		for k, v := range cue.Values {
			off, err := strconv.Atoi(strings.TrimSpace(k))
			if err != nil || off < 1 {
				continue
			}
			addr := base + off - 1
			if addr < 1 || addr > 512 {
				continue
			}
			updates = append(updates, dmx.DMXOutputUpdate{
				UniverseID: universeID,
				Address:    addr,
				Value:      clampDMXByte(v),
			})
		}
	}
	return updates, nil
}

// ExportLightingSceneBundle builds portable JSON for sharing a scene.
func (c *WLEDController) ExportLightingSceneBundle(id string) ([]byte, error) {
	id = strings.TrimSpace(id)
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, scene, ok := c.findSceneLocked(id)
	if !ok {
		return nil, fmt.Errorf("unknown scene: %s", id)
	}

	data := PortableLightingSceneData{Name: scene.Name}
	for _, e := range scene.WLED {
		device, exists := c.devices[e.DeviceID]
		if !exists {
			return nil, fmt.Errorf("unknown wled device: %s", e.DeviceID)
		}
		preset, ok := findWLEDDevicePreset(device.Presets, e.PresetID)
		if !ok {
			return nil, fmt.Errorf("unknown preset %s on device %s", e.PresetID, e.DeviceID)
		}
		data.WLED = append(data.WLED, PortableSceneWLEDEntry{
			DeviceID:   device.ID,
			DeviceName: device.Name,
			Host:       device.Host,
			Address:    device.Address,
			PresetName: preset.Name,
			State:      cloneJSONMap(preset.State),
		})
	}
	for _, e := range scene.DMX {
		fixture, ok := findFixtureByID(c.dmxState.Fixtures, e.FixtureID)
		if !ok {
			return nil, fmt.Errorf("unknown dmx fixture: %s", e.FixtureID)
		}
		cue, ok := cueByID(fixture.SceneCues, e.CueID)
		if !ok {
			return nil, fmt.Errorf("unknown scene cue %s on fixture %s", e.CueID, e.FixtureID)
		}
		values := make(map[string]int, len(cue.Values))
		for k, v := range cue.Values {
			values[k] = v
		}
		data.DMX = append(data.DMX, PortableSceneDMXEntry{
			FixtureID:    fixture.ID,
			FixtureBrand: fixture.Brand,
			FixtureName:  fixture.Name,
			CueLabel:     strings.TrimSpace(cue.Label),
			Values:       values,
		})
	}

	bundle := PortableLightingSceneBundle{
		Version:    lightingSceneExportVersion,
		ExportedAt: time.Now().UTC(),
		Scene:      data,
	}
	return json.MarshalIndent(bundle, "", "  ")
}

// ImportLightingSceneBundle remaps a portable scene onto local devices/fixtures and creates it.
func (c *WLEDController) ImportLightingSceneBundle(data []byte) (LightingScene, error) {
	var bundle PortableLightingSceneBundle
	if err := json.Unmarshal(data, &bundle); err != nil {
		return LightingScene{}, fmt.Errorf("parse scene: %w", err)
	}
	if bundle.Version < 1 || bundle.Version > lightingSceneExportVersion {
		return LightingScene{}, fmt.Errorf("unsupported scene export version %d", bundle.Version)
	}
	name := strings.TrimSpace(bundle.Scene.Name)
	if name == "" {
		return LightingScene{}, fmt.Errorf("scene name is required")
	}

	input := UpsertLightingSceneInput{Name: name}

	for _, e := range bundle.Scene.WLED {
		device, ok := c.matchWLEDDeviceForImport(e)
		if !ok {
			return LightingScene{}, fmt.Errorf("no matching wled device for %q", e.DeviceName)
		}
		presetName := strings.TrimSpace(e.PresetName)
		if presetName == "" {
			presetName = "Imported"
		}
		presetID, err := c.ensureWLEDPresetFromImport(device.ID, presetName, e.State)
		if err != nil {
			return LightingScene{}, err
		}
		input.WLED = append(input.WLED, SceneWLEDEntry{DeviceID: device.ID, PresetID: presetID})
	}

	for _, e := range bundle.Scene.DMX {
		fixture, ok := c.matchDMXFixtureForImport(e)
		if !ok {
			return LightingScene{}, fmt.Errorf("no matching dmx fixture for %q %q", e.FixtureBrand, e.FixtureName)
		}
		cueID, err := c.ensureFixtureCueFromImport(fixture.ID, e.CueLabel, e.Values)
		if err != nil {
			return LightingScene{}, err
		}
		input.DMX = append(input.DMX, SceneDMXEntry{FixtureID: fixture.ID, CueID: cueID})
	}

	return c.CreateLightingScene(input)
}

func (c *WLEDController) matchWLEDDeviceForImport(e PortableSceneWLEDEntry) (WLEDDevice, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if id := strings.TrimSpace(e.DeviceID); id != "" {
		if d, ok := c.devices[id]; ok && !d.Ignored {
			return d, true
		}
	}
	wantName := strings.EqualFold
	name := strings.TrimSpace(e.DeviceName)
	host := strings.TrimSpace(e.Host)
	addr := strings.TrimSpace(e.Address)
	for _, d := range c.devices {
		if d.Ignored {
			continue
		}
		if name != "" && wantName(d.Name, name) {
			return d, true
		}
		if host != "" && wantName(d.Host, host) {
			return d, true
		}
		if addr != "" && wantName(d.Address, addr) {
			return d, true
		}
	}
	return WLEDDevice{}, false
}

func (c *WLEDController) matchDMXFixtureForImport(e PortableSceneDMXEntry) (DMXFixture, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if id := strings.TrimSpace(e.FixtureID); id != "" {
		if fx, ok := findFixtureByID(c.dmxState.Fixtures, id); ok {
			return fx, true
		}
	}
	brand := strings.TrimSpace(e.FixtureBrand)
	name := strings.TrimSpace(e.FixtureName)
	for _, fx := range c.dmxState.Fixtures {
		if brand != "" && !strings.EqualFold(fx.Brand, brand) {
			continue
		}
		if name != "" && strings.EqualFold(fx.Name, name) {
			return fx, true
		}
	}
	return DMXFixture{}, false
}

func (c *WLEDController) ensureWLEDPresetFromImport(deviceID, name string, state map[string]any) (string, error) {
	c.mu.Lock()
	device, ok := c.devices[deviceID]
	if !ok {
		c.mu.Unlock()
		return "", fmt.Errorf("unknown device: %s", deviceID)
	}
	for _, p := range device.Presets {
		if strings.EqualFold(p.Name, name) {
			id := p.ID
			c.mu.Unlock()
			return id, nil
		}
	}
	now := time.Now().UTC()
	preset := WLEDDevicePreset{
		ID:        fmt.Sprintf("wled-preset-%d", now.UnixNano()),
		Name:      name,
		State:     cloneJSONMap(state),
		CreatedAt: now,
		UpdatedAt: now,
	}
	device.Presets = append(cloneWLEDDevicePresets(device.Presets), preset)
	c.devices[deviceID] = device
	c.updated = time.Now()
	c.mu.Unlock()
	if err := c.persist(); err != nil {
		return "", err
	}
	return preset.ID, nil
}

func (c *WLEDController) ensureFixtureCueFromImport(fixtureID, label string, values map[string]int) (string, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		label = "Imported"
	}
	c.mu.Lock()
	idx := -1
	for i := range c.dmxState.Fixtures {
		if c.dmxState.Fixtures[i].ID == fixtureID {
			idx = i
			break
		}
	}
	if idx < 0 {
		c.mu.Unlock()
		return "", fmt.Errorf("unknown dmx fixture: %s", fixtureID)
	}
	fx := c.dmxState.Fixtures[idx]
	cues := normalizeFixtureSceneCues(fx.SceneCues)
	for _, cue := range cues {
		if strings.EqualFold(strings.TrimSpace(cue.Label), label) {
			id := cue.ID
			c.mu.Unlock()
			return id, nil
		}
	}
	now := time.Now().UTC()
	cue := DMXFixtureCue{
		ID:     fmt.Sprintf("scene-cue-%d", now.UnixNano()),
		Label:  label,
		Values: values,
	}
	fx.SceneCues = append(cues, cue)
	fx.UpdatedAt = now
	c.dmxState.Fixtures[idx] = fx
	c.dmxPersistEnabled = true
	c.updated = time.Now()
	c.mu.Unlock()
	if err := c.persistDMX(); err != nil {
		return "", err
	}
	return cue.ID, nil
}

// LightingSceneExportExtension is the suggested suffix for exported scene files.
func LightingSceneExportExtension() string {
	return ".json"
}

// SuggestLightingSceneExportFilename builds scene-<sanitized-name>.json.
func SuggestLightingSceneExportFilename(name string) string {
	sanitized := sanitizeSceneFilename(name)
	if sanitized == "" {
		sanitized = "untitled"
	}
	return "scene-" + sanitized + LightingSceneExportExtension()
}

func sanitizeSceneFilename(name string) string {
	name = strings.TrimSpace(strings.ToLower(name))
	if name == "" {
		return ""
	}
	var b strings.Builder
	prevDash := false
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			prevDash = false
		case r == ' ' || r == '-' || r == '_' || r == '.':
			if !prevDash && b.Len() > 0 {
				b.WriteByte('-')
				prevDash = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if len(out) > 64 {
		out = out[:64]
		out = strings.Trim(out, "-")
	}
	return out
}
