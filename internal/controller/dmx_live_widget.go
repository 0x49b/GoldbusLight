package controller

import "strings"

type dmxLiveWidget string

const (
	liveWidgetAuto         dmxLiveWidget = "auto"
	liveWidgetHidden       dmxLiveWidget = "hidden"
	liveWidgetSlider       dmxLiveWidget = "slider"
	liveWidgetSlotSlider   dmxLiveWidget = "slotSlider"
	liveWidgetButtons      dmxLiveWidget = "buttons"
	liveWidgetButtonSlider dmxLiveWidget = "buttonSlider"
	liveWidgetColorWheel   dmxLiveWidget = "colorWheel"
	liveWidgetGoboWheel    dmxLiveWidget = "goboWheel"
	liveWidgetShutterModes dmxLiveWidget = "shutterModes"
)

func readLiveWidgetOverride(props map[string]any) dmxLiveWidget {
	if props == nil {
		return liveWidgetAuto
	}
	raw, ok := props["liveWidget"].(string)
	if !ok {
		return liveWidgetAuto
	}
	switch strings.TrimSpace(raw) {
	case "hidden", "slider", "slotSlider", "buttons", "buttonSlider", "colorWheel", "goboWheel", "shutterModes":
		return dmxLiveWidget(strings.TrimSpace(raw))
	default:
		return liveWidgetAuto
	}
}

func isFineChannelType(t string) bool {
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "panfine", "tiltfine", "dimmerfine", "zoomfine", "focusfine", "irisfine", "frostfine", "goborotationfine":
		return true
	default:
		return false
	}
}

func entrySpan(from, to float64) float64 {
	if from <= to {
		return to - from + 1
	}
	return from - to + 1
}

func entriesLookDiscrete(entries []liveFixtureEntry) bool {
	if len(entries) == 0 || len(entries) > 12 {
		return false
	}
	for _, e := range entries {
		if entrySpan(e.from, e.to) > 20 {
			return false
		}
	}
	return true
}

func entriesLookLikeOffPlusVolume(entries []liveFixtureEntry) bool {
	hasOff := false
	hasVolume := false
	for _, e := range entries {
		lo := int(e.from)
		hi := int(e.to)
		if lo > hi {
			lo, hi = hi, lo
		}
		if lo == 0 && hi == 0 {
			hasOff = true
			continue
		}
		if hi >= 1 {
			hasVolume = true
		}
	}
	return hasOff && hasVolume
}

func entriesHaveWideRange(entries []liveFixtureEntry) bool {
	for _, e := range entries {
		if entrySpan(e.from, e.to) > 20 {
			return true
		}
	}
	return false
}

func inferLiveWidget(ch DMXChannel) dmxLiveWidget {
	typ := strings.TrimSpace(ch.Type)
	if isFineChannelType(typ) {
		return liveWidgetHidden
	}
	props := ch.Properties
	entries := liveInitParseEntries(props)

	switch strings.ToLower(typ) {
	case "colorwheel":
		if len(entries) > 0 {
			return liveWidgetColorWheel
		}
		return liveWidgetSlider
	case "gobowheel":
		if len(entries) > 0 {
			return liveWidgetGoboWheel
		}
		return liveWidgetHidden
	case "shutterstrobe":
		if len(entries) > 0 {
			return liveWidgetShutterModes
		}
		return liveWidgetSlider
	case "frost":
		if len(entries) > 0 {
			if entriesHaveWideRange(entries) {
				return liveWidgetSlotSlider
			}
			return liveWidgetButtons
		}
		return liveWidgetSlider
	case "movementspeed", "goborotation", "goborotationfine", "goboshake", "goboindexing", "goboindexingfine",
		"prism", "prismrotation", "prismindexing", "prismindexingfine", "custom":
		if len(entries) > 0 {
			if entriesLookDiscrete(entries) {
				return liveWidgetButtons
			}
			return liveWidgetSlotSlider
		}
		return liveWidgetSlider
	case "fog":
		if len(entries) > 0 && entriesLookLikeOffPlusVolume(entries) {
			return liveWidgetButtonSlider
		}
		if len(entries) > 0 {
			if entriesLookDiscrete(entries) {
				return liveWidgetButtons
			}
			return liveWidgetSlotSlider
		}
		return liveWidgetSlider
	case "pan", "tilt", "infinitepan", "infinitetilt", "dimmer", "zoom", "focus", "iris":
		if len(entries) > 0 {
			if entriesLookDiscrete(entries) {
				return liveWidgetButtons
			}
			return liveWidgetSlotSlider
		}
		return liveWidgetSlider
	default:
		if len(entries) > 0 {
			if entriesLookDiscrete(entries) {
				return liveWidgetButtons
			}
			return liveWidgetSlotSlider
		}
		return liveWidgetHidden
	}
}

func resolveLiveWidget(ch DMXChannel) dmxLiveWidget {
	override := readLiveWidgetOverride(ch.Properties)
	if override != liveWidgetAuto && override != "" {
		return override
	}
	return inferLiveWidget(ch)
}

