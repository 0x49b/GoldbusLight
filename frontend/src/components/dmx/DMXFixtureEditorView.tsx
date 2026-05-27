import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Checkbox} from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Slider} from "@/components/ui/slider";
import {NativeSelect, NativeSelectOption} from "@/components/ui/native-select";
import {Popover, PopoverContent, PopoverTrigger,} from "@/components/ui/popover";
import {Separator} from "@/components/ui/separator";
import {
    buildDMXFixtureConfigPayload,
    parseDMXFixtureConfigPayload,
    safeDMXFixtureConfigFilename,
} from "@/lib/dmxFixtureConfigTransfer";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {readCustomPartyInclude} from "@/lib/dmxPartyInclude.ts";
import {
    liveWidgetHiddenBadgeLabel,
    liveWidgetHiddenSource,
    resolveLiveWidget,
    type LiveSlotKind,
} from "@/lib/dmxLiveWidget.ts";
import {LiveControlEditorField} from "./LiveControlEditorField";
import {isFixtureInParty} from "@/lib/partyTargets";
import {cn} from "@/lib/utils";
import {
    ArrowDownRight,
    ArrowUpRight,
    EyeOff,
    Minus,
    MoreHorizontal,
    RotateCcw,
    RotateCw,
    Triangle,
    Zap
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {PiPlus, PiTrash} from "react-icons/pi";
import type {DMXLiveStatus} from "../../../bindings/goldbus/internal/dmx";
import type {
    DetailRoute,
    DMXChannel,
    DMXChannelType,
    DMXFixture,
    DMXFixtureParty,
    DMXFixtureType,
    DMXState,
    JSONMap,
    UpsertDMXFixtureInput,
    USBSerialDevice,
} from "@/types/controller.ts";
import {ButtonGroup} from "../ui/button-group";
import {DMXFixtureLiveControls} from "./DMXFixtureLiveControls";

type FixturePageMode = "editor" | "live";

const FIXTURE_TYPE_OPTIONS: ReadonlyArray<{ value: DMXFixtureType; label: string }> = [
    {value: "colorChanger", label: "Color Changer"},
    {value: "dimmer", label: "Dimmer"},
    {value: "effect", label: "Effect"},
    {value: "fan", label: "Fan"},
    {value: "flower", label: "Flower"},
    {value: "hazer", label: "Hazer"},
    {value: "laser", label: "Laser"},
    {value: "ledBarBeams", label: "LED Bar (Beams)"},
    {value: "ledBarPixels", label: "LED Bar (Pixels)"},
    {value: "movingHead", label: "Moving Head"},
    {value: "other", label: "Other"},
    {value: "scanner", label: "Scanner"},
    {value: "smoke", label: "Smoke"},
    {value: "strobe", label: "Strobe"},
];

const PAN_TILT_FIXTURE_TYPES = new Set<DMXFixtureType>(["movingHead", "scanner", "laser"]);

function buildFixturePartySavePayload(
    channels: DMXChannel[],
    partyChannelWeights: Record<string, number>,
    partyStrobeEnabled: boolean,
    partyStrobeOnMs: number,
    partyStrobeOffMs: number,
): DMXFixtureParty {
    const cw: Record<string, number> = {};
    for (const ch of channels) {
        const k = String(Math.round(ch.channel));
        const raw = partyChannelWeights[k];
        const w = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : 100;
        if (w !== 100) {
            cw[k] = Math.max(0, Math.min(100, w));
        }
    }
    return {
        ...(Object.keys(cw).length > 0 ? {channelWeights: cw} : {}),
        strobeEnabled: partyStrobeEnabled,
        strobeOnMs: Math.max(20, Math.round(partyStrobeOnMs) || 120),
        strobeOffMs: Math.max(20, Math.round(partyStrobeOffMs) || 500),
    };
}

type DMXFixtureEditorViewProps = {
    fixture: DMXFixture | undefined;
    busy: boolean;
    onCreate: (input: UpsertDMXFixtureInput) => Promise<DMXFixture | null>;
    onUpdate: (input: UpsertDMXFixtureInput) => Promise<DMXFixture | null>;
    onDelete: (fixtureID: string) => Promise<boolean>;
    onOpenFixture: (fixtureID: string) => void;
    dmxState: DMXState;
    usbSerialDevices: USBSerialDevice[];
    dmxLiveStatus: DMXLiveStatus | null;
    setRoute: (route: DetailRoute) => void;
    pullDMXLiveStatus: () => Promise<void>;
    queueDmxLivePatch: (entries: Array<{ address: number; value: number }>) => void;
    startDMXLiveOutput: (fixtureID: string) => Promise<boolean>;
    stopDMXLiveOutput: () => Promise<void>;
    onRefreshUSBSerialDevices: () => Promise<void>;
    onSelectUSBSerialDevice: (deviceID: string) => Promise<void>;
    partyRunning: boolean;
    pullDMXState: () => Promise<unknown>;
};

const DMX_CHANNEL_TYPES: DMXChannelType[] = [
    "colorComponent",
    "colorTemperature",
    "colorTemperatureFine",
    "colorWheel",
    "command",
    "custom",
    "dimmer",
    "dimmerFine",
    "fog",
    "focus",
    "focusFine",
    "frost",
    "frostFine",
    "goboIndexing",
    "goboIndexingFine",
    "goboRotation",
    "goboRotationFine",
    "goboShake",
    "goboWheel",
    "greenSaturation",
    "greenSaturationFine",
    "infinitePan",
    "infiniteTilt",
    "iris",
    "irisFine",
    "lamp",
    "movementSpeed",
    "onOff",
    "operatingMode",
    "pan",
    "panFine",
    "prism",
    "prismIndexing",
    "prismIndexingFine",
    "prismRotation",
    "shutterStrobe",
    "tilt",
    "tiltFine",
    "timer",
    "xfadeToColor",
    "xfadeToColorFine",
    "zoom",
    "zoomFine",
];

/** Types that default to slot-based `entries` instead of linear min/max. */
const ENTRY_FIRST_TYPES = new Set<DMXChannelType>([
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

type SlotEntry = {
    from: number;
    to: number;
    label: string;
    mode?: string;
    color?: string;
    direction?: string;
    numeric?: number;
    goboIdentifier?: string;
    goboName?: string;
    goboImage?: string;
    /** buttonSlider: switch vs range slider for this slot */
    liveSlotKind?: LiveSlotKind;
};

type GoboCatalogEntry = {
    code: string;
    name: string;
    image: string;
};

function clamp255(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n)));
}

function slotColorToPickerValue(color: string | undefined): string {
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

/** Conic spectrum for rainbow / scroll-style color wheel slots. */
const RAINBOW_SWATCH_CONIC =
    "conic-gradient(from 0deg, hsl(0,100%,55%), hsl(45,100%,52%), hsl(90,100%,48%), hsl(135,100%,48%), hsl(180,100%,50%), hsl(225,100%,52%), hsl(270,100%,55%), hsl(315,100%,55%), hsl(360,100%,55%))";

function isRainbowColorSlot(slot: Pick<SlotEntry, "label" | "mode">): boolean {
    const label = (slot.label ?? "").toLowerCase();
    const mode = (slot.mode ?? "").toLowerCase();
    return label.includes("rainbow") || mode === "rainbow" || mode === "scroll";
}

function isRainbowModeExplicit(slot: Pick<SlotEntry, "mode">): boolean {
    const m = (slot.mode ?? "").toLowerCase();
    return m === "rainbow" || m === "scroll";
}

const SHUTTER_MODE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    {value: "closed", label: "Shutter Closed"},
    {value: "open", label: "Shutter Open"},
    {value: "strobe", label: "Strobe"},
    {value: "pulse", label: "Pulse Alternating"},
    {value: "randomStrobe", label: "Random Strobe"},
];

function shutterSelectValue(mode: string | undefined): string {
    const m = mode ?? "";
    return SHUTTER_MODE_OPTIONS.some((o) => o.value === m) ? m : "open";
}

function ShutterStateGlyph({mode}: { mode?: string }) {
    const m = (mode ?? "").toLowerCase();
    if (m === "closed") {
        return <div className="size-6 shrink-0 rounded-full bg-foreground" aria-hidden/>;
    }
    if (m === "open") {
        return (
            <div
                className="size-6 shrink-0 rounded-full border-2 border-foreground bg-background"
                aria-hidden
            />
        );
    }
    if (m === "strobe" || m === "randomstrobe") {
        return <Zap className="size-6 shrink-0 text-foreground" strokeWidth={2.25} aria-hidden/>;
    }
    if (m === "pulse") {
        return (
            <Triangle
                className="size-6 shrink-0 fill-foreground text-foreground"
                strokeWidth={1.5}
                aria-hidden
            />
        );
    }
    return (
        <div
            className="size-6 shrink-0 rounded-full border border-dashed border-muted-foreground"
            aria-hidden
        />
    );
}

type MotionStateOption = {
    id: string;
    label: string;
    mode: string;
    direction?: string;
};

const MOTION_STATE_OPTIONS: MotionStateOption[] = [
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

const MOTION_TABLE_TYPES = new Set<DMXChannelType>([
    "movementSpeed",
    "infinitePan",
    "infiniteTilt",
    "goboRotation",
    "goboRotationFine",
]);

function motionStatePresetId(slot: Pick<SlotEntry, "mode" | "direction">): string {
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

function parseGoboCatalog(data: unknown): GoboCatalogEntry[] {
    if (!Array.isArray(data)) {
        return [];
    }
    const out: GoboCatalogEntry[] = [];
    for (const item of data) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            continue;
        }
        const o = item as Record<string, unknown>;
        const code = typeof o.code === "string" ? o.code : "";
        const name = typeof o.name === "string" ? o.name : "";
        const image = typeof o.image === "string" ? o.image : "";
        if (code && name && image) {
            out.push({code, name, image});
        }
    }
    return out;
}

