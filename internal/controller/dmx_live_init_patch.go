package controller

import (
	"goldbus/internal/dmx"
	"math"
	"slices"
	"strings"
)

// buildDMXLiveInitUpdates mirrors frontend defaultDmxLiveControlState + buildDmxLivePatch
// so DMX live output starts from the same fixture "init" values as the live tab UI.
func buildDMXLiveInitUpdates(fixtures []DMXFixture) []dmx.DMXOutputUpdate {
	byAddr := map[int]int{}
	for _, fx := range fixtures {
		for _, u := range buildDMXLiveInitUpdatesForFixture(fx) {
			if u.Address < 1 || u.Address > 512 {
				continue
			}
			byAddr[u.Address] = u.Value
		}
	}
	if len(byAddr) == 0 {
		return nil
	}
	addrs := make([]int, 0, len(byAddr))
	for a := range byAddr {
		addrs = append(addrs, a)
	}
	slices.Sort(addrs)
	out := make([]dmx.DMXOutputUpdate, 0, len(addrs))
	for _, a := range addrs {
		out = append(out, dmx.DMXOutputUpdate{Address: a, Value: byAddr[a]})
	}
	return out
}

func buildDMXLiveInitUpdatesForFixture(fixture DMXFixture) []dmx.DMXOutputUpdate {
	base := fixture.DMXAddress
	if base < 1 || base > 512 {
		base = 1
	}
	chans := fixture.Channels

	const (
		pan01       = 0.5
		tilt01      = 0.5
		dimmer01    = 1.0
		colorIdx    = 0
		goboIdx     = 0
		shutterMode = "open"
		msIdx       = 0
		focus01     = 0.5
		zoom01      = 0.5
		iris01      = 0.5
		frost01     = 0.0
		fog01       = 0.0
		frostCurve  = "linear"
	)

	var out []dmx.DMXOutputUpdate
	push := func(ch *DMXChannel, value int) {
		if ch == nil || ch.Channel < 1 {
			return
		}
		addr := base + ch.Channel - 1
		if addr < 1 || addr > 512 {
			return
		}
		out = append(out, dmx.DMXOutputUpdate{Address: addr, Value: clampDMXByte(value)})
	}

	firstCh := func(typ string) *DMXChannel {
		for i := range chans {
			if strings.EqualFold(strings.TrimSpace(chans[i].Type), typ) {
				return &chans[i]
			}
		}
		return nil
	}
	allCh := func(typ string) []*DMXChannel {
		var res []*DMXChannel
		for i := range chans {
			if strings.EqualFold(strings.TrimSpace(chans[i].Type), typ) {
				res = append(res, &chans[i])
			}
		}
		return res
	}

	if ch := firstCh("pan"); ch != nil {
		push(ch, liveInitLinearByte(ch.Properties, pan01))
	}
	if ch := firstCh("infinitePan"); ch != nil && firstCh("pan") == nil {
		push(ch, liveInitLinearByte(ch.Properties, pan01))
	}
	if ch := firstCh("tilt"); ch != nil {
		push(ch, liveInitLinearByte(ch.Properties, tilt01))
	}
	if ch := firstCh("infiniteTilt"); ch != nil && firstCh("tilt") == nil {
		push(ch, liveInitLinearByte(ch.Properties, tilt01))
	}
	if ch := firstCh("dimmer"); ch != nil {
		push(ch, liveInitLinearByte(ch.Properties, dimmer01))
	}

	if ch := firstCh("colorWheel"); ch != nil {
		entries := liveInitParseEntries(ch.Properties)
		push(ch, liveInitSlotMid(entries, colorIdx))
	}

	gobos := allCh("goboWheel")
	if len(gobos) > 0 {
		entries := liveInitParseEntries(gobos[0].Properties)
		push(gobos[0], liveInitSlotMid(entries, goboIdx))
	}
	if len(gobos) > 1 {
		entries := liveInitParseEntries(gobos[1].Properties)
		push(gobos[1], liveInitSlotMid(entries, goboIdx))
	}

	if ch := firstCh("shutterStrobe"); ch != nil {
		entries := liveInitParseEntries(ch.Properties)
		idx := liveInitPickShutterEntryIndex(entries, shutterMode)
		push(ch, liveInitSlotMid(entries, idx))
	}

	if ch := firstCh("movementSpeed"); ch != nil {
		entries := liveInitParseEntries(ch.Properties)
		push(ch, liveInitSlotMid(entries, msIdx))
	}

	if ch := firstCh("focus"); ch != nil {
		push(ch, liveInitLinearByte(ch.Properties, focus01))
	}
	if ch := firstCh("zoom"); ch != nil {
		push(ch, liveInitLinearByte(ch.Properties, zoom01))
	}
	if ch := firstCh("iris"); ch != nil {
		push(ch, liveInitLinearByte(ch.Properties, iris01))
	}

	if ch := firstCh("fog"); ch != nil && (fixture.Type == DMXFixtureTypeSmoke || fixture.Type == DMXFixtureTypeHazer) {
		if r := liveInitSmokeFogOutputRange(ch.Properties); r != nil {
			push(ch, liveInitSmokeFogByte(ch.Properties, fog01))
		} else {
			push(ch, liveInitLinearByte(ch.Properties, fog01))
		}
	}

	if ch := firstCh("frost"); ch != nil {
		entries := liveInitParseEntries(ch.Properties)
		if len(entries) > 0 {
			pool := liveInitFrostEntriesForCurve(entries, frostCurve)
			usePool := pool
			if len(usePool) == 0 {
				usePool = entries
			}
			maxI := max(0, len(usePool)-1)
			idx := int(math.Round(clampFloat(frost01, 0, 1) * float64(maxI)))
			push(ch, liveInitSlotMid(usePool, idx))
		} else {
			push(ch, liveInitLinearByte(ch.Properties, frost01))
		}
	}

	for i := range chans {
		ch := &chans[i]
		if !strings.EqualFold(strings.TrimSpace(ch.Type), "custom") {
			continue
		}
		push(ch, liveInitCustomOutputByte(ch))
	}

	touched := map[int]struct{}{}
	for _, u := range out {
		touched[u.Address] = struct{}{}
	}
	for _, ch := range chans {
		if ch.Channel < 1 {
			continue
		}
		addr := base + ch.Channel - 1
		if addr < 1 || addr > 512 {
			continue
		}
		if _, ok := touched[addr]; ok {
			continue
		}
		out = append(out, dmx.DMXOutputUpdate{Address: addr, Value: 0})
	}

	slices.SortFunc(out, func(a, b dmx.DMXOutputUpdate) int {
		if a.Address < b.Address {
			return -1
		}
		if a.Address > b.Address {
			return 1
		}
		return 0
	})
	return out
}

