import type {DMXChannel, DMXFixture, JSONMap} from "../types/controller";
import {
    inferScrollRamp,
    isColorWheelScrollSlot,
    scrollSlotDmxByte,
    within01ForScrollEntry,
} from "./colorWheelSlot";
import {
    findOffButtonSlotIndex,
    firstSliderSlotIndex,
    parseEntryLiveSlotKinds,
    resolveLiveWidget,
    type DMXLiveWidget,
} from "./dmxLiveWidget";

export type DMXLiveShutterMode = "open" | "closed" | "strobe" | "pulse";

export type EntryChannelLiveState = {
    slotIdx: number;
    /** 0–1 position within the active slot range (slotSlider / buttonSlider) */
    within01: number;
    /** 0–1 for linear slider widgets */
    linear01: number;
    shutter?: DMXLiveShutterMode;
    frostCurve?: "linear" | "pulse";
    /** buttonSlider: latched toggle slot (-1 = none / use slider) */
    buttonSlotIdx?: number;
    /** buttonSlider: which slider entry drives output */
    activeSliderIdx?: number;
};

export type DMXLiveControlState = {
    entryChannels: Record<number, EntryChannelLiveState>;
    /** Smoke/hazer fog output 0–1 */
    fog01: number;
};

/** @deprecated Use EntryChannelLiveState — kept for gradual migration in custom channel cards */
export type CustomChannelLiveState = {
    linear01: number;
    slot01: number[];
    outputByte: number;
};

export type DmxLivePatchEntry = {
    address: number;
    value: number;
};

export type FixtureEntryRow = {
    from: number;
    to: number;
    label?: string;
    mode?: string;
    color?: string;
    direction?: string;
    scrollRamp?: "fastToSlow" | "slowToFast";
    goboIdentifier?: string;
    goboName?: string;
    goboImage?: string;
};

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function clamp255(n: number): number {
    return Math.round(clamp(n, 0, 255));
}

function channelDefaultByte(ch: DMXChannel): number | undefined {
    if (typeof ch.defaultValue !== "number" || !Number.isFinite(ch.defaultValue)) {
        return undefined;
    }
    return clamp255(ch.defaultValue);
}

function slotIndexForOutputByte(entries: FixtureEntryRow[], outputByte: number): number {
    if (entries.length === 0) {
        return 0;
    }
    const byte = clamp255(outputByte);
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const lo = Math.min(entry.from, entry.to);
        const hi = Math.max(entry.from, entry.to);
        if (byte >= lo && byte <= hi) {
            return i;
        }
    }
    let nearest = 0;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < entries.length; i++) {
        const mid = slotMid(entries, i);
        const dist = Math.abs(mid - byte);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = i;
        }
    }
    return nearest;
}

function withinForOutputByte(entry: FixtureEntryRow | undefined, outputByte: number): number {
    if (!entry) {
        return 0;
    }
    const lo = Math.min(entry.from, entry.to);
    const hi = Math.max(entry.from, entry.to);
    const span = hi - lo;
    if (span <= 0) {
        return 0;
    }
    return clamp((clamp255(outputByte) - lo) / span, 0, 1);
}

export function parseFixtureEntries(props: JSONMap | undefined): FixtureEntryRow[] {
    const raw = props?.entries;
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: FixtureEntryRow[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            continue;
        }
        const e = item as Record<string, unknown>;
        const from = typeof e.from === "number" ? e.from : 0;
        const to = typeof e.to === "number" ? e.to : 255;
        const scrollRampRaw = e.scrollRamp;
        const scrollRamp =
            scrollRampRaw === "fastToSlow" || scrollRampRaw === "slowToFast" ? scrollRampRaw : undefined;
        out.push({
            from,
            to,
            label: typeof e.label === "string" ? e.label : undefined,
            mode: typeof e.mode === "string" ? e.mode : undefined,
            color: typeof e.color === "string" ? e.color : undefined,
            direction: typeof e.direction === "string" ? e.direction : undefined,
            scrollRamp,
            goboIdentifier: typeof e.goboIdentifier === "string" ? e.goboIdentifier : undefined,
            goboName: typeof e.goboName === "string" ? e.goboName : undefined,
            goboImage: typeof e.goboImage === "string" ? e.goboImage : undefined,
        });
    }
    return out;
}

export function linearByte(props: JSONMap | undefined, t01: number): number {
    const min = typeof props?.min === "number" ? props.min : 0;
    const max = typeof props?.max === "number" ? props.max : 255;
    const t = clamp(t01, 0, 1);
    return clamp255(min + t * (max - min));
}