function defaultPropsForType(type: DMXChannelType): JSONMap {
    if (ENTRY_FIRST_TYPES.has(type)) {
        switch (type) {
            case "colorWheel":
                return {
                    entries: [
                        {from: 0, to: 14, label: "Open / white", color: "#ffffff"},
                        {from: 15, to: 29, label: "Red", color: "#ff0000"},
                        {from: 30, to: 44, label: "Green", color: "#00ff00"},
                        {from: 45, to: 59, label: "Blue", color: "#0000ff"},
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
                        {from: 0, to: 31, label: "Shutter Closed", mode: "closed"},
                        {from: 32, to: 63, label: "Shutter Open", mode: "open"},
                        {from: 64, to: 95, label: "Strobe", mode: "strobe"},
                        {from: 96, to: 127, label: "Pulse Alternating", mode: "pulse"},
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
                return {entries: [{from: 0, to: 255, label: "Slot A"}]};
        }
    }
    if (type === "custom") {
        return {
            label: "",
            partyInclude: true,
            entries: [{from: 0, to: 255, label: "Slot 1"}],
        };
    }
    return {min: 1, max: 255};
}

function cloneChannels(from: DMXChannel[]): DMXChannel[] {
    return from.map((c) => ({
        channel: c.channel,
        type: c.type,
        defaultValue: typeof c.defaultValue === "number" ? Math.max(0, Math.min(255, Math.round(c.defaultValue))) : undefined,
        properties: c.properties ? ({...c.properties} as JSONMap) : undefined,
    }));
}

function defaultInitialChannels(): DMXChannel[] {
    return [{channel: 1, type: "pan", defaultValue: 128, properties: {min: 1, max: 255}}];
}

function parseEntries(props: JSONMap | undefined): SlotEntry[] {
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
            numeric: typeof e.numeric === "number" ? e.numeric : undefined,
            goboIdentifier: typeof e.goboIdentifier === "string" ? e.goboIdentifier : undefined,
            goboName: typeof e.goboName === "string" ? e.goboName : undefined,
            goboImage: typeof e.goboImage === "string" ? e.goboImage : undefined,
            liveSlotKind,
        });
    }
    return out;
}

function usesSlots(properties: JSONMap | undefined): boolean {
    const entries = parseEntries(properties);
    return entries.length > 0;
}

