import type {DMXChannel, DMXChannelType, DMXFixture, JSONMap} from "../types/controller";
import {isColorWheelScrollSlot} from "./colorWheelSlot";
import {
    byteToLinear01,
    channelOutputByte,
    customChannelLabel,
    defaultEntryStateForChannel,
    legacyColorWheelIdx,
    legacyDimmer01,
    legacyFocus01,
    legacyPan01,
    legacyTilt01,
    parseFixtureEntries,
    smokeFogOutputRange,
    type DMXLiveControlState,
    type DMXLiveShutterMode,
    type FixtureEntryRow,
} from "./dmxLiveMap";
import {
    findOffButtonSlotIndex,
    firstSliderSlotIndex,
    parseEntryLiveSlotKinds,
    resolveLiveWidget,
} from "./dmxLiveWidget";

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

export type PreviewBeamShutter = "open" | "closed" | "strobe" | "pulse" | "randomStrobe";

export type FixturePreviewDrive = {
    pan01: number;
    tilt01: number;
    dimmer01: number;
    focus01: number;
    fog01: number;
    beamColor?: string;
    beamRainbow: boolean;
    beamShutter: PreviewBeamShutter;
    strobeSpeed01: number;
};

type ColorComponentRole = "r" | "g" | "b" | "white" | "amber" | "uv" | "cyan" | "magenta" | "yellow";

const POSITIONAL_COMPONENTS: ColorComponentRole[] = ["r", "g", "b", "white", "amber", "uv"];

type RgbComponents = Partial<Record<ColorComponentRole, number>>;

function fixtureEntryForByte(entries: ReturnType<typeof parseFixtureEntries>, value: number) {
    return entries.find((entry) => value >= entry.from && value <= entry.to);
}

function fixtureEntryForIndex(entries: ReturnType<typeof parseFixtureEntries>, idx: number) {
    if (entries.length === 0) {
        return undefined;
    }
    return entries[Math.max(0, Math.min(entries.length - 1, Math.floor(idx)))];
}

function slotIndexForOutputByte(entries: FixtureEntryRow[], outputByte: number): number {
    for (let i = 0; i < entries.length; i++) {
        const lo = Math.min(entries[i].from, entries[i].to);
        const hi = Math.max(entries[i].from, entries[i].to);
        if (outputByte >= lo && outputByte <= hi) {
            return i;
        }
    }
    return 0;
}

function withinForEntry(entry: FixtureEntryRow | undefined, outputByte: number): number {
    if (!entry) {
        return 0.5;
    }
    const lo = Math.min(entry.from, entry.to);
    const hi = Math.max(entry.from, entry.to);
    if (hi <= lo) {
        return 0.5;
    }
    return Math.max(0, Math.min(1, (outputByte - lo) / (hi - lo)));
}

type PreviewColorEntry = FixtureEntryRow | undefined;

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

function componentFromLabel(label: string): ColorComponentRole | null {
    const l = label.toLowerCase().trim();
    if (!l) {
        return null;
    }
    const has = (...keys: string[]) => keys.some((k) => l.includes(k));
    if (l === "r" || has("red", "rot")) {
        return "r";
    }
    if (l === "g" || has("green", "grün", "gruen")) {
        return "g";
    }
    if (l === "b" || has("blue", "blau")) {
        return "b";
    }
    if (l === "w" || has("white", "weiss", "weiß")) {
        return "white";
    }
    if (l === "a" || has("amber")) {
        return "amber";
    }
    if (has("uv", "ultra", "violet", "purple")) {
        return "uv";
    }
    if (l === "c" || has("cyan")) {
        return "cyan";
    }
    if (l === "m" || has("magenta")) {
        return "magenta";
    }
    if (l === "y" || has("yellow")) {
        return "yellow";
    }
    if (has("lime")) {
        return "g";
    }
    return null;
}

function isColorSliderChannel(ch: DMXChannel): boolean {
    if (ch.type === "colorComponent") {
        return true;
    }
    if (resolveLiveWidget(ch) !== "slider") {
        return false;
    }
    return componentFromLabel(customChannelLabel(ch)) != null;
}

