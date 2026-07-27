import type {DMXChannel, DMXFixture, DMXFixtureCue} from "@/types/controller.ts";
import i18n from "../i18n";
import {
    buildDmxLivePatch,
    defaultDmxLiveControlState,
    defaultEntryStateForChannel,
    parseFixtureEntries,
    type DMXLiveControlState,
    type FixtureEntryRow,
} from "./dmxLiveMap.ts";

/**
 * A high-level moving-head "pose": normalised pan/tilt (0..1, where 0.5 ≈ centre), a target
 * colour from the show palette, and whether it's a tight "beam" look (engage gobo + prism) or an
 * open "wash". These are turned into concrete DMX bytes per fixture by reading each channel's
 * type, so the same show works for any moving head regardless of its channel order.
 */
type ShowPose = {
    /** Locale key under `dmx:cueShow.poses` used to resolve the display label. */
    labelKey: string;
    pan01: number;
    tilt01: number;
    /** Palette colour as a hex string; mapped onto colour-wheel slots or RGB components. */
    color: string;
    /** true → engage a gobo pattern + prism (tight beam look); false → open wash. */
    beam: boolean;
};

/**
 * Ten classic DJ/club moving-head looks with a colour palette and beam/wash treatment. Chained
 * with a crossfade they read as a smooth show: a home base, an audience wash, left/right sweeps,
 * crossing beams, a sky search, a floor spot, and wide diagonals.
 */
const SHOW_POSES: ShowPose[] = [
    {labelKey: "homeCenter", pan01: 0.5, tilt01: 0.55, color: "#ffffff", beam: false},
    {labelKey: "audienceWash", pan01: 0.5, tilt01: 0.35, color: "#ff7a00", beam: false},
    {labelKey: "sweepLeft", pan01: 0.18, tilt01: 0.55, color: "#0030ff", beam: true},
    {labelKey: "sweepRight", pan01: 0.82, tilt01: 0.55, color: "#00d0ff", beam: true},
    {labelKey: "crossBeamLeft", pan01: 0.4, tilt01: 0.72, color: "#ff00c0", beam: true},
    {labelKey: "crossBeamRight", pan01: 0.6, tilt01: 0.72, color: "#ff0000", beam: true},
    {labelKey: "skySearch", pan01: 0.5, tilt01: 0.92, color: "#ffffff", beam: false},
    {labelKey: "floorSpot", pan01: 0.5, tilt01: 0.15, color: "#00ff3c", beam: true},
    {labelKey: "wideDiagonalLeft", pan01: 0.22, tilt01: 0.8, color: "#7a00ff", beam: true},
    {labelKey: "wideDiagonalRight", pan01: 0.78, tilt01: 0.8, color: "#ff5a00", beam: true},
];

const PAN_TYPES = new Set<string>(["pan", "infinitePan"]);
const TILT_TYPES = new Set<string>(["tilt", "infiniteTilt"]);
const DIMMER_TYPES = new Set<string>(["dimmer", "dimmerFine"]);
const PRISM_TYPES = new Set<string>(["prism", "prismRotation", "prismIndexing", "prismIndexingFine"]);

type RGB = {r: number; g: number; b: number};
type ColorComponent = "r" | "g" | "b" | "white" | "amber" | "uv" | "cyan" | "magenta" | "yellow";
/** Positional fallback for unlabelled colour-component channels (common RGB / RGBW / RGBWAUV order). */
const POSITIONAL_COMPONENTS: ColorComponent[] = ["r", "g", "b", "white", "amber", "uv"];

function clampByte(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): RGB {
    const h = (hex || "").replace("#", "").trim();
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
    const int = Number.parseInt(full, 16);
    if (!Number.isFinite(int)) return {r: 255, g: 255, b: 255};
    return {r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff};
}

function rgbDistance(a: RGB, b: RGB): number {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return dr * dr + dg * dg + db * db;
}

