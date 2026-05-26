import type {DMXChannel, DMXChannelType, JSONMap} from "../types/controller";
import {parseFixtureEntries} from "./dmxLiveMap";

export type DMXLiveWidget =
    | "auto"
    | "hidden"
    | "slider"
    | "slotSlider"
    | "buttons"
    | "buttonSlider"
    | "colorWheel"
    | "goboWheel"
    | "shutterModes";

export type LiveSlotKind = "button" | "slider";

export const DMX_LIVE_WIDGET_OPTIONS: { value: DMXLiveWidget; label: string }[] = [
    {value: "auto", label: "Auto"},
    {value: "hidden", label: "Hidden"},
    {value: "slider", label: "Slider"},
    {value: "slotSlider", label: "Slot slider"},
    {value: "buttons", label: "Buttons"},
    {value: "buttonSlider", label: "Switch + slider"},
    {value: "colorWheel", label: "Color wheel"},
    {value: "goboWheel", label: "Gobo wheel"},
    {value: "shutterModes", label: "Shutter modes"},
];

const FINE_TYPES = new Set<DMXChannelType>(["panFine", "tiltFine", "dimmerFine", "zoomFine", "focusFine", "irisFine", "frostFine"]);

const LIVE_MAPPABLE_TYPES = new Set<DMXChannelType>([
    "pan",
    "panFine",
    "tilt",
    "tiltFine",
    "infinitePan",
    "infiniteTilt",
    "movementSpeed",
    "dimmer",
    "dimmerFine",
    "colorWheel",
    "colorComponent",
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
    "prismRotation",
    "fog",
    "custom",
]);

export function readLiveWidgetOverride(props: JSONMap | undefined): DMXLiveWidget | undefined {
    const raw = props?.liveWidget;
    if (typeof raw !== "string") {
        return undefined;
    }
    const v = raw.trim() as DMXLiveWidget;
    return DMX_LIVE_WIDGET_OPTIONS.some((o) => o.value === v) ? v : undefined;
}

function entrySpan(e: { from: number; to: number }): number {
    return Math.abs(e.to - e.from) + 1;
}

function entriesLookDiscrete(entries: ReturnType<typeof parseFixtureEntries>): boolean {
    if (entries.length === 0 || entries.length > 12) {
        return false;
    }
    return entries.every((e) => entrySpan(e) <= 20);
}

function entriesHaveWideRange(entries: ReturnType<typeof parseFixtureEntries>): boolean {
    return entries.some((e) => entrySpan(e) > 20);
}

/** Off slot at 0 plus a volume range — typical smoke/hazer fog channel. */
function entriesLookLikeOffPlusVolume(entries: ReturnType<typeof parseFixtureEntries>): boolean {
    let hasOff = false;
    let hasVolume = false;
    for (const e of entries) {
        const lo = Math.min(e.from, e.to);
        const hi = Math.max(e.from, e.to);
        if (lo === 0 && hi === 0) {
            hasOff = true;
            continue;
        }
        if (hi >= 1) {
            hasVolume = true;
        }
    }
    return hasOff && hasVolume;
}

function hasLinearRange(props: JSONMap | undefined): boolean {
    return typeof props?.min === "number" || typeof props?.max === "number";
}

export function inferLiveWidget(ch: DMXChannel): DMXLiveWidget {
    if (FINE_TYPES.has(ch.type)) {
        return "hidden";
    }
    if (!LIVE_MAPPABLE_TYPES.has(ch.type)) {
        return "hidden";
    }

    const props = ch.properties as JSONMap | undefined;
    const entries = parseFixtureEntries(props);

    switch (ch.type) {
        case "colorWheel":
            return entries.length > 0 ? "colorWheel" : hasLinearRange(props) ? "slider" : "hidden";
        case "goboWheel":
            return entries.length > 0 ? "goboWheel" : "hidden";
        case "shutterStrobe":
            return entries.length > 0 ? "shutterModes" : hasLinearRange(props) ? "slider" : "hidden";
        case "pan":
        case "tilt":
        case "infinitePan":
        case "infiniteTilt":
        case "dimmer":
        case "dimmerFine":
        case "zoom":
        case "focus":
        case "iris":
            if (entries.length > 0) {
                return entriesLookDiscrete(entries) ? "buttons" : "slotSlider";
            }
            return "slider";
        case "fog":
            if (entries.length > 0 && entriesLookLikeOffPlusVolume(entries)) {
                return "buttonSlider";
            }
            if (entries.length > 0) {
                return entriesLookDiscrete(entries) ? "buttons" : "slotSlider";
            }
            return "slider";
        case "frost":
            if (entries.length > 0) {
                return entriesHaveWideRange(entries) ? "slotSlider" : "buttons";
            }
            return "slider";
        case "movementSpeed":
        case "goboRotation":
        case "goboRotationFine":
        case "goboShake":
        case "goboIndexing":
        case "goboIndexingFine":
        case "prism":
        case "prismRotation":
        case "prismIndexing":
        case "prismIndexingFine":
        case "custom":
            if (entries.length > 0) {
                return entriesLookDiscrete(entries) ? "buttons" : "slotSlider";
            }
            return hasLinearRange(props) ? "slider" : "hidden";
        default:
            if (entries.length > 0) {
                return entriesLookDiscrete(entries) ? "buttons" : "slotSlider";
            }
            return hasLinearRange(props) ? "slider" : "hidden";
    }
}

