package controller

import (
	"math"
	"strings"
)

type dmxPartyEntry struct {
	From  int
	To    int
	Label string
	Mode  string
}

func parseDMXPartyEntries(props map[string]any) []dmxPartyEntry {
	if props == nil {
		return nil
	}
	raw, ok := props["entries"].([]any)
	if !ok || len(raw) == 0 {
		return nil
	}
	out := make([]dmxPartyEntry, 0, len(raw))
	for _, item := range raw {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		from := readPartyNumber(m["from"], 0)
		to := readPartyNumber(m["to"], 255)
		label, _ := m["label"].(string)
		mode, _ := m["mode"].(string)
		out = append(out, dmxPartyEntry{
			From:  clampDMXByte(from),
			To:    clampDMXByte(to),
			Label: strings.TrimSpace(label),
			Mode:  strings.ToLower(strings.TrimSpace(mode)),
		})
	}
	return out
}

func readPartyNumber(v any, def int) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	default:
		return def
	}
}

func partyChannelIncludeInMode(chType string, props map[string]any) bool {
	norm := strings.ToLower(strings.TrimSpace(chType))
	switch norm {
	case "custom", "gobowheel":
		// default true when unset
	default:
		return true
	}
	if props == nil {
		return true
	}
	if v, ok := props["partyInclude"].(bool); ok {
		return v
	}
	return true
}

// partyCustomIncludeInMode is kept for older call sites / tests.
func partyCustomIncludeInMode(props map[string]any) bool {
	return partyChannelIncludeInMode("custom", props)
}

func partyEntryMid(entries []dmxPartyEntry, idx int) int {
	if len(entries) == 0 {
		return 0
	}
	if idx < 0 {
		idx = 0
	}
	if idx >= len(entries) {
		idx = len(entries) - 1
	}
	e := entries[idx]
	return clampDMXByte((e.From + e.To) / 2)
}

func partySlotIndex(phase float64, count int, audioBoost float64) int {
	if count <= 0 {
		return 0
	}
	rate := 0.15 + audioBoost*0.85
	idx := int(math.Mod(phase*rate, float64(count)))
	if idx < 0 {
		idx = 0
	}
	if idx >= count {
		idx = count - 1
	}
	return idx
}

func partyShutterEntryIndex(entries []dmxPartyEntry, strobe bool) int {
	if len(entries) == 0 {
		if strobe {
			return -1
		}
		return -1
	}
	want := []string{"open", "shutter open", "full"}
	if strobe {
		want = []string{"strobe", "strob", "random strobe", "pulse", "ramp"}
	}
	for i, e := range entries {
		label := strings.ToLower(e.Label)
		mode := strings.ToLower(e.Mode)
		for _, key := range want {
			if strings.Contains(label, key) || strings.Contains(mode, key) {
				return i
			}
		}
	}
	if strobe {
		return len(entries) - 1
	}
	return 0
}
