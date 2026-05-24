package controller

import "strings"

func partyAllowsChannel(fixtureType DMXFixtureType, channelType string) bool {
	norm := strings.ToLower(strings.TrimSpace(channelType))
	switch fixtureType {
	case DMXFixtureTypeMovingHead, DMXFixtureTypeScanner, DMXFixtureTypeFlower:
		return partyMovingHeadChannel(norm)
	case DMXFixtureTypeColorChanger, DMXFixtureTypeLEDBarBeams, DMXFixtureTypeLEDBarPixels:
		return partyColorChangerChannel(norm)
	case DMXFixtureTypeStrobe:
		return partyStrobeChannel(norm)
	case DMXFixtureTypeLaser:
		return partyLaserChannel(norm)
	case DMXFixtureTypeSmoke, DMXFixtureTypeHazer, DMXFixtureTypeFan:
		return partyAtmosphereChannel(norm)
	case DMXFixtureTypeDimmer, DMXFixtureTypeEffect, DMXFixtureTypeOther:
		return partyConservativeChannel(norm)
	default:
		return partyMovingHeadChannel(norm)
	}
}

func partyMovingHeadChannel(t string) bool {
	switch t {
	case "pan", "panfine", "tilt", "tiltfine", "infinitepan", "infinitetilt", "movementspeed",
		"dimmer", "dimmerfine", "colorwheel", "colorcomponent", "colortemperature", "greensaturation", "xfadetocolor",
		"gobowheel", "goboindexing", "goboindexingfine", "goborotation", "goborotationfine", "goboshake",
		"shutterstrobe", "onoff", "lamp", "zoom", "zoomfine", "focus", "focusfine", "iris", "irisfine",
		"frost", "frostfine", "prism", "prismindexing", "prismindexingfine", "prismrotation":
		return true
	default:
		return false
	}
}

func partyColorChangerChannel(t string) bool {
	switch t {
	case "dimmer", "dimmerfine", "colorwheel", "colorcomponent", "colortemperature", "colortemperaturefine",
		"greensaturation", "greensaturationfine", "xfadetocolor", "xfadetocolorfine", "onoff", "lamp", "custom":
		return true
	default:
		return false
	}
}

func partyStrobeChannel(t string) bool {
	switch t {
	case "dimmer", "dimmerfine", "shutterstrobe", "onoff", "lamp":
		return true
	default:
		return false
	}
}

func partyLaserChannel(t string) bool {
	switch t {
	case "dimmer", "dimmerfine", "pan", "panfine", "tilt", "tiltfine", "onoff", "lamp":
		return true
	default:
		return false
	}
}

func partyAtmosphereChannel(t string) bool {
	switch t {
	case "onoff", "lamp", "dimmer", "dimmerfine", "fog":
		return true
	default:
		return false
	}
}

func partyConservativeChannel(t string) bool {
	switch t {
	case "dimmer", "dimmerfine", "onoff", "lamp", "colorwheel", "colorcomponent", "shutterstrobe":
		return true
	default:
		return false
	}
}
