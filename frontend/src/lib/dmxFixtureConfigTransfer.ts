import type {
    DMXChannel,
    DMXChannelType,
    DMXFixtureType,
    JSONMap,
    UpsertDMXFixtureInput,
} from "@/types/controller";

const FIXTURE_CONFIG_VERSION = 1;

const FIXTURE_TYPES = new Set<DMXFixtureType>([
    "colorChanger",
    "dimmer",
    "effect",
    "fan",
    "flower",
    "hazer",
    "laser",
    "ledBarBeams",
    "ledBarPixels",
    "movingHead",
    "other",
    "scanner",
    "smoke",
    "strobe",
]);

const CHANNEL_TYPES = new Set<DMXChannelType>([
    "pan",
    "panFine",
    "tilt",
    "tiltFine",
    "infinitePan",
    "infiniteTilt",
    "movementSpeed",
    "dimmer",
    "dimmerFine",
    "colorComponent",
    "colorWheel",
    "colorTemperature",
    "colorTemperatureFine",
    "greenSaturation",
    "greenSaturationFine",
    "xfadeToColor",
    "xfadeToColorFine",
    "goboWheel",
    "goboIndexing",
    "goboIndexingFine",
    "goboRotation",
    "goboRotationFine",
    "goboShake",
    "shutterStrobe",
    "focus",
    "focusFine",
    "zoom",
    "zoomFine",
    "iris",
    "irisFine",
    "frost",
    "frostFine",
    "prism",
    "prismIndexing",
    "prismIndexingFine",
    "prismRotation",
    "onOff",
    "lamp",
    "fog",
    "timer",
    "command",
    "operatingMode",
    "custom",
]);

export type DMXFixtureConfigPayload = {
    version: typeof FIXTURE_CONFIG_VERSION;
    type: DMXFixtureType;
    brand: string;
    name: string;
    dmxAddress: number;
    movingHead: {
        maxPan: number;
        maxTilt: number;
    };
    channels: DMXChannel[];
};

export type ParseDMXFixtureConfigResult =
    | { ok: true; input: UpsertDMXFixtureInput }
    | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    return value;
}

function cloneJSONMap(value: unknown): JSONMap | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    return JSON.parse(JSON.stringify(value)) as JSONMap;
}

function cloneChannel(channel: DMXChannel): DMXChannel {
    return {
        channel: channel.channel,
        type: channel.type,
        defaultValue: typeof channel.defaultValue === "number" ? Math.max(0, Math.min(255, Math.round(channel.defaultValue))) : undefined,
        properties: cloneJSONMap(channel.properties),
    };
}

function parseChannels(raw: unknown): { channels: DMXChannel[]; error?: string } {
    if (!Array.isArray(raw) || raw.length === 0) {
        return { channels: [], error: "Fixture file must include at least one channel." };
    }

    const channels: DMXChannel[] = [];
    const seenOffsets = new Set<number>();

    for (let i = 0; i < raw.length; i += 1) {
        const item = raw[i];
        if (!isRecord(item)) {
            return { channels, error: `Channel ${i + 1} is invalid.` };
        }

        const offset = finiteNumber(item.channel);
        if (offset == null || Math.round(offset) < 1 || Math.round(offset) > 512) {
            return { channels, error: `Channel ${i + 1} has an invalid offset.` };
        }

        if (typeof item.type !== "string" || !CHANNEL_TYPES.has(item.type as DMXChannelType)) {
            return { channels, error: `Channel ${i + 1} has an unsupported type.` };
        }

        const roundedOffset = Math.round(offset);
        if (seenOffsets.has(roundedOffset)) {
            return { channels, error: `Channel offset ${roundedOffset} is used more than once.` };
        }
        seenOffsets.add(roundedOffset);

        let defaultValue: number | undefined;
        if ("defaultValue" in item && item.defaultValue !== undefined && item.defaultValue !== null) {
            const parsedDefault = finiteNumber(item.defaultValue);
            if (parsedDefault == null) {
                return { channels, error: `Channel ${i + 1} has an invalid default value.` };
            }
            const roundedDefault = Math.round(parsedDefault);
            if (roundedDefault < 0 || roundedDefault > 255) {
                return { channels, error: `Channel ${i + 1} default value must be between 0 and 255.` };
            }
            defaultValue = roundedDefault;
        }

        channels.push({
            channel: roundedOffset,
            type: item.type as DMXChannelType,
            defaultValue,
            properties: cloneJSONMap(item.properties),
        });
    }

    return { channels };
}

export function buildDMXFixtureConfigPayload(input: UpsertDMXFixtureInput): DMXFixtureConfigPayload {
    return {
        version: FIXTURE_CONFIG_VERSION,
        type: input.type,
        brand: input.brand,
        name: input.name,
        dmxAddress: input.dmxAddress,
        movingHead: {
            maxPan: input.maxPan,
            maxTilt: input.maxTilt,
        },
        channels: input.channels.map(cloneChannel),
    };
}

export function parseDMXFixtureConfigPayload(value: unknown): ParseDMXFixtureConfigResult {
    if (!isRecord(value)) {
        return { ok: false, error: "Fixture file must be a JSON object." };
    }

    if (value.version !== FIXTURE_CONFIG_VERSION) {
        return { ok: false, error: "Fixture file version is not supported." };
    }

    if (typeof value.type !== "string" || !FIXTURE_TYPES.has(value.type as DMXFixtureType)) {
        return { ok: false, error: "Fixture file has an unsupported fixture type." };
    }

    if (typeof value.brand !== "string" || typeof value.name !== "string") {
        return { ok: false, error: "Fixture file must include brand and name." };
    }

    const dmxAddress = finiteNumber(value.dmxAddress);
    if (dmxAddress == null || Math.round(dmxAddress) < 1 || Math.round(dmxAddress) > 512) {
        return { ok: false, error: "Fixture file has an invalid DMX start address." };
    }

    if (!isRecord(value.movingHead)) {
        return { ok: false, error: "Fixture file must include moving-head limits." };
    }

    const maxPan = finiteNumber(value.movingHead.maxPan);
    const maxTilt = finiteNumber(value.movingHead.maxTilt);
    if (maxPan == null || maxPan < 0 || maxTilt == null || maxTilt < 0) {
        return { ok: false, error: "Fixture file has invalid pan/tilt limits." };
    }

    const parsedChannels = parseChannels(value.channels);
    if (parsedChannels.error) {
        return { ok: false, error: parsedChannels.error };
    }

    const roundedAddress = Math.round(dmxAddress);
    const maxOffset = 512 - roundedAddress + 1;
    const overflowingChannel = parsedChannels.channels.find((channel) => channel.channel > maxOffset);
    if (overflowingChannel) {
        return {
            ok: false,
            error: `Channel offset ${overflowingChannel.channel} does not fit at DMX address ${roundedAddress}.`,
        };
    }

    return {
        ok: true,
        input: {
            type: value.type as DMXFixtureType,
            brand: value.brand,
            name: value.name,
            dmxAddress: roundedAddress,
            maxPan: Math.round(maxPan),
            maxTilt: Math.round(maxTilt),
            channels: parsedChannels.channels,
        },
    };
}

export function safeDMXFixtureConfigFilename(brand: string, name: string): string {
    const base = `${brand} ${name}`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `${base || "dmx-fixture"}.json`;
}