export function resolveLiveWidget(ch: DMXChannel): DMXLiveWidget {
    const override = readLiveWidgetOverride(ch.properties as JSONMap | undefined);
    if (override && override !== "auto") {
        return override;
    }
    return inferLiveWidget(ch);
}

/** Why a channel is omitted from the live tab. */
export type LiveWidgetHiddenSource = "override" | "inferred";

export function isLiveWidgetHidden(ch: DMXChannel): boolean {
    return resolveLiveWidget(ch) === "hidden";
}

/** When hidden: `override` = Live control set to Hidden; `inferred` = Auto (e.g. fine channels). */
export function liveWidgetHiddenSource(ch: DMXChannel): LiveWidgetHiddenSource | null {
    if (!isLiveWidgetHidden(ch)) {
        return null;
    }
    const override = readLiveWidgetOverride(ch.properties as JSONMap | undefined);
    return override === "hidden" ? "override" : "inferred";
}

export function liveWidgetHiddenBadgeLabel(source: LiveWidgetHiddenSource): string {
    return source === "override" ? "Hidden · set in editor" : "Hidden · auto";
}

export function liveWidgetLabel(widget: DMXLiveWidget): string {
    return DMX_LIVE_WIDGET_OPTIONS.find((o) => o.value === widget)?.label ?? widget;
}

/** How the live tab shows the current value for a linear `slider` widget. */
export type LiveSliderLabelMode = "percent" | "dmx";

export const LIVE_SLIDER_LABEL_OPTIONS: { value: LiveSliderLabelMode; label: string }[] = [
    {value: "percent", label: "Percent (%)"},
    {value: "dmx", label: "DMX (0–255)"},
];

export function isDegreeSliderChannel(ch: DMXChannel): boolean {
    return (
        ch.type === "pan" ||
        ch.type === "tilt" ||
        ch.type === "infinitePan" ||
        ch.type === "infiniteTilt"
    );
}

export function readLiveSliderLabelMode(props: JSONMap | undefined, ch: DMXChannel): LiveSliderLabelMode {
    const raw = props?.liveSliderLabel;
    if (raw === "percent" || raw === "dmx") {
        return raw;
    }
    if (ch.type === "dimmer" || ch.type === "dimmerFine") {
        return "percent";
    }
    return "dmx";
}

export function liveSliderLabelModeHint(mode: LiveSliderLabelMode): string {
    return mode === "percent" ? "%" : "0–255";
}

export function channelLiveTileId(ch: DMXChannel): string {
    return `ch-${ch.channel}`;
}

export function parseChannelLiveTileId(id: string): number | null {
    if (!id.startsWith("ch-")) {
        return null;
    }
    const n = Number(id.slice(3));
    return Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
}

function readEntryLiveSlotKind(raw: unknown): LiveSlotKind | undefined {
    if (typeof raw !== "string") {
        return undefined;
    }
    const v = raw.trim();
    return v === "button" || v === "slider" ? v : undefined;
}

function inferEntryLiveSlotKind(
    entry: { from: number; to: number; label?: string; mode?: string },
    index: number,
): LiveSlotKind {
    const lo = Math.min(entry.from, entry.to);
    const hi = Math.max(entry.from, entry.to);
    const span = hi - lo + 1;
    const hay = `${entry.label ?? ""} ${entry.mode ?? ""}`.toLowerCase();
    if (lo === 0 && hi === 0) {
        return "button";
    }
    if (hay.includes("off") && span <= 1) {
        return "button";
    }
    if (span <= 3) {
        return "button";
    }
    return "slider";
}

/** Per-entry live control: switch vs range slider (for `buttonSlider` widget). */
export function parseEntryLiveSlotKinds(
    props: JSONMap | undefined,
    entries: ReturnType<typeof parseFixtureEntries>,
): LiveSlotKind[] {
    const raw = props?.entries;
    const rawList = Array.isArray(raw) ? raw : [];
    return entries.map((entry, i) => {
        const item = rawList[i];
        if (item && typeof item === "object" && !Array.isArray(item)) {
            const fromItem = readEntryLiveSlotKind((item as Record<string, unknown>).liveSlotKind);
            if (fromItem) {
                return fromItem;
            }
        }
        return inferEntryLiveSlotKind(entry, i);
    });
}

export function findOffButtonSlotIndex(
    entries: ReturnType<typeof parseFixtureEntries>,
    kinds: LiveSlotKind[],
): number {
    for (let i = 0; i < entries.length; i++) {
        if (kinds[i] !== "button") {
            continue;
        }
        const e = entries[i];
        const lo = Math.min(e.from, e.to);
        const hi = Math.max(e.from, e.to);
        const hay = `${e.label ?? ""} ${e.mode ?? ""}`.toLowerCase();
        if (lo === 0 && hi === 0) {
            return i;
        }
        if (hay.includes("off")) {
            return i;
        }
    }
    return -1;
}

export function firstSliderSlotIndex(kinds: LiveSlotKind[]): number {
    return kinds.findIndex((k) => k === "slider");
}

export function isWidgetAllowedForChannelType(widget: DMXLiveWidget, type: DMXChannelType): boolean {
    if (
        widget === "auto" ||
        widget === "hidden" ||
        widget === "slider" ||
        widget === "slotSlider" ||
        widget === "buttons" ||
        widget === "buttonSlider"
    ) {
        return true;
    }
    if (widget === "colorWheel") {
        return type === "colorWheel" || type === "colorComponent";
    }
    if (widget === "goboWheel") {
        return type === "goboWheel";
    }
    if (widget === "shutterModes") {
        return type === "shutterStrobe";
    }
    return false;
}
