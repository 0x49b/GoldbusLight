package controller

import (
	"goldbus/internal/dmx"
	"testing"
)

func TestExpandDMXUpdatesToSlaves(t *testing.T) {
	fixtures := []DMXFixture{
		{
			ID:         "master",
			DMXAddress: 1,
			Channels: []DMXChannel{
				{Channel: 1, Type: "dimmer"},
				{Channel: 2, Type: "pan"},
			},
		},
		{
			ID:              "slave",
			DMXAddress:      10,
			MasterFixtureID: "master",
			Channels: []DMXChannel{
				{Channel: 1, Type: "dimmer"},
				{Channel: 2, Type: "pan"},
			},
		},
	}

	updates := []dmx.DMXOutputUpdate{{Address: 1, Value: 200}}
	expanded := expandDMXUpdatesToSlaves(fixtures, updates, nil)
	if len(expanded) != 2 {
		t.Fatalf("expected 2 updates, got %d", len(expanded))
	}
	got := map[int]int{}
	for _, u := range expanded {
		got[u.Address] = u.Value
	}
	if got[1] != 200 {
		t.Fatalf("master ch1 = %d, want 200", got[1])
	}
	if got[10] != 200 {
		t.Fatalf("slave ch1 = %d, want 200", got[10])
	}
}

func TestValidateMasterFixtureIDRejectsSlaveMaster(t *testing.T) {
	fixtures := []DMXFixture{
		{ID: "a"},
		{ID: "b", MasterFixtureID: "a"},
	}
	if _, err := validateMasterFixtureID(fixtures, "c", "b"); err == nil {
		t.Fatal("expected error when master is a slave")
	}
}

func TestFilterPartyMasterFixturesExcludesSlaves(t *testing.T) {
	fixtures := []DMXFixture{
		{ID: "master", DMXAddress: 1},
		{ID: "slave", DMXAddress: 10, MasterFixtureID: "master"},
	}
	out := filterPartyMasterFixtures(fixtures, []string{"master", "slave"})
	if len(out) != 1 || out[0].ID != "master" {
		t.Fatalf("expected only master, got %#v", out)
	}
}
