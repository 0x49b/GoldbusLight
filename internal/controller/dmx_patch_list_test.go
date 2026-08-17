package controller

import (
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"
)

func TestBuildDMXPatchListXLSXContainsFixtureAndChannels(t *testing.T) {
	def := 128
	fixtures := []DMXFixture{
		{
			ID:         "fx-2",
			Name:       "Wash 2",
			Brand:      "ADJ",
			Type:       DMXFixtureTypeColorChanger,
			DMXAddress: 17,
			Channels: []DMXChannel{
				{Channel: 1, Type: "dimmer"},
				{Channel: 2, Type: "custom", Properties: map[string]any{"label": "Red"}},
				{Channel: 4, Type: "colorWheel", Properties: map[string]any{
					"entries": []any{
						map[string]any{"from": 0, "to": 15, "label": "Open"},
						map[string]any{"from": 16, "to": 31, "label": "Red"},
					},
				}},
			},
		},
		{
			ID:         "fx-1",
			Name:       "Spot 1",
			Brand:      "Chauvet",
			Type:       DMXFixtureTypeMovingHead,
			DMXAddress: 1,
			Channels: []DMXChannel{
				{Channel: 1, Type: "pan", DefaultValue: &def},
				{Channel: 2, Type: "tilt"},
			},
		},
		{
			ID:              "fx-3",
			Name:            "Wash 2 Slave",
			Brand:           "ADJ",
			Type:            DMXFixtureTypeColorChanger,
			DMXAddress:      18,
			MasterFixtureID: "fx-2",
			Channels:        []DMXChannel{{Channel: 1, Type: "dimmer"}},
		},
	}

	data, err := BuildDMXPatchListXLSX(DMXUniverse{ID: DefaultDMXUniverseID, Name: "Universe 1"}, fixtures, "en")
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	files := unzipXLSX(t, data)
	patch := files["xl/worksheets/sheet1.xml"]
	channels := files["xl/worksheets/sheet2.xml"]
	workbook := files["xl/workbook.xml"]

	if !strings.Contains(workbook, `name="Patch List"`) {
		t.Fatalf("missing Patch List sheet: %s", workbook)
	}
	if !strings.Contains(workbook, `name="Channel Map"`) {
		t.Fatalf("missing Channel Map sheet: %s", workbook)
	}
	for _, want := range []string{"Spot 1", "Chauvet", "Moving Head", "001", "002", "2 CH", "Standalone"} {
		if !strings.Contains(patch, want) {
			t.Fatalf("patch sheet missing %q", want)
		}
	}
	if !strings.Contains(patch, "Overlap") {
		t.Fatal("expected overlap on Wash 2 / Wash 2 Slave")
	}
	if !strings.Contains(patch, "Slave of Wash 2") {
		t.Fatal("expected slave role")
	}
	if !strings.Contains(patch, "Master") {
		t.Fatal("expected master role")
	}
	for _, want := range []string{"Spot 1", "Pan", "Tilt", "128", "Red", "Open 000–015", "(unused)"} {
		if !strings.Contains(channels, want) {
			t.Fatalf("channel sheet missing %q", want)
		}
	}
}

func TestBuildDMXPatchListXLSXGermanHeaders(t *testing.T) {
	data, err := BuildDMXPatchListXLSX(DMXUniverse{Name: "Universum 1"}, []DMXFixture{{
		ID:         "fx-1",
		Name:       "Nebel 1",
		Brand:      "Look",
		Type:       DMXFixtureTypeSmoke,
		DMXAddress: 1,
		Channels:   []DMXChannel{{Channel: 1, Type: "fog"}},
	}}, "de-DE")
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	files := unzipXLSX(t, data)
	workbook := files["xl/workbook.xml"]
	patch := files["xl/worksheets/sheet1.xml"]
	if !strings.Contains(workbook, `name="Patchliste"`) {
		t.Fatalf("expected German sheet name, got %s", workbook)
	}
	if !strings.Contains(patch, "Marke") || !strings.Contains(patch, "Nebel") {
		t.Fatalf("expected German headers/type, got %s", patch)
	}
}

func TestSuggestDMXPatchListFilename(t *testing.T) {
	name := SuggestDMXPatchListFilename("Universe 1")
	if !strings.HasPrefix(name, "dmx-patch-Universe-1-") || !strings.HasSuffix(name, ".xlsx") {
		t.Fatalf("unexpected filename %q", name)
	}
}

func unzipXLSX(t *testing.T, data []byte) map[string]string {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("zip: %v", err)
	}
	out := make(map[string]string, len(zr.File))
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("open %s: %v", f.Name, err)
		}
		body, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			t.Fatalf("read %s: %v", f.Name, err)
		}
		out[f.Name] = string(body)
	}
	return out
}