function componentFromLabel(label: string): ColorComponent | null {
    const l = label.toLowerCase().trim();
    if (!l) return null;
    const has = (...keys: string[]) => keys.some((k) => l.includes(k));
    if (l === "r" || has("red")) return "r";
    if (l === "g" || has("green")) return "g";
    if (l === "b" || has("blue")) return "b";
    if (l === "w" || has("white")) return "white";
    if (l === "a" || has("amber")) return "amber";
    if (has("uv", "ultra", "violet", "purple")) return "uv";
    if (l === "c" || has("cyan")) return "cyan";
    if (l === "m" || has("magenta")) return "magenta";
    if (l === "y" || has("yellow")) return "yellow";
    if (has("lime")) return "g";
    return null;
}

function componentByte(comp: ColorComponent, c: RGB): number {
    switch (comp) {
        case "r":
            return c.r;
        case "g":
            return c.g;
        case "b":
            return c.b;
        case "white":
            return Math.min(c.r, c.g, c.b);
        case "amber":
            return clampByte(Math.min(c.r, c.g) - c.b);
        case "uv":
            return clampByte(Math.min(c.r, c.b) - c.g);
        case "cyan":
            return clampByte(Math.min(c.g, c.b) - c.r);
        case "magenta":
            return clampByte(Math.min(c.r, c.b) - c.g);
        case "yellow":
            return clampByte(Math.min(c.r, c.g) - c.b);
        default:
            return 255;
    }
}

function channelLabel(ch: DMXChannel): string {
    const raw = ch.properties?.["label"];
    return typeof raw === "string" ? raw : "";
}

function isOpenEntry(e: FixtureEntryRow): boolean {
    return /open|no\s*gobo|spot|white/i.test(e.label ?? "");
}

/** Picks the colour-wheel slot whose entry colour is closest to the target; -1 if none have colour. */
function nearestColorSlot(entries: FixtureEntryRow[], target: RGB): number {
    let best = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < entries.length; i++) {
        const hex = entries[i].color;
        if (!hex) continue;
        const d = rgbDistance(hexToRgb(hex), target);
        if (d < bestDist) {
            bestDist = d;
            best = i;
        }
    }
    return best;
}

function openSlotIndex(entries: FixtureEntryRow[]): number {
    return entries.findIndex(isOpenEntry);
}

/** Picks a non-open slot for a beam look, cycling by pose index; falls back to open/0. */
function patternSlotIndex(entries: FixtureEntryRow[], poseIndex: number): number {
    const nonOpen: number[] = [];
    for (let i = 0; i < entries.length; i++) {
        if (!isOpenEntry(entries[i])) nonOpen.push(i);
    }
    if (nonOpen.length === 0) return entries.length > 0 ? 0 : -1;
    return nonOpen[poseIndex % nonOpen.length];
}

/** First entry index whose label/mode matches any keyword; -1 if none. */
function entryIndexByKeyword(entries: FixtureEntryRow[], keywords: string[]): number {
    return entries.findIndex((e) => {
        const text = `${e.label ?? ""} ${e.mode ?? ""}`.toLowerCase();
        return keywords.some((k) => text.includes(k));
    });
}

/** True when the fixture has any pan or tilt channel (i.e. a generated show makes sense). */
export function fixtureSupportsMovingHeadShow(fixture: DMXFixture): boolean {
    return (fixture.channels ?? []).some((c) => PAN_TYPES.has(c.type) || TILT_TYPES.has(c.type));
}

/**
 * Builds 10 ready-made poses for a moving head. Pan/tilt/dimmer/shutter are rendered through the
 * same live-control path the manual "Save as cue" capture uses (defaultDmxLiveControlState +
 * buildDmxLivePatch). On top of that each pose carries a palette colour — mapped onto colour-wheel
 * slots (nearest entry colour) and RGB colour-component channels (by label, or positional R/G/B…
 * order) — and beam looks engage gobo patterns and prisms while washes stay open. Any channel type
 * the fixture lacks is simply skipped.
 */