function channelOutputByteForPreview(
    fixture: DMXFixture,
    ch: DMXChannel,
    universe: number[] | undefined,
    fallback: DMXLiveControlState,
): number {
    if (universe && universe.length >= 512) {
        const addr = dmxChannelAddress(fixture, Math.round(ch.channel));
        const raw = addr != null ? universeValue(universe, addr) : undefined;
        if (raw !== undefined) {
            return raw;
        }
    }
    const st = fallback.entryChannels[ch.channel] ?? defaultEntryStateForChannel(ch);
    return channelOutputByte(ch, st);
}

function channelLinear01ForPreview(
    fixture: DMXFixture,
    ch: DMXChannel,
    universe: number[] | undefined,
    fallback: DMXLiveControlState,
): number {
    const byte = channelOutputByteForPreview(fixture, ch, universe, fallback);
    return byteTo01(byte, ch.properties as JSONMap | undefined);
}

function normalizeShutterMode(mode?: string, label?: string): PreviewBeamShutter {
    const hay = `${mode ?? ""} ${label ?? ""}`.toLowerCase();
    if (hay.includes("close") || hay.includes("black")) {
        return "closed";
    }
    if (hay.includes("random")) {
        return "randomStrobe";
    }
    if (hay.includes("pulse") || hay.includes("ramp") || hay.includes("fade")) {
        return "pulse";
    }
    if (hay.includes("strobe") || hay.includes("strobo") || hay.includes("strob")) {
        return "strobe";
    }
    return "open";
}

function liveShutterToPreview(mode: DMXLiveShutterMode | undefined): PreviewBeamShutter {
    switch (mode) {
        case "closed":
            return "closed";
        case "strobe":
            return "strobe";
        case "pulse":
            return "pulse";
        default:
            return "open";
    }
}

function entryLooksLikeStrobe(entry: FixtureEntryRow | undefined): boolean {
    if (!entry) {
        return false;
    }
    const hay = `${entry.label ?? ""} ${entry.mode ?? ""}`.toLowerCase();
    return hay.includes("strobe") || hay.includes("strobo") || hay.includes("strob");
}