export function slotMid(entries: FixtureEntryRow[], idx: number): number {
    if (entries.length === 0) {
        return 0;
    }
    const i = clamp(Math.floor(idx), 0, entries.length - 1);
    const e = entries[i];
    return clamp255((e.from + e.to) / 2);
}

export function slotByte(entries: FixtureEntryRow[], slotIdx: number, t01: number): number {
    if (entries.length === 0) {
        return clamp255(t01 * 255);
    }
    const i = clamp(Math.floor(slotIdx), 0, entries.length - 1);
    const e = entries[i];
    const t = clamp(t01, 0, 1);
    const lo = Math.min(e.from, e.to);
    const hi = Math.max(e.from, e.to);
    return clamp255(lo + t * (hi - lo));
}

export function channelEntryState(
    state: DMXLiveControlState,
    offset: number,
): EntryChannelLiveState | undefined {
    return state.entryChannels[offset];
}

export function getChannelLinear01(state: DMXLiveControlState, ch: DMXChannel, fallback = 0.5): number {
    return state.entryChannels[ch.channel]?.linear01 ?? fallback;
}

export function getChannelSlotIdx(state: DMXLiveControlState, ch: DMXChannel, fallback = 0): number {
    return state.entryChannels[ch.channel]?.slotIdx ?? fallback;
}

export function defaultEntryStateForChannel(ch: DMXChannel): EntryChannelLiveState {
    return entryStateForChannelByte(ch, channelDefaultByte(ch));
}

/**
 * Builds the live-control state for a channel that reproduces a specific output byte
 * (the inverse of channelOutputByte). Used to recall a saved preset into the live UI.
 * Pass undefined to fall back to the channel's neutral defaults.
 */
export function entryStateForChannelByte(ch: DMXChannel, targetByte: number | undefined): EntryChannelLiveState {
    const widget = resolveLiveWidget(ch);
    const props = ch.properties as JSONMap | undefined;
    const entries = parseFixtureEntries(props);
    const defaultByte = targetByte === undefined ? undefined : clamp255(targetByte);
    const linear01 = ch.type === "dimmer" || ch.type === "dimmerFine" ? 1 : 0.5;
    const base: EntryChannelLiveState = {
        slotIdx: 0,
        within01: 0,
        linear01,
    };
    if (widget === "shutterModes") {
        base.shutter = "open";
    }
    if (ch.type === "frost") {
        base.frostCurve = "linear";
        base.linear01 = 0;
    }
    if (widget === "buttonSlider" && entries.length > 0) {
        const kinds = parseEntryLiveSlotKinds(props, entries);
        const offIdx = findOffButtonSlotIndex(entries, kinds);
        const sliderIdx = firstSliderSlotIndex(kinds);
        base.buttonSlotIdx = offIdx >= 0 ? offIdx : -1;
        base.activeSliderIdx = sliderIdx >= 0 ? sliderIdx : 0;
        base.within01 = 0;
        base.slotIdx = offIdx >= 0 ? offIdx : 0;
    }
    if (defaultByte === undefined) {
        return base;
    }
    if (widget === "slider" || entries.length === 0) {
        const min = typeof props?.min === "number" ? props.min : 0;
        const max = typeof props?.max === "number" ? props.max : 255;
        const span = max - min;
        base.linear01 = span === 0 ? 0 : clamp((defaultByte - min) / span, 0, 1);
        return base;
    }
    if (widget === "buttonSlider") {
        const kinds = parseEntryLiveSlotKinds(props, entries);
        const offIdx = findOffButtonSlotIndex(entries, kinds);
        const sliderIdx = firstSliderSlotIndex(kinds);
        if (defaultByte === 0 && offIdx >= 0) {
            base.buttonSlotIdx = offIdx;
            base.slotIdx = offIdx;
            base.within01 = 0;
            return base;
        }
        const idx = slotIndexForOutputByte(entries, defaultByte);
        const kind = kinds[idx] ?? "slider";
        if (kind === "button") {
            base.buttonSlotIdx = idx;
            base.slotIdx = idx;
            base.within01 = 0;
            return base;
        }
        const activeIdx = kind === "slider" ? idx : (sliderIdx >= 0 ? sliderIdx : idx);
        base.activeSliderIdx = activeIdx;
        base.slotIdx = activeIdx;
        base.within01 = withinForOutputByte(entries[activeIdx], defaultByte);
        if (offIdx >= 0 && base.buttonSlotIdx === undefined) {
            base.buttonSlotIdx = offIdx;
        }
        return base;
    }
    const idx = slotIndexForOutputByte(entries, defaultByte);
    base.slotIdx = idx;
    if (widget === "colorWheel" && isColorWheelScrollSlot(entries[idx])) {
        base.within01 = within01ForScrollEntry(entries[idx], defaultByte, inferScrollRamp(entries[idx]));
    } else {
        base.within01 = withinForOutputByte(entries[idx], defaultByte);
    }
    return base;
}

