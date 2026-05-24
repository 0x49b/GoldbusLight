import type {DMXChannel, DMXChannelType, DMXFixture, JSONMap} from "../types/controller";

export type DMXLiveShutterMode = "open" | "closed" | "strobe" | "pulse";

export type CustomChannelLiveState = {
    linear01: number;
    slot01: number[];
    outputByte: number;
};

export type DMXLiveControlState = {
    /** 0–1 pan (left–right) */
    pan01: number;
    /** 0–1 tilt (bottom–top) */
    tilt01: number;
    colorWheelIdx: number;
    gobo1Idx: number;
    gobo2Idx: number;
    shutter: DMXLiveShutterMode;
    movementSpeedIdx: number;
    focus01: number;
    zoom01: number;
    iris01: number;
    frost01: number;
    fog01: number;
    /** Frost curve: prefer entries with this mode when possible */
    frostCurve: "linear" | "pulse";
    dimmer01: number;
    /** Live values keyed by channel offset (DMXChannel.channel) */
    customChannels: Record<number, CustomChannelLiveState>;
};

export type DmxLivePatchEntry = {
    address: number;
    value: number;
};

type EntryRow = {
    from: number;
    to: number;
    label?: string;
    mode?: string;
    color?: string;
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

export function parseFixtureEntries(props: JSONMap | undefined): EntryRow[] {
    const raw = props?.entries;
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: EntryRow[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            continue;
        }
        const e = item as Record<string, unknown>;
        const from = typeof e.from === "number" ? e.from : 0;
        const to = typeof e.to === "number" ? e.to : 255;
        out.push({
            from,
            to,
            label: typeof e.label === "string" ? e.label : undefined,
            mode: typeof e.mode === "string" ? e.mode : undefined,
            color: typeof e.color === "string" ? e.color : undefined,
            goboIdentifier: typeof e.goboIdentifier === "string" ? e.goboIdentifier : undefined,
            goboName: typeof e.goboName === "string" ? e.goboName : undefined,
            goboImage: typeof e.goboImage === "string" ? e.goboImage : undefined,
        });
    }
    return out;
}

function linearByte(props: JSONMap | undefined, t01: number): number {
    const min = typeof props?.min === "number" ? props.min : 0;
    const max = typeof props?.max === "number" ? props.max : 255;
    const t = clamp(t01, 0, 1);
    return clamp255(min + t * (max - min));
}

function slotMid(entries: EntryRow[], idx: number): number {
    if (entries.length === 0) {
        return 0;
    }
    const i = clamp(Math.floor(idx), 0, entries.length - 1);
    const e = entries[i];
    return clamp255((e.from + e.to) / 2);
}