function EntryLiveSlotKindSelect({
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

function maxChannelOffset(dmxAddress: number): number {
    const base = Number.isFinite(dmxAddress) && dmxAddress >= 1 && dmxAddress <= 512 ? Math.round(dmxAddress) : 1;
    return 512 - base + 1;
}

function channelFootprint(channels: DMXChannel[]): number {
    if (!channels.length) {
        return 1;
    }
    let maxOffset = 1;
    for (const channel of channels) {
        const offset = Number.isFinite(channel.channel) ? Math.round(channel.channel) : 1;
        if (offset > maxOffset) {
            maxOffset = offset;
        }
    }
    return Math.max(1, maxOffset);
}

function fixtureFootprint(fixture: DMXFixture): number {
    return channelFootprint(fixture.channels ?? []);
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
    return startA <= endB && startB <= endA;
}

function findNextAvailableAddress(
    preferredStart: number,
    channels: DMXChannel[],
    fixtures: DMXFixture[],
    excludedFixtureId?: string,
): number | null {
    const footprint = channelFootprint(channels);
    const minStart = 1;
    const maxStart = 512 - footprint + 1;
    if (maxStart < minStart) {
        return null;
    }
    const candidateStart = Math.max(minStart, Math.min(maxStart, Math.round(preferredStart) || minStart));

    for (let start = candidateStart; start <= maxStart; start++) {
        const end = start + footprint - 1;
        const overlaps = fixtures.some((fixture) => {
            if (fixture.id === excludedFixtureId) {
                return false;
            }
            const otherStart = Number.isFinite(fixture.dmxAddress) ? Math.round(fixture.dmxAddress) : 1;
            const otherEnd = otherStart + fixtureFootprint(fixture) - 1;
            return rangesOverlap(start, end, otherStart, otherEnd);
        });
        if (!overlaps) {
            return start;
        }
    }
    return null;
}

export function DMXFixtureEditorView(props: DMXFixtureEditorViewProps) {
    const [fixtureType, setFixtureType] = useState<DMXFixtureType>("movingHead");
    const [name, setName] = useState("");
    const [brand, setBrand] = useState("");
    const [address, setAddress] = useState(1);
    const [maxPan, setMaxPan] = useState(540);
    const [maxTilt, setMaxTilt] = useState(270);
    const [channels, setChannels] = useState<DMXChannel[]>(defaultInitialChannels);
    const [partyChannelWeights, setPartyChannelWeights] = useState<Record<string, number>>({});
    const [partyStrobeEnabled, setPartyStrobeEnabled] = useState(false);
    const [partyStrobeOnMs, setPartyStrobeOnMs] = useState(120);
    const [partyStrobeOffMs, setPartyStrobeOffMs] = useState(500);
    const [saveHint, setSaveHint] = useState<string | null>(null);
    const [pageMode, setPageMode] = useState<FixturePageMode>(props.fixture ? "live" : "editor");
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const importInputRef = useRef<HTMLInputElement | null>(null);
    const isCurrentFixtureLive = props.fixture != null && props.dmxLiveStatus?.connected === true;
    const fixturePartyIncluded = props.fixture ? isFixtureInParty(props.fixture.id, props.dmxState.party?.config) : false;
    const actionGroupDisabled = props.busy || isCurrentFixtureLive;
    const showPanTiltInputs     = PAN_TILT_FIXTURE_TYPES.has(fixtureType);

    useEffect(() => {
        if (props.fixture) {
            setFixtureType(props.fixture.type || "movingHead");
            setName(props.fixture.name);
            setBrand(props.fixture.brand);
            setAddress(props.fixture.dmxAddress || 1);
            setMaxPan(props.fixture.movingHead?.maxPan ?? 540);
            setMaxTilt(props.fixture.movingHead?.maxTilt ?? 270);
            setChannels(props.fixture.channels?.length ? cloneChannels(props.fixture.channels) : defaultInitialChannels());
            const pw = props.fixture.party?.channelWeights ?? {};
            setPartyChannelWeights({...pw});
            setPartyStrobeEnabled(!!props.fixture.party?.strobeEnabled);
            setPartyStrobeOnMs(Math.max(20, props.fixture.party?.strobeOnMs ?? 120));
            setPartyStrobeOffMs(Math.max(20, props.fixture.party?.strobeOffMs ?? 500));
            setSaveHint(null);
            return;
        }
        setName("");
        setBrand("");
        setFixtureType("movingHead");
        setAddress(1);
        setMaxPan(540);
        setMaxTilt(270);
        setChannels(defaultInitialChannels());
        setPartyChannelWeights({});
        setPartyStrobeEnabled(false);
        setPartyStrobeOnMs(120);
        setPartyStrobeOffMs(500);
    }, [props.fixture?.id, props.fixture?.updatedAt]);

    useEffect(() => {
        setPageMode(props.fixture ? "live" : "editor");
    }, [props.fixture?.id]);

    useEffect(() => {
        if (props.fixture && pageMode === "live") {
            void props.pullDMXLiveStatus();
        }
    }, [pageMode, props.fixture?.id, props.pullDMXLiveStatus]);

    const [goboCatalog, setGoboCatalog] = useState<GoboCatalogEntry[] | null>(null);
    const [goboCatalogError, setGoboCatalogError] = useState<string | null>(null);
    const [goboPickerTarget, setGoboPickerTarget] = useState<{
        channelIdx: number;
        slotIdx: number
    } | null>(
        null,
    );
    const [goboCatalogFilter, setGoboCatalogFilter] = useState("");
    useEffect(() => {
        let cancelled = false;
        setGoboCatalogError(null);
        (async () => {
            try {
                const res = await fetch("/gobos/catalog.json");
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const data: unknown = await res.json();
                if (cancelled) {
                    return;
                }
                setGoboCatalog(parseGoboCatalog(data));
            } catch (e) {
                if (!cancelled) {
                    setGoboCatalogError(e instanceof Error ? e.message : "Failed to load gobo catalog");
                    setGoboCatalog([]);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!goboPickerTarget) {
            setGoboCatalogFilter("");
        }
    }, [goboPickerTarget]);

    const goboCatalogShown = useMemo(() => {
        if (!goboCatalog || goboCatalog.length === 0) {
            return [];
        }
        const q = goboCatalogFilter.trim().toLowerCase();
        if (!q) {
            return goboCatalog.slice(0, 400);
        }
        return goboCatalog
            .filter(
                (e) =>
                    e.code.toLowerCase().includes(q) ||
                    e.name.toLowerCase().includes(q),
            )
            .slice(0, 500);
    }, [goboCatalog, goboCatalogFilter]);

    const slotBudget = useMemo(() => maxChannelOffset(address), [address]);

    const channelRows = useMemo(() => {
        return channels
            .map((ch, originalIdx) => ({ch, originalIdx}))
            .sort((a, b) => a.ch.channel - b.ch.channel || a.originalIdx - b.originalIdx);
    }, [channels]);

    const duplicateChannelOffsets = useMemo(() => {
        const counts = new Map<number, number>();
        for (const ch of channels) {
            const off = Math.round(ch.channel);
            if (!Number.isFinite(off)) {
                continue;
            }
            counts.set(off, (counts.get(off) ?? 0) + 1);
        }
        return new Set(
            [...counts.entries()].filter(([, count]) => count > 1).map(([offset]) => offset),
        );
    }, [channels]);

    const updateChannelAt = useCallback((originalIdx: number, patch: Partial<DMXChannel>) => {
        setChannels((prev) =>
            prev.map((c, i) => {
                if (i !== originalIdx) {
                    return c;
                }
                return {
                    ...c,
                    ...patch,
                    properties: patch.properties !== undefined ? patch.properties : c.properties,
                };
            }),
        );
    }, []);

    const replaceChannelAt = useCallback((originalIdx: number, next: DMXChannel) => {
        setChannels((prev) => prev.map((c, i) => (i === originalIdx ? next : c)));
    }, []);

    const addChannel = useCallback(() => {
        const used = new Set(channels.map((c) => c.channel));
        let nextOff = 1;
        while (used.has(nextOff) && nextOff <= slotBudget) {
            nextOff += 1;
        }
        if (nextOff > slotBudget) {
            setSaveHint(`No free channel offsets left for address ${address} (max offset ${slotBudget}).`);
            return;
        }
        setChannels((prev) => [
            ...prev,
            {channel: nextOff, type: "dimmer", defaultValue: 255, properties: defaultPropsForType("dimmer")},
        ]);
        setSaveHint(null);
    }, [address, channels, slotBudget]);

    const removeChannelAt = useCallback((originalIdx: number) => {
        setChannels((prev) => {
            const next = prev.filter((_, i) => i !== originalIdx);
            return next.length > 0 ? next : defaultInitialChannels();
        });
    }, []);

    const buildDraftInput = useCallback((includeID: boolean): UpsertDMXFixtureInput => ({
        id: includeID ? props.fixture?.id : undefined,
        type: fixtureType,
        brand: brand.trim(),
        name: name.trim(),
        dmxAddress: Math.max(1, Math.min(512, Math.round(address) || 1)),
        maxPan: Math.max(0, Math.round(maxPan) || 0),
        maxTilt: Math.max(0, Math.round(maxTilt) || 0),
        party: buildFixturePartySavePayload(
            channels,
            partyChannelWeights,
            partyStrobeEnabled,
            partyStrobeOnMs,
            partyStrobeOffMs,
        ),
        channels: cloneChannels(channels),
    }), [
        address,
        brand,
        channels,
        fixtureType,
        maxPan,
        maxTilt,
        name,
        partyChannelWeights,
        partyStrobeEnabled,
        partyStrobeOffMs,
        partyStrobeOnMs,
        props.fixture?.id,
    ]);

    const handleSave = async () => {
        setSaveHint(null);
        const trimmedBrand = brand.trim();
        const trimmedName = name.trim();
        if (!trimmedBrand || !trimmedName) {
            setSaveHint("Brand and name are required.");
            return;
        }
        const seen = new Set<number>();
        for (const ch of channels) {
            const off = Math.round(ch.channel);
            if (off < 1 || off > slotBudget) {
                setSaveHint(
                    `Channel offset ${off} is invalid for start address ${address}. Use 1–${slotBudget} (DMX slots remaining in universe).`,
                );
                return;
            }
            if (seen.has(off)) {
                setSaveHint(`Channel offset ${off} is used more than once.`);
                return;
            }
            if (ch.defaultValue !== undefined) {
                const defaultValue = Math.round(Number(ch.defaultValue));
                if (!Number.isFinite(defaultValue) || defaultValue < 0 || defaultValue > 255) {
                    setSaveHint(`Channel offset ${off} has an invalid default value (use 0-255).`);
                    return;
                }
            }
            seen.add(off);
        }
        const input = buildDraftInput(true);
        const saved = props.fixture ? await props.onUpdate(input) : await props.onCreate(input);
        if (saved) {
            props.onOpenFixture(saved.id);
        }
    };

    const handleDelete = async () => {
        if (!props.fixture) {
            return;
        }
        const ok = await props.onDelete(props.fixture.id);
        if (ok) {
            props.setRoute({kind: "presets"});
        }
        setDeleteConfirmOpen(false);
    };

    const handleClone = async () => {
        if (!props.fixture) {
            return;
        }
        setSaveHint(null);

        const trimmedBrand = brand.trim();
        const trimmedName = name.trim();
        if (!trimmedBrand || !trimmedName) {
            setSaveHint("Brand and name are required.");
            return;
        }

        const footprint = channelFootprint(channels);
        const sourceStart = Math.max(1, Math.min(512, Math.round(address) || 1));
        const preferredStart = sourceStart + footprint;
        const cloneAddress = findNextAvailableAddress(
            preferredStart,
            channels,
            props.dmxState.fixtures,
            props.fixture.id,
        );

        if (cloneAddress == null) {
            setSaveHint("No free DMX address range available to clone this fixture.");
            return;
        }

        const input: UpsertDMXFixtureInput = {
            type: fixtureType,
            brand: trimmedBrand,
            name: `${trimmedName} Copy`,
            dmxAddress: cloneAddress,
            maxPan: Math.max(0, Math.round(maxPan) || 0),
            maxTilt: Math.max(0, Math.round(maxTilt) || 0),
            party: buildFixturePartySavePayload(
                channels,
                partyChannelWeights,
                partyStrobeEnabled,
                partyStrobeOnMs,
                partyStrobeOffMs,
            ),
            channels: cloneChannels(channels),
        };

        const created = await props.onCreate(input);
        if (created) {
            props.onOpenFixture(created.id);
        }
    };

    const handleExport = () => {
        if (!props.fixture) {
            return;
        }
        setSaveHint(null);
        const input = buildDraftInput(false);
        const payload = buildDMXFixtureConfigPayload(input);
        const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = safeDMXFixtureConfigFilename(input.brand, input.name);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setSaveHint("Fixture config exported.");
    };

    const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) {
            return;
        }
        setSaveHint(null);
        try {
            const json = JSON.parse(await file.text()) as unknown;
            const parsed = parseDMXFixtureConfigPayload(json);
            if (!parsed.ok) {
                setSaveHint(parsed.error);
                return;
            }
            setFixtureType(parsed.input.type);
            setBrand(parsed.input.brand);
            setName(parsed.input.name);
            setAddress(parsed.input.dmxAddress);
            setMaxPan(parsed.input.maxPan);
            setMaxTilt(parsed.input.maxTilt);
            setChannels(cloneChannels(parsed.input.channels));
            const impParty = parsed.input.party;
            if (impParty?.channelWeights) {
                setPartyChannelWeights({...impParty.channelWeights});
            } else {
                setPartyChannelWeights({});
            }
            setPartyStrobeEnabled(!!impParty?.strobeEnabled);
            setPartyStrobeOnMs(Math.max(20, impParty?.strobeOnMs ?? 120));
            setPartyStrobeOffMs(Math.max(20, impParty?.strobeOffMs ?? 500));
            setPageMode("editor");
            setSaveHint("Fixture config imported. Review it, then save to create the fixture.");
        } catch (e) {
            setSaveHint(e instanceof SyntaxError
                ? "Fixture file is not valid JSON."
                : "Could not import fixture file.");
        }
    };
    const handleToggleLive = async () => {
        if (!props.fixture || props.busy) {
            return;
        }
        if (props.partyRunning && fixturePartyIncluded) {
            props.setRoute({kind: "party"});
            return;
        }
        if (isCurrentFixtureLive) {
            await props.stopDMXLiveOutput();
            await props.pullDMXLiveStatus();
            return;
        }
        await props.startDMXLiveOutput("");
        await props.pullDMXLiveStatus();
    };

    return (
        <div className="space-y-4">
            <div
                className="sticky left-0 right-0 top-[-1rem] z-50 isolate -mx-4 -mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-2 shadow-sm md:-mx-6 md:-mt-6 md:top-[-1.5rem] md:px-6">
                <div className="flex flex-wrap items-center gap-3">
                    {props.fixture ? (
                        <>
                            <ButtonGroup>
                            <Button
                                    type="button"
                                    variant="outline"
                                    className={pageMode === "live" ? "btn-active" : ""}
                                    aria-pressed={pageMode === "live"}
                                    onClick={() => setPageMode("live")}
                                >
                                    Live
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className={pageMode === "editor" ? "btn-active" : ""}
                                    aria-pressed={pageMode === "editor"}
                                    onClick={() => setPageMode("editor")}
                                >
                                    Editor
                                </Button>
                            </ButtonGroup>
                        </>
                    ) : null}
                    {props.fixture ? (
                        <span
                            className="text-sm font-medium text-muted-foreground">{props.fixture.name}</span>
                    ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {props.fixture && (
                        <Button
                            type="button"
                            variant={props.partyRunning && fixturePartyIncluded ? "outline" : isCurrentFixtureLive ? "destructive" : "secondary"}
                            size="sm"
                            onClick={() => void handleToggleLive()}
                            disabled={props.busy}
                        >
                            {props.partyRunning && fixturePartyIncluded
                                ? "Party active"
                                : isCurrentFixtureLive ? "Stop live" : "Start live"}
                        </Button>
                    )}
                    {!props.fixture && (
                        <input
                            ref={importInputRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={(event) => void handleImport(event)}
                        />
                    )}
                    <ButtonGroup className={cn(actionGroupDisabled && "opacity-60")}>
                        {!props.fixture && (
                            <Button
                                type="button"
                                onClick={() => importInputRef.current?.click()}
                                disabled={props.busy}
                                size="sm"
                                variant="outline"
                            >
                                Import fixture
                            </Button>
                        )}
                        <Button onClick={handleSave} disabled={actionGroupDisabled} size="sm" variant="outline">
                            Save
                        </Button>
                        {props.fixture && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon-sm"
                                        aria-label="More actions"
                                        disabled={actionGroupDisabled}
                                    >
                                        <MoreHorizontal className="size-4"/>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem
                                        disabled={actionGroupDisabled}
                                        onClick={handleExport}
                                    >
                                        Export
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        disabled={actionGroupDisabled}
                                        onClick={() => void handleClone()}
                                    >
                                        Clone
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        variant="destructive"
                                        disabled={actionGroupDisabled}
                                        onClick={() => setDeleteConfirmOpen(true)}
                                    >
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </ButtonGroup>
                </div>
            </div>
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete fixture?</DialogTitle>
                        <DialogDescription>
                            This action permanently deletes {props.fixture ? `"${props.fixture.name}"` : "this fixture"}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDeleteConfirmOpen(false)}
                            disabled={props.busy}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={props.busy}
                        >
                            Delete
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {props.fixture && pageMode === "live" ? (
                <DMXFixtureLiveControls
                    fixture={props.fixture}
                    busy={props.busy}
                    liveStatus={props.dmxLiveStatus}
                    partyRunning={props.partyRunning}
                    queueDmxLivePatch={props.queueDmxLivePatch}
                    liveUniverse={props.dmxState.liveUniverse}
                    pullDMXState={props.pullDMXState}
                />
            ) : (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Fixture</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="dmx-fixture-name">Name</Label>
                                    <Input
                                        id="dmx-fixture-name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        autoComplete="off"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="dmx-fixture-brand">Brand</Label>
                                    <Input
                                        id="dmx-fixture-brand"
                                        value={brand}
                                        onChange={(e) => setBrand(e.target.value)}
                                        autoComplete="off"
                                    />
                                </div>
                            </div>
                            <div className={cn("grid gap-4", showPanTiltInputs ? "md:grid-cols-4" : "md:grid-cols-2")}>
                                <div className="space-y-2">
                                    <Label htmlFor="dmx-fixture-type">Fixture type</Label>
                                    <NativeSelect
                                        id="dmx-fixture-type"
                                        value={fixtureType}
                                        onChange={(e) => setFixtureType(e.target.value as DMXFixtureType)}
                                        disabled={props.busy}
                                    >
                                        {FIXTURE_TYPE_OPTIONS.map((opt) => (
                                            <NativeSelectOption key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </NativeSelectOption>
                                        ))}
                                    </NativeSelect>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="dmx-fixture-address">DMX start address</Label>
                                    <Input
                                        id="dmx-fixture-address"
                                        type="number"
                                        min={1}
                                        max={512}
                                        value={address}
                                        onChange={(e) => setAddress(Number(e.target.value) || 1)}
                                    />
                                </div>
                                {showPanTiltInputs && (
                                    <>
                                        <div className="space-y-2">
                                            <Label htmlFor="dmx-max-pan">Max pan (°)</Label>
                                            <Input
                                                id="dmx-max-pan"
                                                type="number"
                                                min={0}
                                                max={720}
                                                value={maxPan}
                                                onChange={(e) => setMaxPan(Number(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="dmx-max-tilt">Max tilt (°)</Label>
                                            <Input
                                                id="dmx-max-tilt"
                                                type="number"
                                                min={0}
                                                max={360}
                                                value={maxTilt}
                                                onChange={(e) => setMaxTilt(Number(e.target.value) || 0)}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader
                            className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                            <CardTitle className="text-base">DMX channels</CardTitle>
                            <Button type="button" size="sm" variant="outline" onClick={addChannel}
                                    disabled={props.busy}>
                                <PiPlus className="mr-1 inline size-4" aria-hidden/>
                                Add channel
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {duplicateChannelOffsets.size > 0 ? (
                                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                    Duplicate channel offsets:{" "}
                                    {[...duplicateChannelOffsets].sort((a, b) => a - b).join(", ")}.
                                    Only one function per offset is saved — use separate offsets for gobo wheel,
                                    gobo rotation, gobo shake, etc. (e.g. 9 and 10).
                                </div>
                            ) : null}

                            {channelRows.map(({ch, originalIdx}) => {
                                const propsMap = (ch.properties ?? {}) as JSONMap;
                                const slots = parseEntries(propsMap);
                                const slotMode = usesSlots(propsMap);
                                const resolvedLiveWidget = resolveLiveWidget(ch);
                                const liveHiddenSource = liveWidgetHiddenSource(ch);
                                const isDuplicateOffset = duplicateChannelOffsets.has(Math.round(ch.channel));
                                const showSlotKindEditor =
                                    resolvedLiveWidget === "buttonSlider" && slotMode && slots.length > 0;
                                const minV =
                                    typeof propsMap.min === "number" ? propsMap.min : Number(propsMap.min) || 0;
                                const maxV =
                                    typeof propsMap.max === "number" ? propsMap.max : Number(propsMap.max) || 255;

                                return (
                                    <div
                                        key={originalIdx}
                                        className={cn(
                                            "rounded-lg border bg-muted/20 p-3 shadow-sm",
                                            liveHiddenSource &&
                                                "border-amber-500/35 bg-amber-500/[0.04] dark:bg-amber-500/[0.06]",
                                            isDuplicateOffset &&
                                                "border-destructive/40 bg-destructive/[0.04]",
                                        )}
                                    >
                                        <div className="flex flex-wrap items-end gap-2">
                                            {isDuplicateOffset ? (
                                                <Badge
                                                    variant="outline"
                                                    className="mb-5 border-destructive/50 text-[10px] text-destructive"
                                                >
                                                    Duplicate offset
                                                </Badge>
                                            ) : null}
                                            {liveHiddenSource ? (
                                                <Badge
                                                    variant="outline"
                                                    className="mb-5 gap-1 border-amber-600/45 bg-amber-500/10 text-[10px] text-amber-900 dark:text-amber-200"
                                                    title="This channel has no tile on the live tab"
                                                >
                                                    <EyeOff className="size-3 shrink-0" aria-hidden/>
                                                    {liveWidgetHiddenBadgeLabel(liveHiddenSource)}
                                                </Badge>
                                            ) : null}
                                            <div className="grid w-[88px] shrink-0 gap-1">
                                                <Label className="text-xs">Offset</Label>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={slotBudget}
                                                    value={ch.channel}
                                                    onChange={(e) => {
                                                        const v = Math.round(Number(e.target.value) || 1);
                                                        replaceChannelAt(originalIdx, {
                                                            ...ch,
                                                            channel: Math.max(1, Math.min(slotBudget, v)),
                                                        });
                                                    }}
                                                />
                                            </div>
                                            <div className="grid w-[108px] shrink-0 gap-1">
                                                <Label className="text-xs">Default</Label>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={255}
                                                    value={ch.defaultValue ?? ""}
                                                    onChange={(e) => {
                                                        const raw = e.target.value.trim();
                                                        const nextDefault = raw === ""
                                                            ? undefined
                                                            : Math.max(0, Math.min(255, Math.round(Number(raw) || 0)));
                                                        updateChannelAt(originalIdx, {defaultValue: nextDefault});
                                                    }}
                                                    onBlur={(e) => {
                                                        if (!e.target.value.trim()) {
                                                            updateChannelAt(originalIdx, {defaultValue: undefined});
                                                        }
                                                    }}
                                                    placeholder="0-255"
                                                />
                                            </div>
                                            <div
                                                className="min-w-0 flex-1 basis-[200px] grid gap-1">
                                                <Label className="text-xs">Function</Label>
                                                <NativeSelect
                                                    value={ch.type}
                                                    onChange={(e) => {
                                                        const nextType = e.target.value as DMXChannelType;
                                                        replaceChannelAt(originalIdx, {
                                                            channel: ch.channel,
                                                            type: nextType,
                                                            defaultValue: ch.defaultValue,
                                                            properties: defaultPropsForType(nextType),
                                                        });
                                                    }}
                                                >
                                                    {DMX_CHANNEL_TYPES.map((t) => (
                                                        <NativeSelectOption key={t} value={t}>
                                                            {t}
                                                        </NativeSelectOption>
                                                    ))}
                                                </NativeSelect>
                                            </div>
                                            <ButtonGroup className="ml-auto shrink-0">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant={!slotMode ? "secondary" : "outline"}
                                                    onClick={() => {
                                                        replaceChannelAt(originalIdx, {
                                                            ...ch,
                                                            properties: {min: minV, max: maxV},
                                                        });
                                                    }}
                                                >
                                                    Linear range
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant={slotMode ? "secondary" : "outline"}
                                                    onClick={() => {
                                                        const nextEntries =
                                                            slots.length > 0
                                                                ? slots
                                                                : [{
                                                                    from: 0,
                                                                    to: 255,
                                                                    label: "Slot 1"
                                                                }];
                                                        replaceChannelAt(originalIdx, {
                                                            ...ch,
                                                            properties: {
                                                                entries: nextEntries.map((s) => ({...s})),
                                                            },
                                                        });
                                                    }}
                                                >
                                                    Discrete slots
                                                </Button>
                                            </ButtonGroup>
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="shrink-0 text-destructive hover:text-destructive"
                                                title="Remove channel"
                                                onClick={() => removeChannelAt(originalIdx)}
                                                disabled={props.busy || channels.length <= 1}
                                            >
                                                <PiTrash className="size-4"/>
                                            </Button>
                                        </div>

                                        <LiveControlEditorField
                                            channel={ch}
                                            properties={propsMap}
                                            busy={props.busy}
                                            onPropertiesChange={(nextProps) =>
                                                updateChannelAt(originalIdx, {properties: nextProps})
                                            }
                                        />

                                        {ch.type === "custom" && (
                                            <div className="mt-2 max-w-md space-y-2">
                                                <div className="grid gap-1">
                                                <Label className="text-xs">Channel name</Label>
                                                <Input
                                                    placeholder="e.g. Red"
                                                    value={typeof propsMap.label === "string" ? propsMap.label : ""}
                                                    onChange={(e) => {
                                                        updateChannelAt(originalIdx, {
                                                            properties: {
                                                                ...propsMap,
                                                                label: e.target.value,
                                                            },
                                                        });
                                                    }}
                                                />
                                                </div>
                                                <label className="flex cursor-pointer items-center gap-2 text-sm">
                                                    <Checkbox
                                                        checked={readCustomPartyInclude(propsMap)}
                                                        onCheckedChange={(checked) => {
                                                            updateChannelAt(originalIdx, {
                                                                properties: {
                                                                    ...propsMap,
                                                                    partyInclude: checked === true,
                                                                },
                                                            });
                                                        }}
                                                        disabled={props.busy}
                                                    />
                                                    <span>Include in party mode</span>
                                                </label>
                                            </div>
                                        )}

                                        <Separator className="my-3"/>

                                        {!slotMode ? (
                                            !(maxV === 255 && (minV === 0 || minV === 1)) ? (
                                                <div className="mt-3 max-w-md">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="grid gap-1">
                                                            <Label className="text-xs">Min
                                                                DMX</Label>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={255}
                                                                value={minV}
                                                                onChange={(e) => {
                                                                    const v = Math.round(Number(e.target.value) || 0);
                                                                    updateChannelAt(originalIdx, {
                                                                        properties: {
                                                                            ...propsMap,
                                                                            min: Math.max(0, Math.min(255, v)),
                                                                            max: maxV,
                                                                        },
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="grid gap-1">
                                                            <Label className="text-xs">Max
                                                                DMX</Label>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={255}
                                                                value={maxV}
                                                                onChange={(e) => {
                                                                    const v = Math.round(Number(e.target.value) || 255);
                                                                    updateChannelAt(originalIdx, {
                                                                        properties: {
                                                                            ...propsMap,
                                                                            min: minV,
                                                                            max: Math.max(0, Math.min(255, v)),
                                                                        },
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : null
                                        ) : ch.type === "colorWheel" ? (
                                            <div className="mt-3 space-y-2">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead
                                                                className="w-[140px] text-muted-foreground">
                                                                Range
                                                            </TableHead>
                                                            <TableHead
                                                                className="text-muted-foreground">Color</TableHead>
                                                            <TableHead
                                                                className="w-[200px] text-right text-muted-foreground">
                                                                Speed
                                                            </TableHead>
                                                            <TableHead className="w-12"/>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {slots.map((slot, si) => (
                                                            <TableRow key={si}>
                                                                <TableCell className="align-middle">
                                                                    <div
                                                                        className="flex items-center gap-1">
                                                                        <Input
                                                                            type="number"
                                                                            className="h-8 w-14 px-1"
                                                                            min={0}
                                                                            max={255}
                                                                            value={slot.from}
                                                                            onChange={(e) => {
                                                                                const v = Math.round(
                                                                                    Number(e.target.value) || 0,
                                                                                );
                                                                                const next = [...slots];
                                                                                next[si] = {
                                                                                    ...slot,
                                                                                    from: Math.max(0, Math.min(255, v)),
                                                                                };
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        />
                                                                        <span
                                                                            className="text-muted-foreground">–</span>
                                                                        <Input
                                                                            type="number"
                                                                            className="h-8 w-14 px-1"
                                                                            min={0}
                                                                            max={255}
                                                                            value={slot.to}
                                                                            onChange={(e) => {
                                                                                const v = Math.round(
                                                                                    Number(e.target.value) || 0,
                                                                                );
                                                                                const next = [...slots];
                                                                                next[si] = {
                                                                                    ...slot,
                                                                                    to: Math.max(0, Math.min(255, v)),
                                                                                };
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="align-middle">
                                                                    <div
                                                                        className="flex min-w-0 items-center gap-2">
                                                                        <Popover>
                                                                            <PopoverTrigger asChild>
                                                                                <button
                                                                                    type="button"
                                                                                    className="relative size-8 shrink-0 overflow-hidden rounded-full border-2 border-border shadow-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
                                                                                    title="Pick color"
                                                                                >
                                                                                    {isRainbowColorSlot(slot) ? (
                                                                                        <span
                                                                                            aria-hidden
                                                                                            className="absolute inset-0 rounded-full"
                                                                                            style={{
                                                                                                background: RAINBOW_SWATCH_CONIC,
                                                                                            }}
                                                                                        />
                                                                                    ) : (
                                                                                        <span
                                                                                            aria-hidden
                                                                                            className="absolute inset-0 rounded-full"
                                                                                            style={{
                                                                                                backgroundColor:
                                                                                                    slotColorToPickerValue(
                                                                                                        slot.color,
                                                                                                    ),
                                                                                            }}
                                                                                        />
                                                                                    )}
                                                                                    {slot.direction === "cw" ? (
                                                                                        <span
                                                                                            className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                                                                            <RotateCw
                                                                                                className="size-3.5 text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]"
                                                                                                strokeWidth={2.5}
                                                                                                aria-hidden
                                                                                            />
                                                                                        </span>
                                                                                    ) : slot.direction === "ccw" ? (
                                                                                        <span
                                                                                            className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                                                                            <RotateCcw
                                                                                                className="size-3.5 text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]"
                                                                                                strokeWidth={2.5}
                                                                                                aria-hidden
                                                                                            />
                                                                                        </span>
                                                                                    ) : null}
                                                                                </button>
                                                                            </PopoverTrigger>
                                                                            <PopoverContent
                                                                                className="w-64">
                                                                                <div
                                                                                    className="grid gap-2">
                                                                                    <Label
                                                                                        className="text-xs">Color</Label>
                                                                                    <Button
                                                                                        type="button"
                                                                                        variant={
                                                                                            isRainbowModeExplicit(slot)
                                                                                                ? "secondary"
                                                                                                : "outline"
                                                                                        }
                                                                                        className="h-auto min-h-10 w-full justify-start gap-2 py-2"
                                                                                        onClick={() => {
                                                                                            const next = [...slots];
                                                                                            next[si] = {
                                                                                                ...slot,
                                                                                                mode: "rainbow",
                                                                                            };
                                                                                            updateChannelAt(originalIdx, {
                                                                                                properties: {
                                                                                                    ...propsMap,
                                                                                                    entries: next,
                                                                                                },
                                                                                            });
                                                                                        }}
                                                                                    >
                                                                                        <span
                                                                                            aria-hidden
                                                                                            className="size-6 shrink-0 rounded-full border border-border shadow-inner"
                                                                                            style={{
                                                                                                background: RAINBOW_SWATCH_CONIC,
                                                                                            }}
                                                                                        />
                                                                                        <span
                                                                                            className="text-left text-sm font-medium leading-tight">
                                                                                            Rainbow
                                                                                        </span>
                                                                                    </Button>
                                                                                    <input
                                                                                        type="color"
                                                                                        className="h-10 w-full cursor-pointer rounded border bg-background disabled:cursor-not-allowed disabled:opacity-50"
                                                                                        disabled={isRainbowModeExplicit(slot)}
                                                                                        value={slotColorToPickerValue(
                                                                                            slot.color,
                                                                                        )}
                                                                                        onChange={(e) => {
                                                                                            const next = [...slots];
                                                                                            const wasRainbow =
                                                                                                slot.mode === "rainbow" ||
                                                                                                slot.mode === "scroll";
                                                                                            next[si] = {
                                                                                                ...slot,
                                                                                                color: e.target.value,
                                                                                                ...(wasRainbow
                                                                                                    ? {mode: undefined}
                                                                                                    : {}),
                                                                                            };
                                                                                            updateChannelAt(originalIdx, {
                                                                                                properties: {
                                                                                                    ...propsMap,
                                                                                                    entries: next,
                                                                                                },
                                                                                            });
                                                                                        }}
                                                                                    />
                                                                                    <Input
                                                                                        className="font-mono text-xs"
                                                                                        placeholder="#rrggbb"
                                                                                        disabled={isRainbowModeExplicit(slot)}
                                                                                        value={slot.color ?? ""}
                                                                                        onChange={(e) => {
                                                                                            const next = [...slots];
                                                                                            const wasRainbow =
                                                                                                slot.mode === "rainbow" ||
                                                                                                slot.mode === "scroll";
                                                                                            next[si] = {
                                                                                                ...slot,
                                                                                                color: e.target.value,
                                                                                                ...(wasRainbow
                                                                                                    ? {mode: undefined}
                                                                                                    : {}),
                                                                                            };
                                                                                            updateChannelAt(originalIdx, {
                                                                                                properties: {
                                                                                                    ...propsMap,
                                                                                                    entries: next,
                                                                                                },
                                                                                            });
                                                                                        }}
                                                                                    />
                                                                                    {isRainbowModeExplicit(slot) ? (
                                                                                        <Button
                                                                                            type="button"
                                                                                            variant="ghost"
                                                                                            size="sm"
                                                                                            className="h-8 text-xs"
                                                                                            onClick={() => {
                                                                                                const next = [...slots];
                                                                                                next[si] = {
                                                                                                    ...slot,
                                                                                                    mode: undefined,
                                                                                                };
                                                                                                updateChannelAt(originalIdx, {
                                                                                                    properties: {
                                                                                                        ...propsMap,
                                                                                                        entries: next,
                                                                                                    },
                                                                                                });
                                                                                            }}
                                                                                            title="Clears rainbow mode so you can edit hex again"
                                                                                        >
                                                                                            Solid
                                                                                            color
                                                                                        </Button>
                                                                                    ) : null}
                                                                                </div>
                                                                            </PopoverContent>
                                                                        </Popover>
                                                                        <Input
                                                                            className="h-8 min-w-0 flex-1"
                                                                            value={slot.label}
                                                                            onChange={(e) => {
                                                                                const next = [...slots];
                                                                                next[si] = {
                                                                                    ...slot,
                                                                                    label: e.target.value,
                                                                                };
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell
                                                                    className="text-right align-middle">
                                                                    <div
                                                                        className="flex items-center justify-end gap-1">
                                                                        <NativeSelect
                                                                            className="h-8 max-w-[5.5rem] text-xs"
                                                                            value={slot.direction ?? "none"}
                                                                            onChange={(e) => {
                                                                                const v = e.target.value;
                                                                                const next = [...slots];
                                                                                next[si] = {
                                                                                    ...slot,
                                                                                    direction:
                                                                                        v === "none" ? undefined : v,
                                                                                };
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        >
                                                                            <NativeSelectOption
                                                                                value="none">—</NativeSelectOption>
                                                                            <NativeSelectOption
                                                                                value="cw">CW</NativeSelectOption>
                                                                            <NativeSelectOption
                                                                                value="ccw">CCW</NativeSelectOption>
                                                                        </NativeSelect>
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="icon-sm"
                                                                            className="size-8"
                                                                            onClick={() => {
                                                                                const next = [...slots];
                                                                                const base = slot.numeric ?? 0;
                                                                                next[si] = {
                                                                                    ...slot,
                                                                                    numeric: clamp255(base - 1),
                                                                                };
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        >
                                                                            −
                                                                        </Button>
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="icon-sm"
                                                                            className="size-8"
                                                                            onClick={() => {
                                                                                const next = [...slots];
                                                                                const base = slot.numeric ?? 0;
                                                                                next[si] = {
                                                                                    ...slot,
                                                                                    numeric: clamp255(base + 1),
                                                                                };
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        >
                                                                            +
                                                                        </Button>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell
                                                                    className="text-right align-middle">
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        title="Remove slot"
                                                                        onClick={() => {
                                                                            const next = slots.filter((_, j) => j !== si);
                                                                            if (next.length === 0) {
                                                                                replaceChannelAt(originalIdx, {
                                                                                    ...ch,
                                                                                    properties: {
                                                                                        min: 1,
                                                                                        max: 255,
                                                                                    },
                                                                                });
                                                                                return;
                                                                            }
                                                                            updateChannelAt(originalIdx, {
                                                                                properties: {
                                                                                    ...propsMap,
                                                                                    entries: next,
                                                                                },
                                                                            });
                                                                        }}
                                                                    >
                                                                        <PiTrash
                                                                            className="size-4"/>
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        const last = slots[slots.length - 1];
                                                        const start = last ? Math.min(255, last.to + 1) : 0;
                                                        const next = [
                                                            ...slots,
                                                            {
                                                                from: start,
                                                                to: Math.min(255, start + 15),
                                                                label: `Slot ${slots.length + 1}`,
                                                                color: "#888888",
                                                            },
                                                        ];
                                                        updateChannelAt(originalIdx, {
                                                            properties: {
                                                                ...propsMap,
                                                                entries: next,
                                                            },
                                                        });
                                                    }}
                                                >
                                                    <PiPlus className="mr-1 inline size-4"
                                                            aria-hidden/>
                                                    Add property
                                                </Button>
                                            </div>
                                        ) : ch.type === "goboWheel" ? (
                                            <div className="mt-3 space-y-2">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead
                                                                className="w-[140px] text-muted-foreground">
                                                                Range
                                                            </TableHead>
                                                            <TableHead
                                                                className="text-muted-foreground">Gobo</TableHead>
                                                            <TableHead
                                                                className="w-[200px] text-right text-muted-foreground">
                                                                Speed
                                                            </TableHead>
                                                            <TableHead className="w-12"/>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {slots.map((slot, si) => (
                                                            <TableRow key={si}>
                                                                <TableCell className="align-middle">
                                                                    <div
                                                                        className="flex items-center gap-1">
                                                                        <Input
                                                                            type="number"
                                                                            className="h-8 w-14 px-1"
                                                                            min={0}
                                                                            max={255}
                                                                            value={slot.from}
                                                                            onChange={(e) => {
                                                                                const v = Math.round(
                                                                                    Number(e.target.value) || 0,
                                                                                );
                                                                                const next = [...slots];
                                                                                next[si] = {
                                                                                    ...slot,
                                                                                    from: Math.max(0, Math.min(255, v)),
                                                                                };
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        />
                                                                        <span
                                                                            className="text-muted-foreground">–</span>
                                                                        <Input
                                                                            type="number"
                                                                            className="h-8 w-14 px-1"
                                                                            min={0}
                                                                            max={255}
                                                                            value={slot.to}
                                                                            onChange={(e) => {
                                                                                const v = Math.round(
                                                                                    Number(e.target.value) || 0,
                                                                                );
                                                                                const next = [...slots];
                                                                                next[si] = {
                                                                                    ...slot,
                                                                                    to: Math.max(0, Math.min(255, v)),
                                                                                };
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="align-middle">
                                                                    <div
                                                                        className="flex min-w-0 items-center gap-2">
                                                                        <button
                                                                            type="button"
                                                                            className="relative size-10 shrink-0 overflow-hidden rounded-full border-2 border-border bg-muted shadow-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
                                                                            title="Choose gobo"
                                                                            onClick={() =>
                                                                                setGoboPickerTarget({
                                                                                    channelIdx: originalIdx,
                                                                                    slotIdx: si,
                                                                                })
                                                                            }
                                                                        >
                                                                            {slot.goboImage ? (
                                                                                <img
                                                                                    src={slot.goboImage}
                                                                                    alt=""
                                                                                    className="size-full object-cover"
                                                                                />
                                                                            ) : (
                                                                                <span
                                                                                    className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                                                                                    ∅
                                                                                </span>
                                                                            )}
                                                                        </button>
                                                                        <Input
                                                                            className="h-8 min-w-0 flex-1"
                                                                            value={slot.label}
                                                                            onChange={(e) => {
                                                                                const next = [...slots];
                                                                                next[si] = {
                                                                                    ...slot,
                                                                                    label: e.target.value,
                                                                                };
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell
                                                                    className="text-right align-middle">
                                                                    <div
                                                                        className="flex items-center justify-end gap-1">
                                                                        <NativeSelect
                                                                            className="h-8 max-w-[5.5rem] text-xs"
                                                                            value={slot.direction ?? "none"}
                                                                            onChange={(e) => {
                                                                                const v = e.target.value;
                                                                                const next = [...slots];
                                                                                next[si] = {
                                                                                    ...slot,
                                                                                    direction:
                                                                                        v === "none" ? undefined : v,
                                                                                };
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        >
                                                                            <NativeSelectOption
                                                                                value="none">—</NativeSelectOption>
                                                                            <NativeSelectOption
                                                                                value="cw">CW</NativeSelectOption>
                                                                            <NativeSelectOption
                                                                                value="ccw">CCW</NativeSelectOption>
                                                                        </NativeSelect>
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="icon-sm"
                                                                            className="size-8"
                                                                            onClick={() => {
                                                                                const next = [...slots];
                                                                                const base = slot.numeric ?? 0;
                                                                                next[si] = {
                                                                                    ...slot,
                                                                                    numeric: clamp255(base - 1),
                                                                                };
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        >
                                                                            −
                                                                        </Button>
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="icon-sm"
                                                                            className="size-8"
                                                                            onClick={() => {
                                                                                const next = [...slots];
                                                                                const base = slot.numeric ?? 0;
                                                                                next[si] = {
                                                                                    ...slot,
                                                                                    numeric: clamp255(base + 1),
                                                                                };
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        >
                                                                            +
                                                                        </Button>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell
                                                                    className="text-right align-middle">
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        title="Remove slot"
                                                                        onClick={() => {
                                                                            const next = slots.filter((_, j) => j !== si);
                                                                            if (next.length === 0) {
                                                                                replaceChannelAt(originalIdx, {
                                                                                    ...ch,
                                                                                    properties: {
                                                                                        min: 1,
                                                                                        max: 255,
                                                                                    },
                                                                                });
                                                                                return;
                                                                            }
                                                                            updateChannelAt(originalIdx, {
                                                                                properties: {
                                                                                    ...propsMap,
                                                                                    entries: next,
                                                                                },
                                                                            });
                                                                        }}
                                                                    >
                                                                        <PiTrash
                                                                            className="size-4"/>
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        const last = slots[slots.length - 1];
                                                        const start = last ? Math.min(255, last.to + 1) : 0;
                                                        const next = [
                                                            ...slots,
                                                            {
                                                                from: start,
                                                                to: Math.min(255, start + 15),
                                                                label: `Slot ${slots.length + 1}`,
                                                                goboIdentifier: "",
                                                                goboName: "",
                                                                goboImage: "",
                                                            },
                                                        ];
                                                        updateChannelAt(originalIdx, {
                                                            properties: {
                                                                ...propsMap,
                                                                entries: next,
                                                            },
                                                        });
                                                    }}
                                                >
                                                    <PiPlus className="mr-1 inline size-4"
                                                            aria-hidden/>
                                                    Add property
                                                </Button>
                                            </div>
                                        ) : ch.type === "shutterStrobe" ? (
                                            <div className="mt-3 space-y-2">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead
                                                                className="w-[140px] text-muted-foreground">
                                                                Range
                                                            </TableHead>
                                                            <TableHead
                                                                className="text-muted-foreground">State</TableHead>
                                                            <TableHead
                                                                className="w-[200px] text-right text-muted-foreground">
                                                                Speed
                                                            </TableHead>
                                                            <TableHead className="w-12"/>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {slots.map((slot, si) => {
                                                            const sm = (slot.mode ?? "").toLowerCase();
                                                            const speedExtra =
                                                                sm === "strobe" || sm === "randomstrobe" ? (
                                                                    <span
                                                                        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary"
                                                                        title="Speed ramp"
                                                                        aria-hidden
                                                                    >
                                                                        <ArrowUpRight
                                                                            className="size-4"
                                                                            strokeWidth={2.5}
                                                                        />
                                                                    </span>
                                                                ) : sm === "pulse" ? (
                                                                    <span
                                                                        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary"
                                                                        title="Pulse width"
                                                                        aria-hidden
                                                                    >
                                                                        <Minus className="size-4"
                                                                               strokeWidth={2.5}/>
                                                                    </span>
                                                                ) : null;
                                                            return (
                                                                <TableRow key={si}>
                                                                    <TableCell
                                                                        className="align-middle">
                                                                        <div
                                                                            className="flex items-center gap-1">
                                                                            <Input
                                                                                type="number"
                                                                                className="h-8 w-14 px-1"
                                                                                min={0}
                                                                                max={255}
                                                                                value={slot.from}
                                                                                onChange={(e) => {
                                                                                    const v = Math.round(
                                                                                        Number(e.target.value) || 0,
                                                                                    );
                                                                                    const next = [...slots];
                                                                                    next[si] = {
                                                                                        ...slot,
                                                                                        from: Math.max(
                                                                                            0,
                                                                                            Math.min(255, v),
                                                                                        ),
                                                                                    };
                                                                                    updateChannelAt(originalIdx, {
                                                                                        properties: {
                                                                                            ...propsMap,
                                                                                            entries: next,
                                                                                        },
                                                                                    });
                                                                                }}
                                                                            />
                                                                            <span
                                                                                className="text-muted-foreground">
                                                                                –
                                                                            </span>
                                                                            <Input
                                                                                type="number"
                                                                                className="h-8 w-14 px-1"
                                                                                min={0}
                                                                                max={255}
                                                                                value={slot.to}
                                                                                onChange={(e) => {
                                                                                    const v = Math.round(
                                                                                        Number(e.target.value) || 0,
                                                                                    );
                                                                                    const next = [...slots];
                                                                                    next[si] = {
                                                                                        ...slot,
                                                                                        to: Math.max(0, Math.min(255, v)),
                                                                                    };
                                                                                    updateChannelAt(originalIdx, {
                                                                                        properties: {
                                                                                            ...propsMap,
                                                                                            entries: next,
                                                                                        },
                                                                                    });
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell
                                                                        className="align-middle">
                                                                        <div
                                                                            className="flex min-w-0 items-center gap-2">
                                                                            <ShutterStateGlyph
                                                                                mode={slot.mode}/>
                                                                            <NativeSelect
                                                                                className="h-8 min-w-0 flex-1 text-sm"
                                                                                value={shutterSelectValue(slot.mode)}
                                                                                onChange={(e) => {
                                                                                    const v = e.target.value;
                                                                                    const preset =
                                                                                        SHUTTER_MODE_OPTIONS.find(
                                                                                            (o) => o.value === v,
                                                                                        );
                                                                                    const next = [...slots];
                                                                                    next[si] = {
                                                                                        ...slot,
                                                                                        mode: v,
                                                                                        label:
                                                                                            preset?.label ?? slot.label,
                                                                                    };
                                                                                    updateChannelAt(originalIdx, {
                                                                                        properties: {
                                                                                            ...propsMap,
                                                                                            entries: next,
                                                                                        },
                                                                                    });
                                                                                }}
                                                                            >
                                                                                {SHUTTER_MODE_OPTIONS.map((o) => (
                                                                                    <NativeSelectOption
                                                                                        key={o.value}
                                                                                        value={o.value}
                                                                                    >
                                                                                        {o.label}
                                                                                    </NativeSelectOption>
                                                                                ))}
                                                                            </NativeSelect>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell
                                                                        className="text-right align-middle">
                                                                        <div
                                                                            className="flex items-center justify-end gap-1">
                                                                            {speedExtra}
                                                                            <Button
                                                                                type="button"
                                                                                variant="outline"
                                                                                size="icon-sm"
                                                                                className="size-8"
                                                                                onClick={() => {
                                                                                    const next = [...slots];
                                                                                    const base = slot.numeric ?? 0;
                                                                                    next[si] = {
                                                                                        ...slot,
                                                                                        numeric: clamp255(base - 1),
                                                                                    };
                                                                                    updateChannelAt(originalIdx, {
                                                                                        properties: {
                                                                                            ...propsMap,
                                                                                            entries: next,
                                                                                        },
                                                                                    });
                                                                                }}
                                                                            >
                                                                                −
                                                                            </Button>
                                                                            <Button
                                                                                type="button"
                                                                                variant="outline"
                                                                                size="icon-sm"
                                                                                className="size-8"
                                                                                onClick={() => {
                                                                                    const next = [...slots];
                                                                                    const base = slot.numeric ?? 0;
                                                                                    next[si] = {
                                                                                        ...slot,
                                                                                        numeric: clamp255(base + 1),
                                                                                    };
                                                                                    updateChannelAt(originalIdx, {
                                                                                        properties: {
                                                                                            ...propsMap,
                                                                                            entries: next,
                                                                                        },
                                                                                    });
                                                                                }}
                                                                            >
                                                                                +
                                                                            </Button>
                                                                        </div>
                                                                    </TableCell>
                                                                    {showSlotKindEditor ? (
                                                                        <TableCell className="align-middle">
                                                                            <EntryLiveSlotKindSelect
                                                                                value={slot.liveSlotKind}
                                                                                disabled={props.busy}
                                                                                onChange={(kind) => {
                                                                                    const next = [...slots];
                                                                                    next[si] = {
                                                                                        ...slot,
                                                                                        liveSlotKind: kind,
                                                                                    };
                                                                                    updateChannelAt(originalIdx, {
                                                                                        properties: {
                                                                                            ...propsMap,
                                                                                            entries: next,
                                                                                        },
                                                                                    });
                                                                                }}
                                                                            />
                                                                        </TableCell>
                                                                    ) : null}
                                                                    <TableCell
                                                                        className="text-right align-middle">
                                                                        <Button
                                                                            type="button"
                                                                            size="icon"
                                                                            variant="ghost"
                                                                            title="Remove slot"
                                                                            onClick={() => {
                                                                                const next = slots.filter(
                                                                                    (_, j) => j !== si,
                                                                                );
                                                                                if (next.length === 0) {
                                                                                    replaceChannelAt(originalIdx, {
                                                                                        ...ch,
                                                                                        properties: {
                                                                                            min: 1,
                                                                                            max: 255,
                                                                                        },
                                                                                    });
                                                                                    return;
                                                                                }
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        >
                                                                            <PiTrash
                                                                                className="size-4"/>
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        const last = slots[slots.length - 1];
                                                        const start = last ? Math.min(255, last.to + 1) : 0;
                                                        const next = [
                                                            ...slots,
                                                            {
                                                                from: start,
                                                                to: Math.min(255, start + 15),
                                                                label: "Shutter Open",
                                                                mode: "open",
                                                            },
                                                        ];
                                                        updateChannelAt(originalIdx, {
                                                            properties: {
                                                                ...propsMap,
                                                                entries: next,
                                                            },
                                                        });
                                                    }}
                                                >
                                                    <PiPlus className="mr-1 inline size-4"
                                                            aria-hidden/>
                                                    Add property
                                                </Button>
                                            </div>
                                        ) : MOTION_TABLE_TYPES.has(ch.type) ? (
                                            <div className="mt-3 space-y-2">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead
                                                                className="w-[140px] text-muted-foreground">
                                                                Range
                                                            </TableHead>
                                                            <TableHead
                                                                className="text-muted-foreground">State</TableHead>
                                                            <TableHead
                                                                className="w-[200px] text-right text-muted-foreground">
                                                                Speed
                                                            </TableHead>
                                                            {showSlotKindEditor ? (
                                                                <TableHead className="w-[108px] text-muted-foreground">
                                                                    Live slot
                                                                </TableHead>
                                                            ) : null}
                                                            <TableHead className="w-12"/>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {slots.map((slot, si) => {
                                                            const m = (slot.mode ?? "").toLowerCase();
                                                            const d = (slot.direction ?? "").toLowerCase();
                                                            let speedChip: ReactNode = null;
                                                            if (m === "vector") {
                                                                speedChip = (
                                                                    <span
                                                                        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary"
                                                                        title="Vector"
                                                                        aria-hidden
                                                                    >
                                                                        <ArrowDownRight
                                                                            className="size-4"
                                                                            strokeWidth={2.5}
                                                                        />
                                                                    </span>
                                                                );
                                                            } else if (
                                                                (m === "slow" || m === "fast") &&
                                                                d === "cw"
                                                            ) {
                                                                speedChip = (
                                                                    <span
                                                                        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary"
                                                                        title="Clockwise"
                                                                        aria-hidden
                                                                    >
                                                                        <RotateCw
                                                                            className="size-4"
                                                                            strokeWidth={2.5}
                                                                        />
                                                                    </span>
                                                                );
                                                            } else if (
                                                                (m === "slow" || m === "fast") &&
                                                                d === "ccw"
                                                            ) {
                                                                speedChip = (
                                                                    <span
                                                                        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary"
                                                                        title="Counter-clockwise"
                                                                        aria-hidden
                                                                    >
                                                                        <RotateCcw
                                                                            className="size-4"
                                                                            strokeWidth={2.5}
                                                                        />
                                                                    </span>
                                                                );
                                                            }
                                                            return (
                                                                <TableRow key={si}>
                                                                    <TableCell
                                                                        className="align-middle">
                                                                        <div
                                                                            className="flex items-center gap-1">
                                                                            <Input
                                                                                type="number"
                                                                                className="h-8 w-14 px-1"
                                                                                min={0}
                                                                                max={255}
                                                                                value={slot.from}
                                                                                onChange={(e) => {
                                                                                    const v = Math.round(
                                                                                        Number(e.target.value) || 0,
                                                                                    );
                                                                                    const next = [...slots];
                                                                                    next[si] = {
                                                                                        ...slot,
                                                                                        from: Math.max(
                                                                                            0,
                                                                                            Math.min(255, v),
                                                                                        ),
                                                                                    };
                                                                                    updateChannelAt(originalIdx, {
                                                                                        properties: {
                                                                                            ...propsMap,
                                                                                            entries: next,
                                                                                        },
                                                                                    });
                                                                                }}
                                                                            />
                                                                            <span
                                                                                className="text-muted-foreground">
                                                                                –
                                                                            </span>
                                                                            <Input
                                                                                type="number"
                                                                                className="h-8 w-14 px-1"
                                                                                min={0}
                                                                                max={255}
                                                                                value={slot.to}
                                                                                onChange={(e) => {
                                                                                    const v = Math.round(
                                                                                        Number(e.target.value) || 0,
                                                                                    );
                                                                                    const next = [...slots];
                                                                                    next[si] = {
                                                                                        ...slot,
                                                                                        to: Math.max(0, Math.min(255, v)),
                                                                                    };
                                                                                    updateChannelAt(originalIdx, {
                                                                                        properties: {
                                                                                            ...propsMap,
                                                                                            entries: next,
                                                                                        },
                                                                                    });
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell
                                                                        className="align-middle">
                                                                        <NativeSelect
                                                                            className="h-8 w-full min-w-0 text-sm"
                                                                            value={motionStatePresetId(slot)}
                                                                            onChange={(e) => {
                                                                                const id = e.target.value;
                                                                                const opt = MOTION_STATE_OPTIONS.find(
                                                                                    (o) => o.id === id,
                                                                                );
                                                                                if (!opt) {
                                                                                    return;
                                                                                }
                                                                                const next = [...slots];
                                                                                next[si] = {
                                                                                    ...slot,
                                                                                    label: opt.label,
                                                                                    mode: opt.mode,
                                                                                    direction: opt.direction,
                                                                                };
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        >
                                                                            {MOTION_STATE_OPTIONS.map((o) => (
                                                                                <NativeSelectOption
                                                                                    key={o.id}
                                                                                    value={o.id}
                                                                                >
                                                                                    {o.label}
                                                                                </NativeSelectOption>
                                                                            ))}
                                                                        </NativeSelect>
                                                                    </TableCell>
                                                                    <TableCell
                                                                        className="text-right align-middle">
                                                                        <div
                                                                            className="flex items-center justify-end gap-1">
                                                                            {speedChip}
                                                                            <Button
                                                                                type="button"
                                                                                variant="outline"
                                                                                size="icon-sm"
                                                                                className="size-8"
                                                                                onClick={() => {
                                                                                    const next = [...slots];
                                                                                    const base = slot.numeric ?? 0;
                                                                                    next[si] = {
                                                                                        ...slot,
                                                                                        numeric: clamp255(base - 1),
                                                                                    };
                                                                                    updateChannelAt(originalIdx, {
                                                                                        properties: {
                                                                                            ...propsMap,
                                                                                            entries: next,
                                                                                        },
                                                                                    });
                                                                                }}
                                                                            >
                                                                                −
                                                                            </Button>
                                                                            <Button
                                                                                type="button"
                                                                                variant="outline"
                                                                                size="icon-sm"
                                                                                className="size-8"
                                                                                onClick={() => {
                                                                                    const next = [...slots];
                                                                                    const base = slot.numeric ?? 0;
                                                                                    next[si] = {
                                                                                        ...slot,
                                                                                        numeric: clamp255(base + 1),
                                                                                    };
                                                                                    updateChannelAt(originalIdx, {
                                                                                        properties: {
                                                                                            ...propsMap,
                                                                                            entries: next,
                                                                                        },
                                                                                    });
                                                                                }}
                                                                            >
                                                                                +
                                                                            </Button>
                                                                        </div>
                                                                    </TableCell>
                                                                    {showSlotKindEditor ? (
                                                                        <TableCell className="align-middle">
                                                                            <EntryLiveSlotKindSelect
                                                                                value={slot.liveSlotKind}
                                                                                disabled={props.busy}
                                                                                onChange={(kind) => {
                                                                                    const next = [...slots];
                                                                                    next[si] = {
                                                                                        ...slot,
                                                                                        liveSlotKind: kind,
                                                                                    };
                                                                                    updateChannelAt(originalIdx, {
                                                                                        properties: {
                                                                                            ...propsMap,
                                                                                            entries: next,
                                                                                        },
                                                                                    });
                                                                                }}
                                                                            />
                                                                        </TableCell>
                                                                    ) : null}
                                                                    <TableCell
                                                                        className="text-right align-middle">
                                                                        <Button
                                                                            type="button"
                                                                            size="icon"
                                                                            variant="ghost"
                                                                            title="Remove slot"
                                                                            onClick={() => {
                                                                                const next = slots.filter(
                                                                                    (_, j) => j !== si,
                                                                                );
                                                                                if (next.length === 0) {
                                                                                    replaceChannelAt(originalIdx, {
                                                                                        ...ch,
                                                                                        properties: {
                                                                                            min: 1,
                                                                                            max: 255,
                                                                                        },
                                                                                    });
                                                                                    return;
                                                                                }
                                                                                updateChannelAt(originalIdx, {
                                                                                    properties: {
                                                                                        ...propsMap,
                                                                                        entries: next,
                                                                                    },
                                                                                });
                                                                            }}
                                                                        >
                                                                            <PiTrash
                                                                                className="size-4"/>
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        const last = slots[slots.length - 1];
                                                        const start = last ? Math.min(255, last.to + 1) : 0;
                                                        const next = [
                                                            ...slots,
                                                            {
                                                                from: start,
                                                                to: Math.min(255, start + 15),
                                                                label: "Slow CW",
                                                                mode: "slow",
                                                                direction: "cw",
                                                                numeric: 0,
                                                            },
                                                        ];
                                                        updateChannelAt(originalIdx, {
                                                            properties: {
                                                                ...propsMap,
                                                                entries: next,
                                                            },
                                                        });
                                                    }}
                                                >
                                                    <PiPlus className="mr-1 inline size-4"
                                                            aria-hidden/>
                                                    Add property
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="mt-3 space-y-2">
                                                {showSlotKindEditor && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Switch + slider: set each slot to Switch or Slider for
                                                        live control.
                                                    </p>
                                                )}
                                                {slots.map((slot, si) => (
                                                    <div
                                                        key={si}
                                                        className={cn(
                                                            "grid gap-2 rounded-md border bg-background p-2",
                                                            showSlotKindEditor
                                                                ? "sm:grid-cols-[88px_88px_1fr_108px_auto]"
                                                                : "sm:grid-cols-[88px_88px_1fr_auto]",
                                                        )}
                                                    >
                                                        <div className="grid gap-1">
                                                            <Label className="text-xs">From</Label>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={255}
                                                                value={slot.from}
                                                                onChange={(e) => {
                                                                    const v = Math.round(Number(e.target.value) || 0);
                                                                    const next = [...slots];
                                                                    next[si] = {
                                                                        ...slot,
                                                                        from: Math.max(0, Math.min(255, v)),
                                                                    };
                                                                    updateChannelAt(originalIdx, {
                                                                        properties: {
                                                                            ...propsMap,
                                                                            entries: next,
                                                                        },
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="grid gap-1">
                                                            <Label className="text-xs">To</Label>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={255}
                                                                value={slot.to}
                                                                onChange={(e) => {
                                                                    const v = Math.round(Number(e.target.value) || 0);
                                                                    const next = [...slots];
                                                                    next[si] = {
                                                                        ...slot,
                                                                        to: Math.max(0, Math.min(255, v)),
                                                                    };
                                                                    updateChannelAt(originalIdx, {
                                                                        properties: {
                                                                            ...propsMap,
                                                                            entries: next,
                                                                        },
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="grid gap-1">
                                                            <Label className="text-xs">Label</Label>
                                                            <Input
                                                                value={slot.label}
                                                                onChange={(e) => {
                                                                    const next = [...slots];
                                                                    next[si] = {
                                                                        ...slot,
                                                                        label: e.target.value,
                                                                    };
                                                                    updateChannelAt(originalIdx, {
                                                                        properties: {
                                                                            ...propsMap,
                                                                            entries: next,
                                                                        },
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                        {showSlotKindEditor ? (
                                                            <div className="grid gap-1">
                                                                <Label className="text-xs">Live slot</Label>
                                                                <EntryLiveSlotKindSelect
                                                                    value={slot.liveSlotKind}
                                                                    disabled={props.busy}
                                                                    onChange={(kind) => {
                                                                        const next = [...slots];
                                                                        next[si] = {
                                                                            ...slot,
                                                                            liveSlotKind: kind,
                                                                        };
                                                                        updateChannelAt(originalIdx, {
                                                                            properties: {
                                                                                ...propsMap,
                                                                                entries: next,
                                                                            },
                                                                        });
                                                                    }}
                                                                />
                                                            </div>
                                                        ) : null}
                                                        <div className="flex items-end justify-end">
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="ghost"
                                                                title="Remove slot"
                                                                onClick={() => {
                                                                    const next = slots.filter((_, j) => j !== si);
                                                                    if (next.length === 0) {
                                                                        replaceChannelAt(originalIdx, {
                                                                            ...ch,
                                                                            properties: {
                                                                                min: 1,
                                                                                max: 255,
                                                                            },
                                                                        });
                                                                        return;
                                                                    }
                                                                    updateChannelAt(originalIdx, {
                                                                        properties: {
                                                                            ...propsMap,
                                                                            entries: next,
                                                                        },
                                                                    });
                                                                }}
                                                            >
                                                                <PiTrash className="size-4"/>
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        const last = slots[slots.length - 1];
                                                        const start = last ? Math.min(255, last.to + 1) : 0;
                                                        const next = [
                                                            ...slots,
                                                            {
                                                                from: start,
                                                                to: Math.min(255, start + 15),
                                                                label: `Slot ${slots.length + 1}`,
                                                            },
                                                        ];
                                                        updateChannelAt(originalIdx, {
                                                            properties: {
                                                                ...propsMap,
                                                                entries: next,
                                                            },
                                                        });
                                                    }}
                                                >
                                                    <PiPlus className="mr-1 inline size-4"
                                                            aria-hidden/>
                                                    Add slot
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            <Dialog
                                open={goboPickerTarget !== null}
                                onOpenChange={(open) => {
                                    if (!open) {
                                        setGoboPickerTarget(null);
                                    }
                                }}
                            >
                                <DialogContent
                                    showCloseButton
                                    className="flex max-h-[88vh] w-full max-w-[min(42rem,calc(100%-2rem))] flex-col gap-3 sm:max-w-2xl"
                                >
                                    <DialogHeader>
                                        <DialogTitle>Choose gobo</DialogTitle>
                                        <DialogDescription>
                                            Filter by Rosco code or name. Images load from the local
                                            catalog.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <Input
                                        placeholder="Filter…"
                                        value={goboCatalogFilter}
                                        onChange={(e) => setGoboCatalogFilter(e.target.value)}
                                        autoComplete="off"
                                    />
                                    {goboCatalog === null ? (
                                        <p className="text-sm text-muted-foreground">Loading
                                            catalog…</p>
                                    ) : goboCatalogError ? (
                                        <p className="text-sm text-destructive">{goboCatalogError}</p>
                                    ) : goboCatalog.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No catalog
                                            entries found.</p>
                                    ) : (
                                        <>
                                            <div
                                                className="max-h-[min(60vh,520px)] overflow-y-auto rounded-md border p-2">
                                                <div
                                                    className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                                                    {goboCatalogShown.map((entry) => (
                                                        <button
                                                            key={entry.code}
                                                            type="button"
                                                            className="flex flex-col items-center gap-1 rounded-lg border bg-background p-2 text-left text-xs transition-colors hover:bg-muted/80"
                                                            onClick={() => {
                                                                const t = goboPickerTarget;
                                                                if (!t) {
                                                                    return;
                                                                }
                                                                const {channelIdx, slotIdx} = t;
                                                                setChannels((prev) =>
                                                                    prev.map((c, i) => {
                                                                        if (i !== channelIdx) {
                                                                            return c;
                                                                        }
                                                                        const pm = (c.properties ?? {}) as JSONMap;
                                                                        const sl = parseEntries(pm);
                                                                        const next = [...sl];
                                                                        if (!next[slotIdx]) {
                                                                            return c;
                                                                        }
                                                                        next[slotIdx] = {
                                                                            ...next[slotIdx],
                                                                            goboIdentifier: entry.code,
                                                                            goboName: entry.name,
                                                                            goboImage: entry.image,
                                                                            label: entry.name,
                                                                        };
                                                                        return {
                                                                            ...c,
                                                                            properties: {
                                                                                ...pm,
                                                                                entries: next,
                                                                            },
                                                                        };
                                                                    }),
                                                                );
                                                                setGoboPickerTarget(null);
                                                            }}
                                                        >
                                                            <img
                                                                src={entry.image}
                                                                alt=""
                                                                className="size-14 rounded-full object-cover ring-1 ring-border"
                                                                loading="lazy"
                                                            />
                                                            <span
                                                                className="line-clamp-2 w-full text-center font-mono text-[10px] leading-tight">
                                                                {entry.code}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            {goboCatalogFilter === "" && goboCatalog.length > 400 ? (
                                                <p className="text-xs text-muted-foreground">
                                                    Showing the first 400 gobos — type in the filter
                                                    to narrow the list.
                                                </p>
                                            ) : null}
                                        </>
                                    )}
                                </DialogContent>
                            </Dialog>

                            {saveHint && <p className="text-sm text-destructive">{saveHint}</p>}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Party mode tuning</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-xs text-muted-foreground">
                                Per-channel reaction scales how strongly auto and audio party algorithms move each
                                function toward its default (0% = frozen at default, 100% = full motion).
                            </p>
                            <div className="grid gap-3">
                                {channels.map((ch) => {
                                    const key = String(Math.round(ch.channel));
                                    const w = partyChannelWeights[key] ?? 100;
                                    return (
                                        <label key={`${key}-${ch.type}`} className="flex flex-col gap-1 text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">
                                                Offset {ch.channel} ({ch.type}) — {w}%
                                            </span>
                                            <Slider
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={[w]}
                                                disabled={props.busy}
                                                onValueChange={([nextW]) =>
                                                    setPartyChannelWeights((prev) => ({
                                                        ...prev,
                                                        [key]: Math.max(0, Math.min(100, Math.round(nextW ?? 100))),
                                                    }))
                                                }
                                            />
                                        </label>
                                    );
                                })}
                            </div>
                            <Separator/>
                            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                                <p className="text-xs text-muted-foreground">
                                    Timed strobe applies to shutter/strobe channels and LED strobe or sound macros.
                                </p>
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={partyStrobeEnabled}
                                        disabled={props.busy}
                                        onCheckedChange={(v) => setPartyStrobeEnabled(v === true)}
                                    />
                                    <span>Use timed strobe bursts in party</span>
                                </label>
                                {partyStrobeEnabled ? (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1">
                                            <Label htmlFor="party-strobe-on">Burst on (ms)</Label>
                                            <Input
                                                id="party-strobe-on"
                                                type="number"
                                                min={20}
                                                max={8000}
                                                value={partyStrobeOnMs}
                                                disabled={props.busy}
                                                onChange={(e) =>
                                                    setPartyStrobeOnMs(Math.max(20, Math.round(Number(e.target.value) || 120)))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="party-strobe-off">Pause between (ms)</Label>
                                            <Input
                                                id="party-strobe-off"
                                                type="number"
                                                min={20}
                                                max={15000}
                                                value={partyStrobeOffMs}
                                                disabled={props.busy}
                                                onChange={(e) =>
                                                    setPartyStrobeOffMs(Math.max(20, Math.round(Number(e.target.value) || 500)))
                                                }
                                            />
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </CardContent>
                    </Card>

                </>
            )}
        </div>
    );
}
