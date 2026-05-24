import type {DMXChannel, DMXChannelType, DMXFixture, DMXFixtureType, JSONMap} from "@/types/controller.ts";

export function readCustomPartyInclude(props: JSONMap | undefined): boolean {
    return props?.partyInclude !== false;
}

const PARTY_MOVING_HEAD = new Set<DMXChannelType>([
    "pan", "panFine", "tilt", "tiltFine", "infinitePan", "infiniteTilt", "movementSpeed",
    "dimmer", "dimmerFine", "colorWheel", "colorComponent", "colorTemperature", "greenSaturation", "xfadeToColor",
    "goboWheel", "goboIndexing", "goboIndexingFine", "goboRotation", "goboRotationFine", "goboShake",
    "shutterStrobe", "onOff", "lamp", "zoom", "zoomFine", "focus", "focusFine", "iris", "irisFine",
    "frost", "frostFine", "prism", "prismIndexing", "prismIndexingFine", "prismRotation",
]);

const PARTY_COLOR_CHANGER = new Set<DMXChannelType>([
    "dimmer", "dimmerFine", "colorWheel", "colorComponent", "colorTemperature", "colorTemperatureFine",
    "greenSaturation", "greenSaturationFine", "xfadeToColor", "xfadeToColorFine", "onOff", "lamp", "custom",
]);

const PARTY_STROBE = new Set<DMXChannelType>(["dimmer", "dimmerFine", "shutterStrobe", "onOff", "lamp"]);

const PARTY_LASER = new Set<DMXChannelType>([
    "dimmer", "dimmerFine", "pan", "panFine", "tilt", "tiltFine", "onOff", "lamp",
]);

const PARTY_ATMOSPHERE = new Set<DMXChannelType>(["onOff", "lamp", "dimmer", "dimmerFine", "fog"]);

const PARTY_CONSERVATIVE = new Set<DMXChannelType>([
    "dimmer", "dimmerFine", "onOff", "lamp", "colorWheel", "colorComponent", "shutterStrobe",
]);

function partyAllowsChannelType(fixtureType: DMXFixtureType, channelType: DMXChannelType): boolean {
    switch (fixtureType) {
        case "movingHead":
        case "scanner":
        case "flower":
            return PARTY_MOVING_HEAD.has(channelType);
        case "colorChanger":
        case "ledBarBeams":
        case "ledBarPixels":
            return PARTY_COLOR_CHANGER.has(channelType);
        case "strobe":
            return PARTY_STROBE.has(channelType);
        case "laser":
            return PARTY_LASER.has(channelType);
        case "smoke":
        case "hazer":
        case "fan":
            return PARTY_ATMOSPHERE.has(channelType);
        case "dimmer":
        case "effect":
        case "other":
            return PARTY_CONSERVATIVE.has(channelType);
        default:
            return PARTY_MOVING_HEAD.has(channelType);
    }
}

export function channelIncludedInParty(fixture: DMXFixture, channel: DMXChannel): boolean {
    if (!partyAllowsChannelType(fixture.type, channel.type)) {
        return false;
    }
    if (channel.type === "custom") {
        return readCustomPartyInclude(channel.properties as JSONMap | undefined);
    }
    return true;
}

export function fixturePartyIncludesChannelType(fixture: DMXFixture, type: DMXChannelType): boolean {
    return fixture.channels.some((ch) => ch.type === type && channelIncludedInParty(fixture, ch));
}
