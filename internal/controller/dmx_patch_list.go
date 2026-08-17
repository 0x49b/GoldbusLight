package controller

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
)

const dmxPatchListExtension = ".xlsx"

type patchListCopy struct {
	sheetPatch     string
	sheetChannels  string
	colNum         string
	colName        string
	colBrand       string
	colType        string
	colUniverse    string
	colStart       string
	colEnd         string
	colChannels    string
	colMode        string
	colRole        string
	colConflict    string
	colNotes       string
	colFixture     string
	colOffset      string
	colAddress     string
	colFunction    string
	colDefault     string
	colRanges      string
	roleStandalone string
	roleMaster     string
	roleSlaveOf    string
	conflictYes    string
	unusedChannel  string
	fixtureTypes   map[string]string
}

func patchListCopyForLocale(locale string) patchListCopy {
	if isGermanLocale(locale) {
		return patchListCopy{
			sheetPatch:     "Patchliste",
			sheetChannels:  "Kanalplan",
			colNum:         "#",
			colName:        "Name",
			colBrand:       "Marke",
			colType:        "Typ",
			colUniverse:    "Universum",
			colStart:       "Start",
			colEnd:         "Ende",
			colChannels:    "Kanäle",
			colMode:        "Modus",
			colRole:        "Rolle",
			colConflict:    "Konflikt",
			colNotes:       "Notizen",
			colFixture:     "Gerät",
			colOffset:      "Offset",
			colAddress:     "DMX-Adresse",
			colFunction:    "Funktion",
			colDefault:     "Default",
			colRanges:      "DMX-Bereiche",
			roleStandalone: "Eigenständig",
			roleMaster:     "Master",
			roleSlaveOf:    "Slave von %s",
			conflictYes:    "Überschneidung",
			unusedChannel:  "(ungenutzt)",
			fixtureTypes:   dmxFixtureTypeLabelsDE(),
		}
	}
	return patchListCopy{
		sheetPatch:     "Patch List",
		sheetChannels:  "Channel Map",
		colNum:         "#",
		colName:        "Name",
		colBrand:       "Brand",
		colType:        "Type",
		colUniverse:    "Universe",
		colStart:       "Start",
		colEnd:         "End",
		colChannels:    "Channels",
		colMode:        "Mode",
		colRole:        "Role",
		colConflict:    "Conflict",
		colNotes:       "Notes",
		colFixture:     "Fixture",
		colOffset:      "Offset",
		colAddress:     "DMX Address",
		colFunction:    "Function",
		colDefault:     "Default",
		colRanges:      "DMX Ranges",
		roleStandalone: "Standalone",
		roleMaster:     "Master",
		roleSlaveOf:    "Slave of %s",
		conflictYes:    "Overlap",
		unusedChannel:  "(unused)",
		fixtureTypes:   dmxFixtureTypeLabelsEN(),
	}
}

func isGermanLocale(locale string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(locale)), "de")
}

func dmxFixtureTypeLabelsEN() map[string]string {
	return map[string]string{
		"colorChanger": "Color Changer",
		"dimmer":       "Dimmer",
		"effect":       "Effect",
		"fan":          "Fan",
		"flower":       "Flower",
		"hazer":        "Hazer",
		"laser":        "Laser",
		"ledBarBeams":  "LED Bar (Beams)",
		"ledBarPixels": "LED Bar (Pixels)",
		"movingHead":   "Moving Head",
		"other":        "Other",
		"scanner":      "Scanner",
		"smoke":        "Smoke",
		"strobe":       "Strobe",
	}
}

func dmxFixtureTypeLabelsDE() map[string]string {
	return map[string]string{
		"colorChanger": "Farbwechsler",
		"dimmer":       "Dimmer",
		"effect":       "Effekt",
		"fan":          "Ventilator",
		"flower":       "Flower",
		"hazer":        "Hazer",
		"laser":        "Laser",
		"ledBarBeams":  "LED-Bar (Beams)",
		"ledBarPixels": "LED-Bar (Pixel)",
		"movingHead":   "Moving Head",
		"other":        "Sonstiges",
		"scanner":      "Scanner",
		"smoke":        "Nebel",
		"strobe":       "Strobe",
	}
}

// ExportDMXPatchList builds an Excel workbook for the current universe's fixtures.
func (c *WLEDController) ExportDMXPatchList(universeID, locale string) ([]byte, string, error) {
	st := c.GetDMXState()
	universe := DMXUniverse{ID: DefaultDMXUniverseID, Name: "Universe 1"}
	want := strings.TrimSpace(universeID)
	if want == "" {
		want = DefaultDMXUniverseID
	}
	for _, u := range st.Universes {
		if u.ID == want || normalizeFixtureUniverseID(u.ID, st.Universes) == want {
			universe = u
			break
		}
	}
	data, err := BuildDMXPatchListXLSX(universe, st.Fixtures, locale)
	if err != nil {
		return nil, "", err
	}
	return data, SuggestDMXPatchListFilename(universe.Name), nil
}

