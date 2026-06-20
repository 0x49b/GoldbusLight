import type {DMXChannelType, DMXFixture, JSONMap} from "../types/controller";
import {isColorWheelScrollSlot} from "./colorWheelSlot";
import {
    byteToLinear01,
    legacyColorWheelIdx,
    legacyDimmer01,
    legacyFocus01,
    legacyPan01,
    legacyTilt01,
    parseFixtureEntries,
    smokeFogOutputRange,
    type DMXLiveControlState,
} from "./dmxLiveMap";

function firstChannel(channels: DMXFixture["channels"], type: DMXChannelType) {
    return channels.find((c) => c.type === type);
}

function dmxChannelAddress(fixture: DMXFixture, channelOffset: number): number | null {
    const base = fixture.dmxAddress;
    if (!Number.isFinite(base) || base < 1 || base > 512) {
        return null;
    }
    const addr = Math.round(base) + channelOffset - 1;
    if (addr < 1 || addr > 512) {
        return null;
    }
    return addr;
}

function universeValue(universe: number[] | undefined, addr: number): number | undefined {
    if (!universe || universe.length < 512 || addr < 1 || addr > 512) {
        return undefined;
    }
    const v = universe[addr - 1];
    if (typeof v !== "number" || !Number.isFinite(v)) {
        return undefined;
    }
    return Math.max(0, Math.min(255, Math.round(v)));
}

export function byteTo01(value: number, props: JSONMap | undefined): number {
    return byteToLinear01(value, props);
}

export type FixturePreviewDrive = {
    pan01: number;
    tilt01: number;
    dimmer01: number;
    focus01: number;
    fog01: number;
    beamColor?: string;
    beamRainbow: boolean;
};

function fixtureEntryForByte(entries: ReturnType<typeof parseFixtureEntries>, value: number) {
    return entries.find((entry) => value >= entry.from && value <= entry.to);
}

function fixtureEntryForIndex(entries: ReturnType<typeof parseFixtureEntries>, idx: number) {
    if (entries.length === 0) {
        return undefined;
    }
    return entries[Math.max(0, Math.min(entries.length - 1, Math.floor(idx)))];
}

type PreviewColorEntry = ReturnType<typeof parseFixtureEntries>[number] | undefined;

function isRainbowEntry(entry: PreviewColorEntry): boolean {
    return isColorWheelScrollSlot(entry);
}

function previewBeamColor(entry: PreviewColorEntry): string | undefined {
    const raw = entry?.color?.trim();
    if (!raw) {
        return undefined;
    }
    if (isRainbowEntry(entry) || raw.toLowerCase().includes("scroll")) {
        return undefined;
    }
    return raw;
}

function smokeFogByteTo01(props: JSONMap | undefined, value: number): number {
    const range = smokeFogOutputRange(props);
    if (!range) {
        return byteTo01(value, props);
    }
    if (value <= 0) {
        return 0;
    }
    if (range.max === range.min) {
        return value >= range.min ? 1 : 0;
    }
    return Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
}

export function fixturePreviewDrive(
    fixture: DMXFixture,
    universe: number[] | undefined,
    fallback: DMXLiveControlState,
): FixturePreviewDrive {
    const panCh = firstChannel(fixture.channels, "pan");
    const tiltCh = firstChannel(fixture.channels, "tilt");
    const dimCh = firstChannel(fixture.channels, "dimmer");
    const fogCh = firstChannel(fixture.channels, "fog");
    const focusCh = firstChannel(fixture.channels, "focus");
    const colorWheelCh = firstChannel(fixture.channels, "colorWheel");

    let pan01 = legacyPan01(fixture, fallback);
    let tilt01 = legacyTilt01(fixture, fallback);
    let dimmer01 = legacyDimmer01(fixture, fallback);
    let focus01 = legacyFocus01(fixture, fallback);
    let fog01 = fallback.fog01;
    let beamColor: string | undefined;
    let beamRainbow = false;

    if (universe && universe.length >= 512) {
        if (panCh && Number.isFinite(panCh.channel)) {
            const addr = dmxChannelAddress(fixture, Math.round(panCh.channel));
            const raw = addr != null ? universeValue(universe, addr) : undefined;
            if (raw !== undefined) {
                pan01 = byteTo01(raw, panCh.properties as JSONMap);
            }
        }
        if (tiltCh && Number.isFinite(tiltCh.channel)) {
            const addr = dmxChannelAddress(fixture, Math.round(tiltCh.channel));
            const raw = addr != null ? universeValue(universe, addr) : undefined;
            if (raw !== undefined) {
                tilt01 = byteTo01(raw, tiltCh.properties as JSONMap);
            }
        }
        if (dimCh && Number.isFinite(dimCh.channel)) {
            const addr = dmxChannelAddress(fixture, Math.round(dimCh.channel));
            const raw = addr != null ? universeValue(universe, addr) : undefined;
            if (raw !== undefined) {
                dimmer01 = byteTo01(raw, dimCh.properties as JSONMap);
            }
        } else if (fogCh && Number.isFinite(fogCh.channel)) {
            const addr = dmxChannelAddress(fixture, Math.round(fogCh.channel));
            const raw = addr != null ? universeValue(universe, addr) : undefined;
            if (raw !== undefined) {
                fog01 = smokeFogByteTo01(fogCh.properties as JSONMap | undefined, raw);
                dimmer01 = fog01;
            }
        }
        if (focusCh && Number.isFinite(focusCh.channel)) {
            const addr = dmxChannelAddress(fixture, Math.round(focusCh.channel));
            const raw = addr != null ? universeValue(universe, addr) : undefined;
            if (raw !== undefined) {
                focus01 = byteTo01(raw, focusCh.properties as JSONMap);
            }
        }
        if (colorWheelCh && Number.isFinite(colorWheelCh.channel)) {
            const entries = parseFixtureEntries(colorWheelCh.properties as JSONMap | undefined);
            const addr = dmxChannelAddress(fixture, Math.round(colorWheelCh.channel));
            const raw = addr != null ? universeValue(universe, addr) : undefined;
            const entry = raw !== undefined
                ? fixtureEntryForByte(entries, raw)
                : fixtureEntryForIndex(entries, legacyColorWheelIdx(fixture, fallback));
            beamColor = previewBeamColor(entry);
            beamRainbow = isRainbowEntry(entry);
        }
    } else if (colorWheelCh) {
        const entries = parseFixtureEntries(colorWheelCh.properties as JSONMap | undefined);
        const entry = fixtureEntryForIndex(entries, legacyColorWheelIdx(fixture, fallback));
        beamColor = previewBeamColor(entry);
        beamRainbow = isRainbowEntry(entry);
    }

    return {pan01, tilt01, dimmer01, focus01, fog01, beamColor, beamRainbow};
}
