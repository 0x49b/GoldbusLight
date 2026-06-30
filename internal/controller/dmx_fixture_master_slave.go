package controller

import (
	"fmt"
	"goldbus/internal/dmx"
	"strings"
)

func isDMXSlaveFixture(fixture DMXFixture) bool {
	return strings.TrimSpace(fixture.MasterFixtureID) != ""
}

func dmxSlaveFixtures(fixtures []DMXFixture, masterID string) []DMXFixture {
	masterID = strings.TrimSpace(masterID)
	if masterID == "" {
		return nil
	}
	out := make([]DMXFixture, 0)
	for _, fx := range fixtures {
		if strings.TrimSpace(fx.MasterFixtureID) == masterID {
			out = append(out, fx)
		}
	}
	return out
}

func dmxFixtureHasSlaves(fixtures []DMXFixture, fixtureID string) bool {
	return len(dmxSlaveFixtures(fixtures, fixtureID)) > 0
}

func dmxFixtureByID(fixtures []DMXFixture, id string) (DMXFixture, bool) {
	id = strings.TrimSpace(id)
	if id == "" {
		return DMXFixture{}, false
	}
	for _, fx := range fixtures {
		if fx.ID == id {
			return fx, true
		}
	}
	return DMXFixture{}, false
}

func dmxFixtureChannelOffset(fixture DMXFixture, address int) (int, bool) {
	if address < 1 || address > 512 {
		return 0, false
	}
	base := fixture.DMXAddress
	if base < 1 || base > 512 {
		base = 1
	}
	offset := address - base + 1
	if offset < 1 {
		return 0, false
	}
	for _, ch := range fixture.Channels {
		if ch.Channel == offset {
			return offset, true
		}
	}
	return 0, false
}

func dmxFixtureOwnsAddress(fixture DMXFixture, address int) bool {
	_, ok := dmxFixtureChannelOffset(fixture, address)
	return ok
}

// expandDMXUpdatesToSlaves mirrors master fixture channel updates to all linked slaves.
// When owned is non-nil, slave addresses are marked owned as well (party mode) per universe.
func expandDMXUpdatesToSlaves(fixtures []DMXFixture, updates []dmx.DMXOutputUpdate, owned *map[string][512]bool) []dmx.DMXOutputUpdate {
	if len(updates) == 0 || len(fixtures) == 0 {
		return updates
	}
	type key struct {
		universeID string
		address    int
	}
	byKey := make(map[key]int, len(updates))
	for _, u := range updates {
		if u.Address < 1 || u.Address > 512 {
			continue
		}
		universeID := resolveUniverseIDForUpdate(u.UniverseID)
		byKey[key{universeID: universeID, address: u.Address}] = clampDMXByte(u.Value)
	}
	for k, value := range byKey {
		for _, fx := range fixtures {
			if isDMXSlaveFixture(fx) {
				continue
			}
			fxUniverse := normalizeFixtureUniverseID(fx.UniverseID, nil)
			if fxUniverse != k.universeID {
				continue
			}
			offset, ok := dmxFixtureChannelOffset(fx, k.address)
			if !ok {
				continue
			}
			for _, slave := range dmxSlaveFixtures(fixtures, fx.ID) {
				slaveAddr := slave.DMXAddress + offset - 1
				if slaveAddr < 1 || slaveAddr > 512 {
					continue
				}
				slaveUniverse := normalizeFixtureUniverseID(slave.UniverseID, nil)
				sk := key{universeID: slaveUniverse, address: slaveAddr}
				byKey[sk] = value
				if owned != nil {
					if *owned == nil {
						*owned = map[string][512]bool{}
					}
					o := (*owned)[slaveUniverse]
					o[slaveAddr-1] = true
					(*owned)[slaveUniverse] = o
				}
			}
		}
	}
	out := make([]dmx.DMXOutputUpdate, 0, len(byKey))
	for k, v := range byKey {
		out = append(out, dmx.DMXOutputUpdate{UniverseID: k.universeID, Address: k.address, Value: v})
	}
	return out
}

func validateMasterFixtureID(fixtures []DMXFixture, fixtureID string, masterID string) (string, error) {
	masterID = strings.TrimSpace(masterID)
	if masterID == "" {
		return "", nil
	}
	fixtureID = strings.TrimSpace(fixtureID)
	if fixtureID != "" && masterID == fixtureID {
		return "", fmt.Errorf("a fixture cannot be its own master")
	}
	master, ok := dmxFixtureByID(fixtures, masterID)
	if !ok {
		return "", fmt.Errorf("unknown master fixture: %s", masterID)
	}
	if isDMXSlaveFixture(master) {
		return "", fmt.Errorf("cannot use a slave fixture as master")
	}
	if fixtureID != "" && dmxFixtureHasSlaves(fixtures, fixtureID) {
		return "", fmt.Errorf("cannot set a master fixture as slave while other fixtures depend on it")
	}
	return masterID, nil
}

func sanitizeMasterSlaveRelationships(fixtures []DMXFixture) []DMXFixture {
	if len(fixtures) == 0 {
		return fixtures
	}
	byID := make(map[string]DMXFixture, len(fixtures))
	for _, fx := range fixtures {
		byID[fx.ID] = fx
	}
	out := make([]DMXFixture, len(fixtures))
	for i, fx := range fixtures {
		masterID := strings.TrimSpace(fx.MasterFixtureID)
		if masterID == "" || masterID == fx.ID {
			fx.MasterFixtureID = ""
			out[i] = fx
			continue
		}
		master, ok := byID[masterID]
		if !ok || isDMXSlaveFixture(master) {
			fx.MasterFixtureID = ""
		} else {
			fx.MasterFixtureID = masterID
		}
		out[i] = fx
	}
	return out
}

func filterPartyMasterFixtures(fixtures []DMXFixture, fixtureIDs []string) []DMXFixture {
	targeted := filterPartyFixtures(fixtures, fixtureIDs)
	if len(targeted) == 0 {
		return targeted
	}
	out := make([]DMXFixture, 0, len(targeted))
	for _, fx := range targeted {
		if isDMXSlaveFixture(fx) {
			continue
		}
		out = append(out, fx)
	}
	return out
}