function clampByte(n: number): number {
    if (!Number.isFinite(n)) {
        return 0;
    }
    return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(r: number, g: number, b: number): string {
    return `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")}`;
}

function previewRgbFromComponents(components: RgbComponents): string | undefined {
    let r = components.r ?? 0;
    let g = components.g ?? 0;
    let b = components.b ?? 0;
    const white = components.white ?? 0;
    r = Math.min(255, r + white);
    g = Math.min(255, g + white);
    b = Math.min(255, b + white);

    if (components.amber) {
        r = Math.min(255, r + components.amber);
        g = Math.min(255, g + Math.round(components.amber * 0.75));
    }
    if (components.yellow) {
        r = Math.min(255, r + components.yellow);
        g = Math.min(255, g + components.yellow);
    }
    if (components.cyan) {
        g = Math.min(255, g + components.cyan);
        b = Math.min(255, b + components.cyan);
    }
    if (components.magenta) {
        r = Math.min(255, r + components.magenta);
        b = Math.min(255, b + components.magenta);
    }
    if (components.uv) {
        r = Math.min(255, r + Math.round(components.uv * 0.35));
        b = Math.min(255, b + components.uv);
    }

    if (r <= 0 && g <= 0 && b <= 0) {
        return undefined;
    }
    return rgbToHex(r, g, b);
}

function resolveRgbComponents(
    fixture: DMXFixture,
    universe: number[] | undefined,
    fallback: DMXLiveControlState,
): RgbComponents {
    const components: RgbComponents = {};
    const colorChannels = fixture.channels.filter((ch) => isColorSliderChannel(ch));
    colorChannels.forEach((ch, index) => {
        const role = componentFromLabel(customChannelLabel(ch)) ?? POSITIONAL_COMPONENTS[index];
        if (!role) {
            return;
        }
        const linear01 = channelLinear01ForPreview(fixture, ch, universe, fallback);
        components[role] = clampByte(linear01 * 255);
    });
    return components;
}

function previewRgbMax01(components: RgbComponents): number {
    const values = Object.values(components);
    if (values.length === 0) {
        return 0;
    }
    return Math.max(...values.map((v) => (v ?? 0) / 255));
}

function readShutterFromChannel(
    fixture: DMXFixture,
    ch: DMXChannel,
    universe: number[] | undefined,
    fallback: DMXLiveControlState,
): {shutter: PreviewBeamShutter; strobeSpeed01: number} | null {
    const widget = resolveLiveWidget(ch);
    const entries = parseFixtureEntries(ch.properties as JSONMap | undefined);
    const outputByte = channelOutputByteForPreview(fixture, ch, universe, fallback);
    const st = fallback.entryChannels[ch.channel] ?? defaultEntryStateForChannel(ch);

    if (widget === "shutterModes") {
        const entry = fixtureEntryForByte(entries, outputByte);
        const shutter = liveShutterToPreview(st.shutter) !== "open"
            ? liveShutterToPreview(st.shutter)
            : normalizeShutterMode(entry?.mode, entry?.label);
        const speed01 = shutter === "strobe" || shutter === "pulse" || shutter === "randomStrobe"
            ? withinForEntry(entry, outputByte)
            : 0.5;
        return {shutter, strobeSpeed01: speed01};
    }

    if (widget === "buttonSlider" && entries.length > 0) {
        const kinds = parseEntryLiveSlotKinds(ch.properties as JSONMap | undefined, entries);
        const offIdx = findOffButtonSlotIndex(entries, kinds);
        const sliderIdx = firstSliderSlotIndex(kinds);
        const activeIdx = slotIndexForOutputByte(entries, outputByte);
        const activeEntry = entries[activeIdx];

        if (offIdx >= 0 && st.buttonSlotIdx === offIdx) {
            return {shutter: "closed", strobeSpeed01: 0};
        }

        if (entryLooksLikeStrobe(activeEntry)) {
            return {
                shutter: "strobe",
                strobeSpeed01: withinForEntry(activeEntry, outputByte),
            };
        }

        if (sliderIdx >= 0 && entryLooksLikeStrobe(entries[sliderIdx])) {
            const sliderActive = st.buttonSlotIdx !== offIdx
                && (st.activeSliderIdx === sliderIdx || activeIdx === sliderIdx);
            if (sliderActive && outputByte > 0) {
                return {
                    shutter: "strobe",
                    strobeSpeed01: Math.max(st.within01, withinForEntry(entries[sliderIdx], outputByte)),
                };
            }
        }

        return {shutter: "open", strobeSpeed01: 0.5};
    }

    if (entries.length > 0) {
        const entry = fixtureEntryForByte(entries, outputByte);
        if (!entry) {
            return null;
        }
        const shutter = normalizeShutterMode(entry.mode, entry.label);
        if (shutter === "open") {
            return {shutter, strobeSpeed01: 0.5};
        }
        return {
            shutter,
            strobeSpeed01: withinForEntry(entry, outputByte),
        };
    }

    return null;
}

function resolveBeamShutter(
    fixture: DMXFixture,
    universe: number[] | undefined,
    fallback: DMXLiveControlState,
): {beamShutter: PreviewBeamShutter; strobeSpeed01: number} {
    let beamShutter: PreviewBeamShutter = "open";
    let strobeSpeed01 = 0.5;

    for (const ch of fixture.channels) {
        const read = readShutterFromChannel(fixture, ch, universe, fallback);
        if (!read) {
            continue;
        }
        if (read.shutter === "closed") {
            return {beamShutter: "closed", strobeSpeed01: read.strobeSpeed01};
        }
        if (read.shutter !== "open") {
            beamShutter = read.shutter;
            strobeSpeed01 = Math.max(strobeSpeed01, read.strobeSpeed01);
        }
    }

    return {beamShutter, strobeSpeed01};
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

    const rgbComponents = resolveRgbComponents(fixture, universe, fallback);
    const colorChannels = fixture.channels.filter((ch) => isColorSliderChannel(ch));
    if (!beamColor && !beamRainbow) {
        beamColor = previewRgbFromComponents(rgbComponents);
    }
    if (!dimCh) {
        dimmer01 = colorChannels.length > 0 ? previewRgbMax01(rgbComponents) : dimmer01;
    }

    const {beamShutter, strobeSpeed01} = resolveBeamShutter(fixture, universe, fallback);

    return {
        pan01,
        tilt01,
        dimmer01,
        focus01,
        fog01,
        beamColor,
        beamRainbow,
        beamShutter,
        strobeSpeed01,
    };
}
