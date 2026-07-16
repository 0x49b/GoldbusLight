import type { DMXChannel, DMXChannelType, JSONMap } from "@/types/controller.ts";
import { type ColorWheelScrollRamp } from "@/lib/colorWheelSlot";
import { type LiveSlotKind } from "@/lib/dmxLiveWidget.ts";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export type SlotEntry = {
    from: number;
    to: number;
    label: string;
    mode?: string;
    color?: string;
    direction?: string;
    scrollRamp?: ColorWheelScrollRamp;
    numeric?: number;
    goboIdentifier?: string;
    goboName?: string;
    goboImage?: string;
    liveSlotKind?: LiveSlotKind;
};

export interface ChannelEditorProps {
    ch: DMXChannel;
    originalIdx: number;
    propsMap: JSONMap;
    slots: SlotEntry[];
    slotMode: boolean;
    showSlotKindEditor: boolean;
    updateChannelAt: (originalIdx: number, patch: Partial<DMXChannel>) => void;
    replaceChannelAt: (originalIdx: number, next: DMXChannel) => void;
    busy: boolean;
    setGoboPickerTarget?: (target: { channelIdx: number; slotIdx: number } | null) => void;
}

export const MOTION_TABLE_TYPES = new Set<DMXChannelType>([
    "movementSpeed",
    "infinitePan",
    "infiniteTilt",
    "goboRotation",
    "goboRotationFine",
]);

export const ENTRY_FIRST_TYPES = new Set<DMXChannelType>([
    "colorWheel",
    "goboWheel",
    "goboRotation",
    "goboRotationFine",
    "goboShake",
    "goboIndexing",
    "goboIndexingFine",
    "infinitePan",
    "infiniteTilt",
    "movementSpeed",
    "shutterStrobe",
]);

export function EntryLiveSlotKindSelect({
    value,
    onChange,
    disabled,
}: {
    value: LiveSlotKind | undefined;
    onChange: (kind: LiveSlotKind) => void;
    disabled?: boolean;
}) {
    return (
        <NativeSelect
            value={value ?? "button"}
            onChange={(e) => onChange(e.target.value as LiveSlotKind)}
            disabled={disabled}
            className="h-8"
        >
            <NativeSelectOption value="button">Switch</NativeSelectOption>
            <NativeSelectOption value="slider">Slider</NativeSelectOption>
        </NativeSelect>
    );
}

export function clamp255(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n)));
}

export function slotColorToPickerValue(color: string | undefined): string {
    if (!color || typeof color !== "string") {
        return "#888888";
    }
    const s = color.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(s)) {
        return s.toLowerCase();
    }
    if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
        const r = s[1];
        const g = s[2];
        const b = s[3];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return "#888888";
}

export const RAINBOW_SWATCH_CONIC =
    "conic-gradient(from 0deg, hsl(0,100%,55%), hsl(45,100%,52%), hsl(90,100%,48%), hsl(135,100%,48%), hsl(180,100%,50%), hsl(225,100%,52%), hsl(270,100%,55%), hsl(315,100%,55%), hsl(360,100%,55%))";

export function isRainbowModeExplicit(slot: Pick<SlotEntry, "mode">): boolean {
    const m = (slot.mode ?? "").toLowerCase();
    return m === "rainbow" || m === "scroll";
}

export const SHUTTER_MODE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    {value: "closed", label: "Shutter Closed"},
    {value: "open", label: "Shutter Open"},
    {value: "strobe", label: "Strobe"},
    {value: "pulse", label: "Pulse Alternating"},
    {value: "randomStrobe", label: "Random Strobe"},
];

export type MotionStateOption = {
    id: string;
    label: string;
    mode: string;
    direction?: string;
};

export const MOTION_STATE_OPTIONS: MotionStateOption[] = [
    {id: "tracking", label: "Tracking", mode: "tracking"},
    {id: "vector", label: "Vector", mode: "vector"},
    {
        id: "blackout_pt",
        label: "Blackout During Pan/Tilt Movement",
        mode: "blackout_pt",
    },
    {
        id: "blackout_wheel",
        label: "Blackout During Wheel Movement",
        mode: "blackout_wheel",
    },
    {id: "slow_cw", label: "Slow CW", mode: "slow", direction: "cw"},
    {id: "fast_cw", label: "Fast CW", mode: "fast", direction: "cw"},
    {id: "stop", label: "Stop", mode: "stop", direction: "stop"},
    {id: "slow_ccw", label: "Slow CCW", mode: "slow", direction: "ccw"},
    {id: "fast_ccw", label: "Fast CCW", mode: "fast", direction: "ccw"},
];