function initEntryChannelStates(fixture: DMXFixture | undefined): Record<number, EntryChannelLiveState> {
    const out: Record<number, EntryChannelLiveState> = {};
    if (!fixture) {
        return out;
    }
    for (const ch of fixture.channels) {
        if (resolveLiveWidget(ch) !== "hidden") {
            out[ch.channel] = defaultEntryStateForChannel(ch);
        }
    }
    return out;
}

export function customChannelLabel(ch: DMXChannel): string {
    const props = ch.properties as JSONMap | undefined;
    if (typeof props?.label === "string" && props.label.trim()) {
        return props.label.trim();
    }
    if (typeof props?.name === "string" && props.name.trim()) {
        return props.name.trim();
    }
    return `Custom · offset ${ch.channel}`;
}

export function channelLiveLabel(ch: DMXChannel): string {
    if (ch.type === "custom") {
        return customChannelLabel(ch);
    }
    const props = ch.properties as JSONMap | undefined;
    if (typeof props?.label === "string" && props.label.trim()) {
        return props.label.trim();
    }
    const typeLabel = ch.type.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
    return `${typeLabel.trim()} · ch ${ch.channel}`;
}

/** @deprecated */
export function initCustomChannelState(ch: DMXChannel): CustomChannelLiveState {
    const st = defaultEntryStateForChannel(ch);
    const props = ch.properties as JSONMap | undefined;
    const entries = parseFixtureEntries(props);
    if (entries.length > 0) {
        const slot01 = entries.map(() => st.within01);
        return {linear01: st.linear01, slot01, outputByte: channelOutputByte(ch, st)};
    }
    return {linear01: st.linear01, slot01: [], outputByte: channelOutputByte(ch, st)};
}

export type SmokeFogOutputRange = {
    min: number;
    max: number;
};

export function smokeFogOutputRange(props: JSONMap | undefined): SmokeFogOutputRange | null {
    const raw = props?.entries;
    if (!Array.isArray(raw) || raw.length === 0) {
        return null;
    }

    let hasOffSlot = false;
    let min = 255;
    let max = 1;

    for (const item of raw) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            continue;
        }
        const e = item as Record<string, unknown>;
        const fromRaw = typeof e.from === "number" ? e.from : undefined;
        const toRaw = typeof e.to === "number" ? e.to : undefined;

        if ((fromRaw === 0 && (toRaw === undefined || toRaw === 0)) || (toRaw === 0 && (fromRaw === undefined || fromRaw === 0))) {
            hasOffSlot = true;
            continue;
        }

        const from = fromRaw ?? toRaw;
        const to = toRaw ?? fromRaw;
        if (from === undefined || to === undefined) {
            continue;
        }
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        if (hi >= 1) {
            min = Math.min(min, Math.max(1, lo));
            max = Math.max(max, hi);
        }
    }

    if (!hasOffSlot) {
        return null;
    }
    if (max < min) {
        return {min: 1, max: 255};
    }
    return {min: clamp255(min), max: clamp255(max)};
}

function pushPatch(out: DmxLivePatchEntry[], fixture: DMXFixture, ch: DMXChannel | undefined, value: number) {
    if (!ch || !Number.isFinite(ch.channel)) {
        return;
    }
    const baseRaw = fixture.dmxAddress;
    const base =
        Number.isFinite(baseRaw) && baseRaw >= 1 && baseRaw <= 512 ? Math.round(baseRaw) : 1;
    const off = Math.round(ch.channel);
    const addr = base + off - 1;
    if (addr < 1 || addr > 512) {
        return;
    }
    out.push({address: addr, value: clamp255(value)});
}