func findCoarseForFine(fixture DMXFixture, fine *DMXChannel) *DMXChannel {
	if fine == nil {
		return nil
	}
	typ := strings.ToLower(strings.TrimSpace(fine.Type))
	for i := range fixture.Channels {
		c := &fixture.Channels[i]
		switch typ {
		case "panfine":
			if strings.EqualFold(c.Type, "pan") || strings.EqualFold(c.Type, "infinitePan") {
				return c
			}
		case "tiltfine":
			if strings.EqualFold(c.Type, "tilt") || strings.EqualFold(c.Type, "infiniteTilt") {
				return c
			}
		}
	}
	return nil
}

func liveInitFindOffButtonSlot(entries []liveFixtureEntry, kinds []string) int {
	for i := range entries {
		if i >= len(kinds) || kinds[i] != "button" {
			continue
		}
		e := entries[i]
		lo := int(e.from)
		hi := int(e.to)
		if lo > hi {
			lo, hi = hi, lo
		}
		hay := strings.ToLower(e.mode + " " + e.label)
		if lo == 0 && hi == 0 {
			return i
		}
		if strings.Contains(hay, "off") {
			return i
		}
	}
	return -1
}

func liveInitParseEntrySlotKinds(props map[string]any, entries []liveFixtureEntry) []string {
	var raw []any
	if props != nil {
		if r, ok := props["entries"].([]any); ok {
			raw = r
		}
	}
	out := make([]string, len(entries))
	for i := range entries {
		kind := "slider"
		if i < len(raw) {
			if m, ok := raw[i].(map[string]any); ok {
				if s, ok := m["liveSlotKind"].(string); ok {
					s = strings.TrimSpace(s)
					if s == "button" || s == "slider" {
						kind = s
						out[i] = kind
						continue
					}
				}
			}
		}
		e := entries[i]
		lo := int(e.from)
		hi := int(e.to)
		if lo > hi {
			lo, hi = hi, lo
		}
		span := hi - lo + 1
		hay := strings.ToLower(e.mode + " " + e.label)
		if lo == 0 && hi == 0 || strings.Contains(hay, "off") && span <= 1 || span <= 3 {
			kind = "button"
		}
		out[i] = kind
	}
	return out
}

func liveInitFirstSliderSlot(kinds []string) int {
	for i, k := range kinds {
		if k == "slider" {
			return i
		}
	}
	return -1
}

func liveInitButtonSliderByte(props map[string]any, entries []liveFixtureEntry) int {
	if len(entries) == 0 {
		return liveInitLinearByte(props, 0)
	}
	kinds := liveInitParseEntrySlotKinds(props, entries)
	offIdx := liveInitFindOffButtonSlot(entries, kinds)
	if offIdx >= 0 {
		return 0
	}
	sliderIdx := liveInitFirstSliderSlot(kinds)
	if sliderIdx >= 0 {
		return liveInitSlotByte(entries, sliderIdx, 0)
	}
	return 0
}

func liveInitOutputForChannel(fixture DMXFixture, ch *DMXChannel) int {
	if ch == nil {
		return 0
	}
	if v, ok := explicitDefaultOutputByte(ch); ok {
		return v
	}
	widget := resolveLiveWidget(*ch)
	props := ch.Properties
	entries := liveInitParseEntries(props)

	switch widget {
	case liveWidgetHidden:
		coarse := findCoarseForFine(fixture, ch)
		if coarse != nil {
			return liveInitOutputForChannel(fixture, coarse)
		}
		return 0
	case liveWidgetSlider:
		linear := 0.5
		if strings.EqualFold(ch.Type, "dimmer") {
			linear = 1.0
		}
		if strings.EqualFold(ch.Type, "frost") {
			linear = 0.0
		}
		return liveInitLinearByte(props, linear)
	case liveWidgetShutterModes:
		idx := liveInitPickShutterEntryIndex(entries, "open")
		return liveInitSlotMid(entries, idx)
	case liveWidgetColorWheel, liveWidgetGoboWheel, liveWidgetButtons:
		return liveInitSlotMid(entries, 0)
	case liveWidgetSlotSlider:
		if strings.EqualFold(ch.Type, "frost") && len(entries) > 0 {
			pool := liveInitFrostEntriesForCurve(entries, "linear")
			usePool := pool
			if len(usePool) == 0 {
				usePool = entries
			}
			return liveInitSlotMid(usePool, 0)
		}
		if len(entries) > 0 {
			return liveInitSlotByte(entries, 0, 0.5)
		}
		return liveInitLinearByte(props, 0.5)
	case liveWidgetButtonSlider:
		return liveInitButtonSliderByte(props, entries)
	default:
		return liveInitLinearByte(props, 0.5)
	}
}

func explicitDefaultOutputByte(ch *DMXChannel) (int, bool) {
	if ch == nil || ch.DefaultValue == nil {
		return 0, false
	}
	return clampDMXByte(*ch.DefaultValue), true
}