func SuggestDMXPatchListFilename(universeName string) string {
	name := sanitizePatchListFilenamePart(universeName)
	if name == "" {
		name = "Universe-1"
	}
	return fmt.Sprintf("dmx-patch-%s-%s%s", name, time.Now().UTC().Format("20060102"), dmxPatchListExtension)
}

func sanitizePatchListFilenamePart(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
			lastDash = false
		case r == '-' || r == '_' || unicode.IsSpace(r):
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

func BuildDMXPatchListXLSX(universe DMXUniverse, fixtures []DMXFixture, locale string) ([]byte, error) {
	copy := patchListCopyForLocale(locale)
	universeName := strings.TrimSpace(universe.Name)
	if universeName == "" {
		universeName = "Universe 1"
	}

	sorted := append([]DMXFixture(nil), fixtures...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].DMXAddress != sorted[j].DMXAddress {
			return sorted[i].DMXAddress < sorted[j].DMXAddress
		}
		nameCmp := strings.Compare(strings.ToLower(sorted[i].Name), strings.ToLower(sorted[j].Name))
		if nameCmp != 0 {
			return nameCmp < 0
		}
		return sorted[i].ID < sorted[j].ID
	})

	occupancy := patchListOccupancy(sorted)
	byID := make(map[string]DMXFixture, len(sorted))
	for _, fx := range sorted {
		byID[fx.ID] = fx
	}
	hasSlaves := map[string]bool{}
	for _, fx := range sorted {
		if id := strings.TrimSpace(fx.MasterFixtureID); id != "" {
			hasSlaves[id] = true
		}
	}

	patchRows := make([][]string, 0, len(sorted))
	channelRows := make([][]string, 0, len(sorted)*8)
	for i, fx := range sorted {
		num := strconv.Itoa(i + 1)
		start, end, chCount := patchListRange(fx)
		conflict := ""
		if patchListFixtureConflicts(fx, occupancy) {
			conflict = copy.conflictYes
		}
		patchRows = append(patchRows, []string{
			num,
			fx.Name,
			fx.Brand,
			patchListFixtureType(fx.Type, copy),
			universeName,
			padDMXAddress(start),
			padDMXAddress(end),
			strconv.Itoa(chCount),
			fmt.Sprintf("%d CH", chCount),
			patchListRole(fx, byID, hasSlaves, copy),
			conflict,
			"",
		})
		channelRows = append(channelRows, patchListChannelRows(num, fx, start, chCount, copy)...)
	}

	return encodeXLSX([]xlsxSheet{
		{
			Name:    copy.sheetPatch,
			Headers: []string{copy.colNum, copy.colName, copy.colBrand, copy.colType, copy.colUniverse, copy.colStart, copy.colEnd, copy.colChannels, copy.colMode, copy.colRole, copy.colConflict, copy.colNotes},
			Rows:    patchRows,
			ColWidths: []float64{
				6, 22, 16, 18, 14, 10, 10, 10, 10, 22, 16, 42,
			},
		},
		{
			Name:    copy.sheetChannels,
			Headers: []string{copy.colNum, copy.colFixture, copy.colBrand, copy.colOffset, copy.colAddress, copy.colFunction, copy.colDefault, copy.colRanges},
			Rows:    channelRows,
			ColWidths: []float64{
				6, 22, 16, 10, 14, 22, 10, 48,
			},
		},
	})
}

func patchListRange(fx DMXFixture) (start, end, count int) {
	start = fx.DMXAddress
	if start < 1 {
		start = 1
	}
	if start > 512 {
		start = 512
	}
	count = patchListFootprint(fx)
	end = start + count - 1
	if end > 512 {
		end = 512
		count = end - start + 1
	}
	return start, end, count
}

func patchListFootprint(fx DMXFixture) int {
	maxOff := 1
	if len(fx.Channels) == 0 {
		return 1
	}
	for _, ch := range fx.Channels {
		if ch.Channel > maxOff {
			maxOff = ch.Channel
		}
	}
	if maxOff < 1 {
		return 1
	}
	return maxOff
}

func patchListOccupancy(fixtures []DMXFixture) map[int][]string {
	occ := make(map[int][]string)
	for _, fx := range fixtures {
		start, end, _ := patchListRange(fx)
		for s := start; s <= end; s++ {
			occ[s] = append(occ[s], fx.ID)
		}
	}
	return occ
}

func patchListFixtureConflicts(fx DMXFixture, occupancy map[int][]string) bool {
	start, end, _ := patchListRange(fx)
	for s := start; s <= end; s++ {
		if len(occupancy[s]) > 1 {
			return true
		}
	}
	return false
}