export function pickShutterEntryIndex(entries: FixtureEntryRow[], mode: DMXLiveShutterMode): number {
    const keys: Record<DMXLiveShutterMode, string[]> = {
        open: ["open", "shutter open", "full"],
        closed: ["close", "closed", "blackout"],
        strobe: ["strobe", "strob", "random strobe"],
        pulse: ["pulse", "ramp", "fade"],
    };
    const want = keys[mode].map((s) => s.toLowerCase());
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const hay = `${(e.mode ?? "").toLowerCase()} ${(e.label ?? "").toLowerCase()}`;
        for (const w of want) {
            if (hay.includes(w)) {
                return i;
            }
        }
    }
    const fallback: Record<DMXLiveShutterMode, number> = {
        open: 0,
        closed: Math.min(1, Math.max(0, entries.length - 1)),
        strobe: Math.min(2, Math.max(0, entries.length - 1)),
        pulse: Math.min(3, Math.max(0, entries.length - 1)),
    };
    return clamp(fallback[mode], 0, Math.max(0, entries.length - 1));
}

function frostEntriesForCurve(entries: FixtureEntryRow[], curve: "linear" | "pulse"): FixtureEntryRow[] {
    const filtered = entries.filter((e) => {
        const m = (e.mode ?? "").toLowerCase();
        const l = (e.label ?? "").toLowerCase();
        if (curve === "pulse") {
            return m.includes("pulse") || l.includes("pulse");
        }
        return m.includes("linear") || l.includes("linear") || (!m.includes("pulse") && !l.includes("pulse"));
    });
    return filtered.length > 0 ? filtered : entries;
}

function findCoarseChannel(fixture: DMXFixture, fine: DMXChannel): DMXChannel | undefined {
    if (fine.type === "panFine") {
        return fixture.channels.find((c) => c.type === "pan" || c.type === "infinitePan");
    }
    if (fine.type === "tiltFine") {
        return fixture.channels.find((c) => c.type === "tilt" || c.type === "infiniteTilt");
    }
    return undefined;
}

export function channelOutputByte(ch: DMXChannel, st: EntryChannelLiveState, widget?: DMXLiveWidget): number {
    const w = widget ?? resolveLiveWidget(ch);
    const props = ch.properties as JSONMap | undefined;
    const entries = parseFixtureEntries(props);

    switch (w) {
        case "hidden":
            return 0;
        case "slider":
            return linearByte(props, st.linear01);
        case "shutterModes": {
            const mode = st.shutter ?? "open";
            const idx = pickShutterEntryIndex(entries, mode);
            return slotMid(entries, idx);
        }
        case "colorWheel": {
            const idx = clamp(Math.floor(st.slotIdx), 0, Math.max(0, entries.length - 1));
            if (entries.length > 0 && isColorWheelScrollSlot(entries[idx])) {
                return scrollSlotDmxByte(entries[idx], st.within01, inferScrollRamp(entries[idx]));
            }
            return slotMid(entries, idx);
        }
        case "goboWheel":
        case "buttons":
            return slotMid(entries, st.slotIdx);
        case "slotSlider": {
            if (entries.length === 0) {
                return linearByte(props, st.linear01);
            }
            if (ch.type === "frost") {
                const pool = frostEntriesForCurve(entries, st.frostCurve ?? "linear");
                const usePool = pool.length > 0 ? pool : entries;
                const maxI = Math.max(0, usePool.length - 1);
                const idx = Math.round(clamp(st.linear01, 0, 1) * maxI);
                return slotMid(usePool, idx);
            }
            return slotByte(entries, st.slotIdx, st.within01);
        }
        case "buttonSlider": {
            if (entries.length === 0) {
                return linearByte(props, st.linear01);
            }
            const kinds = parseEntryLiveSlotKinds(props, entries);
            const offIdx = findOffButtonSlotIndex(entries, kinds);
            const buttonSlot = st.buttonSlotIdx ?? (offIdx >= 0 ? offIdx : -1);
            if (offIdx >= 0 && buttonSlot === offIdx) {
                return 0;
            }
            const sliderIdx = st.activeSliderIdx ?? firstSliderSlotIndex(kinds);
            if (sliderIdx >= 0 && kinds[sliderIdx] === "slider") {
                const t = clamp(st.within01, 0, 1);
                if (t <= 0 && offIdx < 0) {
                    return slotMid(entries, buttonSlot >= 0 ? buttonSlot : 0);
                }
                if (t <= 0 && offIdx >= 0) {
                    return 0;
                }
                return slotByte(entries, sliderIdx, t);
            }
            if (buttonSlot >= 0) {
                return slotMid(entries, buttonSlot);
            }
            return 0;
        }
        default:
            return linearByte(props, st.linear01);
    }
}

