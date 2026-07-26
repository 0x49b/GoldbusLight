package controller

import (
	"goldbus/internal/dmx"
	"testing"
)

func TestNormalizeColorSweepOnlyForColorChanger(t *testing.T) {
	got := normalizeColorSweep(DMXColorSweep{Enabled: true, Direction: "rtl", Speed: 80}, DMXFixtureTypeMovingHead)
	if got.Enabled || got.Direction != "" || got.Speed != 0 {
		t.Fatalf("expected empty sweep for non-colorChanger, got %+v", got)
	}
}

func TestNormalizeColorSweepDefaults(t *testing.T) {
	got := normalizeColorSweep(DMXColorSweep{Enabled: true}, DMXFixtureTypeColorChanger)
	if !got.Enabled {
		t.Fatal("expected enabled")
	}
	if got.Direction != colorSweepDirectionLTR {
		t.Fatalf("direction=%q", got.Direction)
	}
	if got.Speed != defaultColorSweepSpeed {
		t.Fatalf("speed=%d", got.Speed)
	}
}

func TestColorSweepChainOrder(t *testing.T) {
	master := DMXFixture{ID: "m", Type: DMXFixtureTypeColorChanger, DMXAddress: 10}
	fixtures := []DMXFixture{
		master,
		{ID: "s2", Type: DMXFixtureTypeColorChanger, DMXAddress: 30, MasterFixtureID: "m"},
		{ID: "s1", Type: DMXFixtureTypeColorChanger, DMXAddress: 20, MasterFixtureID: "m"},
		{ID: "other", Type: DMXFixtureTypeColorChanger, DMXAddress: 40},
	}
	chain := colorSweepChain(fixtures, master)
	if len(chain) != 3 {
		t.Fatalf("len=%d", len(chain))
	}
	if chain[0].ID != "m" || chain[1].ID != "s1" || chain[2].ID != "s2" {
		t.Fatalf("order=%s,%s,%s", chain[0].ID, chain[1].ID, chain[2].ID)
	}
}

func TestBuildColorSweepUpdatesDistinctHues(t *testing.T) {
	rgb := func(label string, offset int) DMXChannel {
		return DMXChannel{
			Channel: offset,
			Type:    "custom",
			Properties: map[string]any{
				"label": label,
			},
		}
	}
	master := DMXFixture{
		ID:         "m",
		Type:       DMXFixtureTypeColorChanger,
		DMXAddress: 1,
		ColorSweep: DMXColorSweep{Enabled: true, Direction: colorSweepDirectionLTR, Speed: 50},
		Channels: []DMXChannel{
			{Channel: 1, Type: "dimmer"},
			rgb("Red", 2),
			rgb("Green", 3),
			rgb("Blue", 4),
		},
	}
	slave := DMXFixture{
		ID:              "s",
		Type:            DMXFixtureTypeColorChanger,
		DMXAddress:      11,
		MasterFixtureID: "m",
		Channels: []DMXChannel{
			{Channel: 1, Type: "dimmer"},
			rgb("Red", 2),
			rgb("Green", 3),
			rgb("Blue", 4),
		},
	}
	fixtures := []DMXFixture{master, slave}
	updates := buildColorSweepUpdatesForMaster(fixtures, master, 0, 1.0, nil)
	if len(updates) < 8 {
		t.Fatalf("expected RGB+dimmer for 2 fixtures, got %d updates", len(updates))
	}
	byAddr := map[int]int{}
	for _, u := range updates {
		byAddr[u.Address] = u.Value
	}
	// Master at hue 0 → red dominant; slave at hue 180 → cyan/green-blue.
	if byAddr[2] < 200 {
		t.Fatalf("master red too low: %d", byAddr[2])
	}
	if byAddr[12] > 20 {
		t.Fatalf("slave red should be near 0 at hue 180, got %d", byAddr[12])
	}
	if byAddr[14] < 200 {
		t.Fatalf("slave blue too low at hue 180: %d", byAddr[14])
	}
}

func TestBuildColorSweepRTLReversesOrder(t *testing.T) {
	rgb := func(label string, offset int) DMXChannel {
		return DMXChannel{Channel: offset, Type: "custom", Properties: map[string]any{"label": label}}
	}
	master := DMXFixture{
		ID:         "m",
		Type:       DMXFixtureTypeColorChanger,
		DMXAddress: 1,
		ColorSweep: DMXColorSweep{Enabled: true, Direction: colorSweepDirectionRTL, Speed: 50},
		Channels:   []DMXChannel{{Channel: 1, Type: "dimmer"}, rgb("Red", 2), rgb("Green", 3), rgb("Blue", 4)},
	}
	slave := DMXFixture{
		ID:              "s",
		Type:            DMXFixtureTypeColorChanger,
		DMXAddress:      11,
		MasterFixtureID: "m",
		Channels:        []DMXChannel{{Channel: 1, Type: "dimmer"}, rgb("Red", 2), rgb("Green", 3), rgb("Blue", 4)},
	}
	ltrMaster := master
	ltrMaster.ColorSweep.Direction = colorSweepDirectionLTR
	ltr := buildColorSweepUpdatesForMaster([]DMXFixture{ltrMaster, slave}, ltrMaster, 0, 1.0, nil)
	rtl := buildColorSweepUpdatesForMaster([]DMXFixture{master, slave}, master, 0, 1.0, nil)
	ltrBy := map[int]int{}
	rtlBy := map[int]int{}
	for _, u := range ltr {
		ltrBy[u.Address] = u.Value
	}
	for _, u := range rtl {
		rtlBy[u.Address] = u.Value
	}
	// Under RTL, master gets the hue that the last fixture had under LTR.
	if ltrBy[12] != rtlBy[2] || ltrBy[2] != rtlBy[12] {
		t.Fatalf("rtl did not reverse hues: ltr mR=%d sR=%d rtl mR=%d sR=%d", ltrBy[2], ltrBy[12], rtlBy[2], rtlBy[12])
	}
}

func TestExpandDMXUpdatesSkipsColorSweepMasters(t *testing.T) {
	fixtures := []DMXFixture{
		{
			ID:         "m",
			Type:       DMXFixtureTypeColorChanger,
			DMXAddress: 1,
			ColorSweep: DMXColorSweep{Enabled: true, Direction: "ltr", Speed: 50},
			Channels:   []DMXChannel{{Channel: 1, Type: "dimmer"}, {Channel: 2, Type: "custom"}},
		},
		{
			ID:              "s",
			Type:            DMXFixtureTypeColorChanger,
			DMXAddress:      11,
			MasterFixtureID: "m",
			Channels:        []DMXChannel{{Channel: 1, Type: "dimmer"}, {Channel: 2, Type: "custom"}},
		},
	}
	updates := expandDMXUpdatesToSlaves(fixtures, []dmx.DMXOutputUpdate{{UniverseID: DefaultDMXUniverseID, Address: 1, Value: 200}}, nil)
	for _, u := range updates {
		if u.Address == 11 {
			t.Fatal("expected no slave mirror while color sweep is active")
		}
	}
}