func patchListFixtureType(t DMXFixtureType, loc patchListCopy) string {
	key := string(t)
	if label, ok := loc.fixtureTypes[key]; ok {
		return label
	}
	return humanizeCamelIdent(key)
}

func patchListRole(fx DMXFixture, byID map[string]DMXFixture, hasSlaves map[string]bool, loc patchListCopy) string {
	masterID := strings.TrimSpace(fx.MasterFixtureID)
	if masterID != "" {
		masterName := masterID
		if master, ok := byID[masterID]; ok && strings.TrimSpace(master.Name) != "" {
			masterName = master.Name
		}
		return fmt.Sprintf(loc.roleSlaveOf, masterName)
	}
	if hasSlaves[fx.ID] {
		return loc.roleMaster
	}
	return loc.roleStandalone
}

func patchListChannelRows(num string, fx DMXFixture, start, footprint int, loc patchListCopy) [][]string {
	byOffset := make(map[int]DMXChannel, len(fx.Channels))
	for _, ch := range fx.Channels {
		if ch.Channel < 1 {
			continue
		}
		if _, exists := byOffset[ch.Channel]; !exists {
			byOffset[ch.Channel] = ch
		}
	}
	rows := make([][]string, 0, footprint)
	for off := 1; off <= footprint; off++ {
		addr := start + off - 1
		if addr > 512 {
			break
		}
		ch, ok := byOffset[off]
		function := loc.unusedChannel
		def := ""
		ranges := ""
		if ok {
			function = patchListChannelFunction(ch)
			if ch.DefaultValue != nil {
				def = strconv.Itoa(*ch.DefaultValue)
			}
			ranges = patchListChannelRanges(ch.Properties)
		}
		rows = append(rows, []string{
			num,
			fx.Name,
			fx.Brand,
			strconv.Itoa(off),
			padDMXAddress(addr),
			function,
			def,
			ranges,
		})
	}
	return rows
}

func patchListChannelFunction(ch DMXChannel) string {
	if label := channelPropertyString(ch.Properties, "label"); label != "" {
		return label
	}
	if ch.Type == "custom" {
		if name := channelPropertyString(ch.Properties, "name"); name != "" {
			return name
		}
	}
	if ch.Type == "" {
		return "Custom"
	}
	return humanizeCamelIdent(ch.Type)
}

func patchListChannelRanges(props map[string]any) string {
	raw, ok := props["entries"]
	if !ok {
		return linearRangeNote(props)
	}
	arr, ok := raw.([]any)
	if !ok || len(arr) == 0 {
		return linearRangeNote(props)
	}
	parts := make([]string, 0, len(arr))
	for i, item := range arr {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		from, _ := intFromAny(m["from"])
		to, hasTo := intFromAny(m["to"])
		if !hasTo {
			to = 255
		}
		label := strings.TrimSpace(fmt.Sprint(m["label"]))
		if label == "" || label == "<nil>" {
			label = strings.TrimSpace(fmt.Sprint(m["goboName"]))
		}
		if label == "" || label == "<nil>" {
			label = strings.TrimSpace(fmt.Sprint(m["mode"]))
		}
		if label == "" || label == "<nil>" {
			label = fmt.Sprintf("Slot %d", i+1)
		}
		parts = append(parts, fmt.Sprintf("%s %03d–%03d", label, from, to))
	}
	if len(parts) == 0 {
		return linearRangeNote(props)
	}
	return strings.Join(parts, "; ")
}

func linearRangeNote(props map[string]any) string {
	minV, hasMin := intFromAny(props["min"])
	maxV, hasMax := intFromAny(props["max"])
	if !hasMin && !hasMax {
		return ""
	}
	if !hasMin {
		minV = 0
	}
	if !hasMax {
		maxV = 255
	}
	if minV == 0 && maxV == 255 {
		return ""
	}
	return fmt.Sprintf("%d–%d", minV, maxV)
}

func channelPropertyString(props map[string]any, key string) string {
	if props == nil {
		return ""
	}
	raw, ok := props[key]
	if !ok {
		return ""
	}
	s, ok := raw.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(s)
}

func padDMXAddress(n int) string {
	if n < 1 {
		n = 1
	}
	if n > 512 {
		n = 512
	}
	return fmt.Sprintf("%03d", n)
}

func humanizeCamelIdent(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}
	var b strings.Builder
	runes := []rune(s)
	for i, r := range runes {
		if i > 0 && unicode.IsUpper(r) && (unicode.IsLower(runes[i-1]) || (i+1 < len(runes) && unicode.IsLower(runes[i+1]))) {
			b.WriteByte(' ')
		}
		if i == 0 {
			b.WriteRune(unicode.ToUpper(r))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}