export function generateMovingHeadShow(fixture: DMXFixture): DMXFixtureCue[] {
    const base = Math.max(1, Math.round(fixture.dmxAddress || 1));
    const channels = fixture.channels ?? [];
    const stamp = Date.now().toString(36);

    // Resolve each colour-component channel to a colour role (by label, else positional order).
    const colorComponents = channels.filter((c) => c.type === "colorComponent");
    const componentRoles = new Map<number, ColorComponent>();
    colorComponents.forEach((ch, i) => {
        componentRoles.set(ch.channel, componentFromLabel(channelLabel(ch)) ?? POSITIONAL_COMPONENTS[i] ?? "white");
    });

    return SHOW_POSES.map((pose, idx) => {
        const rgb = hexToRgb(pose.color);
        const state: DMXLiveControlState = defaultDmxLiveControlState(fixture);
        const entryChannels = {...state.entryChannels};

        for (const ch of channels) {
            const prev = entryChannels[ch.channel] ?? defaultEntryStateForChannel(ch);
            const entries = parseFixtureEntries(ch.properties);

            if (PAN_TYPES.has(ch.type)) {
                entryChannels[ch.channel] = {...prev, linear01: pose.pan01};
            } else if (TILT_TYPES.has(ch.type)) {
                entryChannels[ch.channel] = {...prev, linear01: pose.tilt01};
            } else if (DIMMER_TYPES.has(ch.type)) {
                entryChannels[ch.channel] = {...prev, linear01: 1};
            } else if (ch.type === "shutterStrobe") {
                entryChannels[ch.channel] = {...prev, shutter: "open"};
            } else if (ch.type === "movementSpeed") {
                // A small, stable value keeps the motor fast so it follows the chase smoothly.
                entryChannels[ch.channel] = {...prev, linear01: 0.12};
            } else if (ch.type === "colorWheel" && entries.length > 0) {
                let slot = nearestColorSlot(entries, rgb);
                if (slot < 0) {
                    slot = pose.beam ? patternSlotIndex(entries, idx) : openSlotIndex(entries);
                }
                if (slot < 0) slot = 0;
                entryChannels[ch.channel] = {...prev, slotIdx: slot, within01: 0.5};
            } else if (ch.type === "goboWheel" && entries.length > 0) {
                const open = openSlotIndex(entries);
                const slot = pose.beam ? patternSlotIndex(entries, idx) : open >= 0 ? open : 0;
                entryChannels[ch.channel] = {...prev, slotIdx: slot < 0 ? 0 : slot, within01: 0.5};
            } else if (ch.type === "goboRotation" && entries.length > 0) {
                // Engage a gentle rotation only on beam looks; leave washes at their default.
                if (pose.beam) {
                    const slot = entryIndexByKeyword(entries, ["slow cw", "slow", "cw", "rotat", "forward"]);
                    if (slot >= 0) entryChannels[ch.channel] = {...prev, slotIdx: slot, within01: 0.5};
                }
            } else if (PRISM_TYPES.has(ch.type) && entries.length >= 2) {
                // Only touch prisms that expose distinct slots (open + macros). Engage on beams,
                // return to the open/out slot on washes.
                if (pose.beam) {
                    const slot = patternSlotIndex(entries, idx);
                    if (slot >= 0) entryChannels[ch.channel] = {...prev, slotIdx: slot, within01: 0.5};
                } else {
                    const out = openSlotIndex(entries);
                    if (out >= 0) entryChannels[ch.channel] = {...prev, slotIdx: out, within01: 0.5};
                }
            }
        }

        const values: Record<string, number> = {};
        for (const {address, value} of buildDmxLivePatch(fixture, {...state, entryChannels})) {
            const offset = address - base + 1;
            if (offset >= 1) {
                values[String(offset)] = value;
            }
        }

        // Drive RGB colour-component channels straight from the palette colour, and force master
        // on/off + lamp channels on so each pose actually emits light.
        for (const ch of channels) {
            if (ch.type === "colorComponent") {
                const role = componentRoles.get(ch.channel);
                if (role) values[String(ch.channel)] = componentByte(role, rgb);
            } else if (ch.type === "onOff" || ch.type === "lamp") {
                values[String(ch.channel)] = 255;
            }
        }

        return {
            id: `cue-show-${stamp}-${idx}`,
            label: i18n.t(`dmx:cueShow.poses.${pose.labelKey}`),
            values,
            // Washes breathe; beam looks snap. (Per-pose overrides; the sequence keeps a default too.)
            holdMs: pose.beam ? 2400 : 5000,
            fadeMs: pose.beam ? 450 : 1400,
        };
    });
}