func liveInitCustomOutputByte(ch *DMXChannel) int {
	props := ch.Properties
	entries := liveInitParseEntries(props)
	if len(entries) > 0 {
		return liveInitSlotByte(entries, 0, 0.5)
	}
	return liveInitLinearByte(props, 0.5)
}

func clampFloat(n, lo, hi float64) float64 {
	if n < lo {
		return lo
	}
	if n > hi {
		return hi
	}
	return n
}

func liveInitLinearByte(props map[string]any, t01 float64) int {
	min := 0.0
	max := 255.0
	if props != nil {
		if v, ok := intFromAny(props["min"]); ok {
			min = float64(v)
		}
		if v, ok := intFromAny(props["max"]); ok {
			max = float64(v)
		}
	}
	t := clampFloat(t01, 0, 1)
	return clampDMXByte(int(math.Round(min + t*(max-min))))
}

type liveFixtureEntry struct {
	from, to    float64
	mode, label string
}

func liveInitParseEntries(props map[string]any) []liveFixtureEntry {
	if props == nil {
		return nil
	}
	raw, ok := props["entries"].([]any)
	if !ok || len(raw) == 0 {
		return nil
	}
	out := make([]liveFixtureEntry, 0, len(raw))
	for _, item := range raw {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		from := 0.0
		to := 255.0
		if v, ok := intFromAny(m["from"]); ok {
			from = float64(v)
		}
		if v, ok := intFromAny(m["to"]); ok {
			to = float64(v)
		}
		e := liveFixtureEntry{from: from, to: to}
		if s, ok := m["label"].(string); ok {
			e.label = s
		}
		if s, ok := m["mode"].(string); ok {
			e.mode = s
		}
		out = append(out, e)
	}
	return out
}

func liveInitSlotMid(entries []liveFixtureEntry, idx int) int {
	if len(entries) == 0 {
		return 0
	}
	i := int(math.Floor(clampFloat(float64(idx), 0, float64(len(entries)-1))))
	e := entries[i]
	return clampDMXByte(int(math.Round((e.from + e.to) / 2)))
}

