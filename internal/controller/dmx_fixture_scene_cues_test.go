package controller

import "testing"

func TestBuildDMXFixtureForUpdatePreservesSceneCuesWhenOmitted(t *testing.T) {
	existing := DMXFixture{
		ID:         "fixture-1",
		Brand:      "Brand",
		Name:       "Fixture",
		DMXAddress: 1,
		SceneCues: []DMXFixtureCue{
			{ID: "cue-1", Label: "Home", Values: map[string]int{"1": 128}},
		},
		Channels: []DMXChannel{{Channel: 1, Type: "dimmer"}},
	}
	input := UpsertDMXFixtureInput{
		ID:         "fixture-1",
		Brand:      "Brand",
		Name:       "Fixture Updated",
		DMXAddress: 1,
		Channels:   []DMXChannel{{Channel: 1, Type: "dimmer"}},
	}

	updated, err := buildDMXFixtureForUpdate(existing, input, nil)
	if err != nil {
		t.Fatalf("buildDMXFixtureForUpdate: %v", err)
	}
	if len(updated.SceneCues) != 1 || updated.SceneCues[0].ID != "cue-1" {
		t.Fatalf("SceneCues = %#v, want existing cue preserved", updated.SceneCues)
	}
}

func TestBuildDMXFixtureForUpdateClearsSceneCuesWhenExplicitlyEmpty(t *testing.T) {
	existing := DMXFixture{
		ID:         "fixture-1",
		Brand:      "Brand",
		Name:       "Fixture",
		DMXAddress: 1,
		SceneCues: []DMXFixtureCue{
			{ID: "cue-1", Label: "Home", Values: map[string]int{"1": 128}},
		},
		Channels: []DMXChannel{{Channel: 1, Type: "dimmer"}},
	}
	input := UpsertDMXFixtureInput{
		ID:         "fixture-1",
		Brand:      "Brand",
		Name:       "Fixture",
		DMXAddress: 1,
		SceneCues:  []DMXFixtureCue{},
		Channels:   []DMXChannel{{Channel: 1, Type: "dimmer"}},
	}

	updated, err := buildDMXFixtureForUpdate(existing, input, nil)
	if err != nil {
		t.Fatalf("buildDMXFixtureForUpdate: %v", err)
	}
	if updated.SceneCues != nil {
		t.Fatalf("SceneCues = %#v, want nil when explicitly cleared", updated.SceneCues)
	}
}
