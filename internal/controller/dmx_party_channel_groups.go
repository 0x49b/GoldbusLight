package controller

import "strings"

const (
	partyChannelGroupMovement = "movement"
	partyChannelGroupColor    = "color"
	partyChannelGroupGobo     = "gobo"
	partyChannelGroupBeam     = "beam"
	partyChannelGroupEffects  = "effects"
)

func partyChannelGroupForType(normType string) string {
	switch normType {
	case "pan", "panfine", "tilt", "tiltfine", "infinitepan", "infinitetilt", "movementspeed":
		return partyChannelGroupMovement
	case "colorwheel", "colorcomponent", "colortemperature", "greensaturation", "xfadetocolor":
		return partyChannelGroupColor
	case "gobowheel", "goboindexing", "goboindexingfine", "goborotation", "goborotationfine", "goboshake":
		return partyChannelGroupGobo
	case "dimmer", "dimmerfine", "shutterstrobe", "zoom", "zoomfine", "focus", "focusfine",
		"iris", "irisfine", "frost", "frostfine", "onoff", "lamp":
		return partyChannelGroupBeam
	case "prism", "prismindexing", "prismindexingfine", "prismrotation":
		return partyChannelGroupEffects
	default:
		return ""
	}
}

func partyChannelGroupEnabled(cfg DMXPartyConfig, group string) bool {
	if group == "" {
		return true
	}
	if cfg.ChannelGroups == nil {
		return true
	}
	if v, ok := cfg.ChannelGroups[group]; ok {
		return v
	}
	return true
}

func partyChannelGroupAllowed(cfg DMXPartyConfig, normType string) bool {
	group := partyChannelGroupForType(strings.ToLower(strings.TrimSpace(normType)))
	return partyChannelGroupEnabled(cfg, group)
}