export function defaultDmxLiveControlState(fixture?: DMXFixture): DMXLiveControlState {
    return {
        entryChannels: initEntryChannelStates(fixture),
        fog01: 0,
    };
}

/**
 * Builds a live-control state that reproduces a saved preset's channel values
 * (keyed by fixture-relative offset as a string). Channels not present in the
 * preset fall back to their neutral defaults.
 */
export function dmxLiveControlStateFromPreset(
    fixture: DMXFixture,
    values: Record<string, number> | undefined,
): DMXLiveControlState {
    const entryChannels: Record<number, EntryChannelLiveState> = {};
    let fog01 = 0;
    for (const ch of fixture.channels) {
        if (resolveLiveWidget(ch) === "hidden") {
            continue;
        }
        const raw = values?.[String(ch.channel)];
        const target = typeof raw === "number" && Number.isFinite(raw) ? clamp255(raw) : undefined;
        entryChannels[ch.channel] = entryStateForChannelByte(ch, target);
        if (ch.type === "fog" && target !== undefined) {
            fog01 = clamp(target / 255, 0, 1);
        }
    }
    return {entryChannels, fog01};
}

export function patchEntryChannel(
    state: DMXLiveControlState,
    offset: number,
    partial: Partial<EntryChannelLiveState>,
): DMXLiveControlState {
    const prev = state.entryChannels[offset] ?? {
        slotIdx: 0,
        within01: 0.5,
        linear01: 0.5,
    };
    return {
        ...state,
        entryChannels: {
            ...state.entryChannels,
            [offset]: {...prev, ...partial},
        },
    };
}

export function buildDmxLivePatch(fixture: DMXFixture, s: DMXLiveControlState): DmxLivePatchEntry[] {
    const out: DmxLivePatchEntry[] = [];
    const patchedOffsets = new Set<number>();

    for (const ch of fixture.channels) {
        const widget = resolveLiveWidget(ch);
        if (widget === "hidden") {
            const explicitDefault = channelDefaultByte(ch);
            if (explicitDefault !== undefined) {
                pushPatch(out, fixture, ch, explicitDefault);
                patchedOffsets.add(ch.channel);
                continue;
            }
            const coarse = findCoarseChannel(fixture, ch);
            if (coarse) {
                const coarseSt = s.entryChannels[coarse.channel];
                if (coarseSt) {
                    const coarseVal = channelOutputByte(coarse, coarseSt);
                    pushPatch(out, fixture, ch, coarseVal);
                    patchedOffsets.add(ch.channel);
                }
            }
            continue;
        }

        const st = s.entryChannels[ch.channel] ?? defaultEntryStateForChannel(ch);
        pushPatch(out, fixture, ch, channelOutputByte(ch, st, widget));
        patchedOffsets.add(ch.channel);
    }

    return out;
}

/** Legacy accessors for preview drive */
export function legacyPan01(fixture: DMXFixture, s: DMXLiveControlState): number {
    const ch = fixture.channels.find((c) => c.type === "pan" || c.type === "infinitePan");
    return ch ? getChannelLinear01(s, ch) : 0.5;
}

export function legacyTilt01(fixture: DMXFixture, s: DMXLiveControlState): number {
    const ch = fixture.channels.find((c) => c.type === "tilt" || c.type === "infiniteTilt");
    return ch ? getChannelLinear01(s, ch) : 0.5;
}

export function legacyDimmer01(fixture: DMXFixture, s: DMXLiveControlState): number {
    const ch = fixture.channels.find((c) => c.type === "dimmer");
    return ch ? getChannelLinear01(s, ch, 1) : 1;
}

export function legacyColorWheelIdx(fixture: DMXFixture, s: DMXLiveControlState): number {
    const ch = fixture.channels.find((c) => c.type === "colorWheel");
    return ch ? getChannelSlotIdx(s, ch) : 0;
}

export function legacyFocus01(fixture: DMXFixture, s: DMXLiveControlState): number {
    const ch = fixture.channels.find((c) => c.type === "focus");
    if (!ch) {
        return 0.5;
    }
    const widget = resolveLiveWidget(ch);
    const st = s.entryChannels[ch.channel];
    if (!st) {
        return 0.5;
    }
    if (widget === "slotSlider" || widget === "buttons") {
        const entries = parseFixtureEntries(ch.properties as JSONMap | undefined);
        if (entries.length > 0) {
            return st.slotIdx / Math.max(1, entries.length - 1);
        }
    }
    return st.linear01;
}
