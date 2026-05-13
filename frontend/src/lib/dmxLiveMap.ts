import type { DMXChannel, DMXChannelType, DMXFixture, JSONMap } from "../types/controller";

export type DMXLiveShutterMode = "open" | "closed" | "strobe" | "pulse";

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
  /** Frost curve: prefer entries with this mode when possible */
  frostCurve: "linear" | "pulse";
  dimmer01: number;
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
  out.push({ address: addr, value: clamp255(value) });
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

export function defaultDmxLiveControlState(): DMXLiveControlState {
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
    frostCurve: "linear",
    dimmer01: 1,
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

  return out;
}