func liveInitSlotByte(entries []liveFixtureEntry, slotIdx int, t01 float64) int {
	if len(entries) == 0 {
		return clampDMXByte(int(math.Round(clampFloat(t01, 0, 1) * 255)))
	}
	i := int(math.Floor(clampFloat(float64(slotIdx), 0, float64(len(entries)-1))))
	e := entries[i]
	t := clampFloat(t01, 0, 1)
	return clampDMXByte(int(math.Round(e.from + t*(e.to-e.from))))
}

func liveInitPickShutterEntryIndex(entries []liveFixtureEntry, mode string) int {
	want := map[string][]string{
		"open":    {"open", "shutter open", "full"},
		"closed":  {"close", "closed", "blackout"},
		"strobe":  {"strobe", "strob", "random strobe"},
		"pulse":   {"pulse", "ramp", "fade"},
	}
	keys, ok := want[strings.ToLower(strings.TrimSpace(mode))]
	if !ok {
		keys = want["open"]
	}
	lowKeys := make([]string, len(keys))
	for i, k := range keys {
		lowKeys[i] = strings.ToLower(k)
	}
	for i := range entries {
		e := entries[i]
		hay := strings.ToLower(e.mode + " " + e.label)
		for _, w := range lowKeys {
			if strings.Contains(hay, w) {
				return i
			}
		}
	}
	fallback := map[string]int{
		"open":    0,
		"closed":  minInt(1, maxInt(0, len(entries)-1)),
		"strobe":  minInt(2, maxInt(0, len(entries)-1)),
		"pulse":   minInt(3, maxInt(0, len(entries)-1)),
	}
	fb := fallback[strings.ToLower(strings.TrimSpace(mode))]
	if fb < 0 {
		fb = 0
	}
	return int(clampFloat(float64(fb), 0, float64(maxInt(0, len(entries)-1))))
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func liveInitFrostEntriesForCurve(entries []liveFixtureEntry, curve string) []liveFixtureEntry {
	var out []liveFixtureEntry
	for _, e := range entries {
		m := strings.ToLower(e.mode)
		l := strings.ToLower(e.label)
		if curve == "pulse" {
			if strings.Contains(m, "pulse") || strings.Contains(l, "pulse") {
				out = append(out, e)
			}
			continue
		}
		if strings.Contains(m, "linear") || strings.Contains(l, "linear") ||
			(!strings.Contains(m, "pulse") && !strings.Contains(l, "pulse")) {
			out = append(out, e)
		}
	}
	if len(out) == 0 {
		return entries
	}
	return out
}

type smokeFogRange struct {
	min, max int
}

func liveInitSmokeFogOutputRange(props map[string]any) *smokeFogRange {
	if props == nil {
		return nil
	}
	raw, ok := props["entries"].([]any)
	if !ok || len(raw) == 0 {
		return nil
	}
	hasOff := false
	minV := 255
	maxV := 1
	for _, item := range raw {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		fromRaw, okF := intFromAny(m["from"])
		toRaw, okT := intFromAny(m["to"])
		if !okF {
			fromRaw = toRaw
		}
		if !okT {
			toRaw = fromRaw
		}
		if !okF && !okT {
			continue
		}
		if (fromRaw == 0 && toRaw == 0) || (toRaw == 0 && fromRaw == 0) {
			hasOff = true
			continue
		}
		from := fromRaw
		to := toRaw
		if from == 0 && !okT {
			continue
		}
		lo := minInt(from, to)
		hi := maxInt(from, to)
		if hi >= 1 {
			if lo < minV {
				minV = maxInt(1, lo)
			}
			if hi > maxV {
				maxV = hi
			}
		}
	}
	if !hasOff {
		return nil
	}
	if maxV < minV {
		return &smokeFogRange{min: 1, max: 255}
	}
	return &smokeFogRange{min: clampDMXByte(minV), max: clampDMXByte(maxV)}
}

func liveInitSmokeFogByte(props map[string]any, t01 float64) int {
	r := liveInitSmokeFogOutputRange(props)
	if r == nil {
		return liveInitLinearByte(props, t01)
	}
	t := clampFloat(t01, 0, 1)
	if t <= 0 {
		return 0
	}
	return clampDMXByte(int(math.Round(float64(r.min) + t*float64(r.max-r.min))))
}