export function motionStateCueId(slot: Pick<SlotEntry, "mode" | "direction">): string {
    const m = (slot.mode ?? "").toLowerCase();
    const d = (slot.direction ?? "").toLowerCase();
    if (m === "tracking") {
        return "tracking";
    }
    if (m === "vector") {
        return "vector";
    }
    if (m === "blackout_pt" || m === "blackoutpantilt") {
        return "blackout_pt";
    }
    if (m === "blackout_wheel" || m === "blackoutwheel") {
        return "blackout_wheel";
    }
    if (m === "slow" && d === "cw") {
        return "slow_cw";
    }
    if (m === "fast" && d === "cw") {
        return "fast_cw";
    }
    if (m === "stop" || d === "stop") {
        return "stop";
    }
    if (m === "slow" && d === "ccw") {
        return "slow_ccw";
    }
    if (m === "fast" && d === "ccw") {
        return "fast_ccw";
    }
    return "slow_cw";
}

export function parseEntries(props: JSONMap | undefined): SlotEntry[] {
    const raw = props?.entries;
    if (!Array.isArray(raw) || raw.length === 0) {
        return [];
    }
    const out: SlotEntry[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            continue;
        }
        const e = item as Record<string, unknown>;
        const liveSlotRaw = e.liveSlotKind;
        const liveSlotKind =
            liveSlotRaw === "button" || liveSlotRaw === "slider" ? liveSlotRaw : undefined;
        out.push({
            from: typeof e.from === "number" ? e.from : Number(e.from) || 0,
            to: typeof e.to === "number" ? e.to : Number(e.to) || 255,
            label: typeof e.label === "string" ? e.label : "",
            mode: typeof e.mode === "string" ? e.mode : undefined,
            color: typeof e.color === "string" ? e.color : undefined,
            direction: typeof e.direction === "string" ? e.direction : undefined,
            scrollRamp:
                e.scrollRamp === "fastToSlow" || e.scrollRamp === "slowToFast"
                    ? e.scrollRamp
                    : undefined,
            numeric: typeof e.numeric === "number" ? e.numeric : undefined,
            goboIdentifier: typeof e.goboIdentifier === "string" ? e.goboIdentifier : undefined,
            goboName: typeof e.goboName === "string" ? e.goboName : undefined,
            goboImage: typeof e.goboImage === "string" ? e.goboImage : undefined,
            liveSlotKind,
        });
    }
    return out;
}

export function usesSlots(properties: JSONMap | undefined): boolean {
    const entries = parseEntries(properties);
    return entries.length > 0;
}

export function defaultPropsForType(type: DMXChannelType): JSONMap {
    if (ENTRY_FIRST_TYPES.has(type)) {
        switch (type) {
            case "colorWheel":
                return {
                    entries: [
                        { from: 0, to: 14, label: "Open / white", color: "#ffffff" },
                        { from: 15, to: 29, label: "Red", color: "#ff0000" },
                        { from: 30, to: 44, label: "Green", color: "#00ff00" },
                        { from: 45, to: 59, label: "Blue", color: "#0000ff" },
                    ],
                };
            case "goboWheel":
                return {
                    entries: [
                        {
                            from: 0,
                            to: 31,
                            label: "Open",
                            goboIdentifier: "",
                            goboName: "Open",
                            goboImage: "",
                        },
                    ],
                };
            case "shutterStrobe":
                return {
                    entries: [
                        { from: 0, to: 31, label: "Shutter Closed", mode: "closed" },
                        { from: 32, to: 63, label: "Shutter Open", mode: "open" },
                        { from: 64, to: 95, label: "Strobe", mode: "strobe" },
                        { from: 96, to: 127, label: "Pulse Alternating", mode: "pulse" },
                    ],
                };
            case "fog":
                return {
                    entries: [
                        { from: 0, to: 0, label: "Off", liveSlotKind: "button" },
                        { from: 1, to: 255, label: "Volume", liveSlotKind: "slider" },
                    ],
                };
            case "infinitePan":
            case "infiniteTilt":
            case "movementSpeed":
            case "goboRotation":
            case "goboRotationFine":
            case "goboShake":
                return {
                    entries: [
                        {
                            from: 0,
                            to: 42,
                            label: "Slow CW",
                            direction: "cw",
                            mode: "slow",
                            numeric: 0
                        },
                        {
                            from: 43,
                            to: 85,
                            label: "Fast CW",
                            direction: "cw",
                            mode: "fast",
                            numeric: 128
                        },
                        {
                            from: 86,
                            to: 127,
                            label: "Stop",
                            direction: "stop",
                            mode: "stop",
                            numeric: 0
                        },
                        {
                            from: 128,
                            to: 170,
                            label: "Slow CCW",
                            direction: "ccw",
                            mode: "slow",
                            numeric: 0
                        },
                        {
                            from: 171,
                            to: 213,
                            label: "Fast CCW",
                            direction: "ccw",
                            mode: "fast",
                            numeric: 128
                        },
                    ],
                };
            default:
                return { entries: [{ from: 0, to: 255, label: "Slot A" }] };
        }
    }
    if (type === "custom") {
        return {
            label: "",
            partyInclude: true,
            entries: [{ from: 0, to: 255, label: "Slot 1" }],
        };
    }
    return { min: 1, max: 255 };
}