function slotByte(entries: EntryRow[], slotIdx: number, t01: number): number {
    if (entries.length === 0) {
        return clamp255(t01 * 255);
    }
    const i = clamp(Math.floor(slotIdx), 0, entries.length - 1);
    const e = entries[i];
    const t = clamp(t01, 0, 1);
    return clamp255(e.from + t * (e.to - e.from));
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

export function initCustomChannelState(ch: DMXChannel): CustomChannelLiveState {
    const props = ch.properties as JSONMap | undefined;
    const entries = parseFixtureEntries(props);
    if (entries.length > 0) {
        const slot01 = entries.map(() => 0.5);
        return {linear01: 0.5, slot01, outputByte: slotByte(entries, 0, 0.5)};
    }
    const linear01 = 0.5;
    return {linear01, slot01: [], outputByte: linearByte(props, linear01)};
}

function initCustomChannelStates(fixture: DMXFixture | undefined): Record<number, CustomChannelLiveState> {
    const out: Record<number, CustomChannelLiveState> = {};
    if (!fixture) {
        return out;
    }
    for (const ch of fixture.channels) {
        if (ch.type === "custom") {
            out[ch.channel] = initCustomChannelState(ch);
        }
    }
    return out;
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

function smokeFogByte(props: JSONMap | undefined, t01: number): number {
    const range = smokeFogOutputRange(props);
    if (!range) {
        return linearByte(props, t01);
    }
    const t = clamp(t01, 0, 1);
    if (t <= 0) {
        return 0;
    }
    return clamp255(range.min + t * (range.max - range.min));
}

function firstChannel(channels: DMXChannel[], type: DMXChannelType): DMXChannel | undefined {
    return channels.find((c) => c.type === type);
}

function allChannelsOfType(channels: DMXChannel[], type: DMXChannelType): DMXChannel[] {
    return channels.filter((c) => c.type === type);
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

function pickShutterEntryIndex(entries: EntryRow[], mode: DMXLiveShutterMode): number {
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

function frostEntriesForCurve(entries: EntryRow[], curve: "linear" | "pulse"): EntryRow[] {
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

export function defaultDmxLiveControlState(fixture?: DMXFixture): DMXLiveControlState {
    return {
        pan01: 0.5,
        tilt01: 0.5,
        colorWheelIdx: 0,
        gobo1Idx: 0,
        gobo2Idx: 0,
        shutter: "open",
        movementSpeedIdx: 0,
        focus01: 0.5,
        zoom01: 0.5,
        iris01: 0.5,
        frost01: 0,
        fog01: 0,
        frostCurve: "linear",
        dimmer01: 1,
        customChannels: initCustomChannelStates(fixture),
    };
}

export function buildDmxLivePatch(fixture: DMXFixture, s: DMXLiveControlState): DmxLivePatchEntry[] {
    const out: DmxLivePatchEntry[] = [];
    const chans = fixture.channels;

    const pan = firstChannel(chans, "pan");
    const tilt = firstChannel(chans, "tilt");
    if (pan) {
        pushPatch(out, fixture, pan, linearByte(pan.properties as JSONMap | undefined, s.pan01));
    }
    if (tilt) {
        pushPatch(out, fixture, tilt, linearByte(tilt.properties as JSONMap | undefined, s.tilt01));
    }

    const dim = firstChannel(chans, "dimmer");
    pushPatch(out, fixture, dim, linearByte(dim?.properties as JSONMap | undefined, s.dimmer01));

    const cw = firstChannel(chans, "colorWheel");
    if (cw) {
        const entries = parseFixtureEntries(cw.properties as JSONMap | undefined);
        pushPatch(out, fixture, cw, slotMid(entries, s.colorWheelIdx));
    }

    const gobos = allChannelsOfType(chans, "goboWheel");
    if (gobos[0]) {
        const entries = parseFixtureEntries(gobos[0].properties as JSONMap | undefined);
        pushPatch(out, fixture, gobos[0], slotMid(entries, s.gobo1Idx));
    }
    if (gobos[1]) {
        const entries = parseFixtureEntries(gobos[1].properties as JSONMap | undefined);
        pushPatch(out, fixture, gobos[1], slotMid(entries, s.gobo2Idx));
    }

    const shutter = firstChannel(chans, "shutterStrobe");
    if (shutter) {
        const entries = parseFixtureEntries(shutter.properties as JSONMap | undefined);
        const idx = pickShutterEntryIndex(entries, s.shutter);
        pushPatch(out, fixture, shutter, slotMid(entries, idx));
    }

    const ms = firstChannel(chans, "movementSpeed");
    if (ms) {
        const entries = parseFixtureEntries(ms.properties as JSONMap | undefined);
        pushPatch(out, fixture, ms, slotMid(entries, s.movementSpeedIdx));
    }

    const focus = firstChannel(chans, "focus");
    pushPatch(out, fixture, focus, linearByte(focus?.properties as JSONMap | undefined, s.focus01));
    const zoom = firstChannel(chans, "zoom");
    pushPatch(out, fixture, zoom, linearByte(zoom?.properties as JSONMap | undefined, s.zoom01));
    const iris = firstChannel(chans, "iris");
    pushPatch(out, fixture, iris, linearByte(iris?.properties as JSONMap | undefined, s.iris01));

    const fog = firstChannel(chans, "fog");
    const fogProps = fog?.properties as JSONMap | undefined;
    if (fixture.type === "smoke" && smokeFogOutputRange(fogProps)) {
        pushPatch(out, fixture, fog, smokeFogByte(fogProps, s.fog01));
    }

    const frost = firstChannel(chans, "frost");
    if (frost) {
        const props = frost.properties as JSONMap | undefined;
        const entries = parseFixtureEntries(props);
        if (entries.length > 0) {
            const pool = frostEntriesForCurve(entries, s.frostCurve);
            const usePool = pool.length > 0 ? pool : entries;
            const maxI = Math.max(0, usePool.length - 1);
            const idx = Math.round(clamp(s.frost01, 0, 1) * maxI);
            pushPatch(out, fixture, frost, slotMid(usePool, idx));
        } else {
            pushPatch(out, fixture, frost, linearByte(props, s.frost01));
        }
    }

    for (const ch of chans) {
        if (ch.type !== "custom") {
            continue;
        }
        const customState = s.customChannels[ch.channel] ?? initCustomChannelState(ch);
        pushPatch(out, fixture, ch, customState.outputByte);
    }

    return out;
}
