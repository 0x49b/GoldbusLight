import {Button} from "@/components/ui/button";
import {Card, CardContent, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {NativeSelect, NativeSelectOption} from "@/components/ui/native-select";
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
import {normalizeUniverses, resolveUniverseId} from "@/lib/dmxUniverses";
import {isFixtureActiveInParty} from "@/lib/partyTargets";
import {
    fixtureHasSlaves,
    isFixtureSlave,
    masterEligibleFixtures,
    slavesOf,
} from "@/lib/dmxFixtureMasterSlave";
import {cn} from "@/lib/utils";
import {MoreHorizontal} from "lucide-react";
import { defaultPropsForType } from "./channels/ChannelBase";
import { BaseChannelEditor } from "./channels/BaseChannelEditor";
import { PartyModeTuning } from "./party/PartyModeTuning";
import { GoboPickerDialog } from "./gobos/GoboPickerDialog";
import {
    type ChangeEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import {useTranslation} from "react-i18next";
import {PiPlus} from "react-icons/pi";
import type {DMXLiveStatus} from "../../../bindings/goldbus/internal/dmx";
import type {
    DetailRoute,
    DMXChannel,
    DMXColorSweep,
    DMXFixture,
    DMXFixtureCue,
    DMXFixtureCueSequence,
    DMXFixtureParty,
    DMXFixtureType,
    DMXState,
    JSONMap,
    UpsertDMXFixtureInput,
    USBSerialDevice,
} from "@/types/controller.ts";
import {ButtonGroup} from "../ui/button-group";
import {DMXEmergencyButton} from "./DMXEmergencyButton";
import {DMXOutputIndicator} from "./DMXOutputIndicator";
import {liveTileIdsForFixture} from "@/lib/dmxFixtureLiveLayout";
import {copyFixtureLiveLayoutDocument} from "@/lib/dmxFixtureLiveLayoutStorage";
import {DMXFixtureLiveControls} from "./DMXFixtureLiveControls";
import {DMXFixtureCueSequenceEditor} from "./DMXFixtureCueSequenceEditor";
import {ColorSweepPanel} from "./ColorSweepPanel";

type FixturePageMode = "editor" | "live" | "cues" | "sceneCues";

const FIXTURE_TYPE_VALUES: ReadonlyArray<DMXFixtureType> = [
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
];

const PAN_TILT_FIXTURE_TYPES = new Set<DMXFixtureType>(["movingHead", "scanner", "laser"]);

function sanitizeCueSequenceForSave(
    seq: DMXFixtureCueSequence | undefined,
): DMXFixtureCueSequence | undefined {
    if (!seq) return undefined;
    const cues = (seq.cues ?? []).filter((p) => p && p.values);
    // Only persist when there is something meaningful to step through.
    if (!seq.enabled && cues.length === 0 && !seq.idleCueId) {
        return undefined;
    }
    const idleCueId = seq.idleCueId && cues.some((p) => p.id === seq.idleCueId) ? seq.idleCueId : undefined;
    return {
        enabled: !!seq.enabled && cues.length > 0,
        loop: seq.loop ?? true,
        stepMs: Math.max(100, Math.min(600000, Math.round(seq.stepMs ?? 2000) || 2000)),
        fadeMs: Math.max(0, Math.min(600000, Math.round(seq.fadeMs ?? 0) || 0)),
        cues,
        ...(idleCueId ? {idleCueId} : {}),
        ...(seq.channelBehaviors && Object.keys(seq.channelBehaviors).length > 0
            ? {channelBehaviors: seq.channelBehaviors}
            : {}),
    };
}

function buildFixturePartySavePayload(
    channels: DMXChannel[],
    partyChannelWeights: Record<string, number>,
    partyStrobeEnabled: boolean,
    partyStrobeOnMs: number,
    partyStrobeOffMs: number,
    partyCueSequence: DMXFixtureCueSequence | undefined,
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
    const cueSequence = sanitizeCueSequenceForSave(partyCueSequence);
    return {
        ...(Object.keys(cw).length > 0 ? {channelWeights: cw} : {}),
        strobeEnabled: partyStrobeEnabled,
        strobeOnMs: Math.max(20, Math.round(partyStrobeOnMs) || 120),
        strobeOffMs: Math.max(20, Math.round(partyStrobeOffMs) || 500),
        ...(cueSequence ? {cueSequence} : {}),
    };
}

type DMXFixtureEditorViewProps = {
    fixture: DMXFixture | undefined;
    busy: boolean;
    onCreate: (input: UpsertDMXFixtureInput) => Promise<DMXFixture | null>;
    onUpdate: (input: UpsertDMXFixtureInput) => Promise<DMXFixture | null>;
    onDelete: (fixtureID: string) => Promise<boolean>;
    onOpenFixture: (fixtureID: string) => void;
    /** Prompt for a destination and write the exported fixture config; returns a status message. */
    onExportFixtureConfig?: (suggestedFilename: string, contents: string) => Promise<string>;
    dmxState: DMXState;
    defaultUniverseId?: string;
    usbSerialDevices: USBSerialDevice[];
    dmxLiveStatus: DMXLiveStatus | null;
    setRoute: (route: DetailRoute) => void;
    pullDMXLiveStatus: () => Promise<void>;
    queueDmxLivePatch: (entries: Array<{ address: number; value: number }>) => void;
    onRefreshUSBSerialDevices: () => Promise<void>;
    onSelectUSBSerialDevice: (deviceID: string) => Promise<void>;
    partyRunning: boolean;
    onEmergency: () => void | Promise<void>;
};


/** Types that default to slot-based `entries` instead of linear min/max. */










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

function fixtureToUpsertInput(f: DMXFixture): UpsertDMXFixtureInput {
    return {
        id: f.id,
        type: f.type,
        brand: f.brand,
        name: f.name,
        universeId: f.universeId,
        dmxAddress: f.dmxAddress,
        masterFixtureId: f.masterFixtureId,
        maxPan: Math.max(0, Math.round(f.movingHead?.maxPan ?? 0)),
        maxTilt: Math.max(0, Math.round(f.movingHead?.maxTilt ?? 0)),
        party: f.party,
        colorSweep: f.colorSweep,
        sceneCues: f.sceneCues,
        channels: cloneChannels(f.channels),
    };
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
    const {t} = useTranslation("dmx");
    const [fixtureType, setFixtureType] = useState<DMXFixtureType>("movingHead");
    const [name, setName] = useState("");
    const [brand, setBrand] = useState("");
    const [address, setAddress] = useState(1);
    const universes = normalizeUniverses();
    const [universeId, setUniverseId] = useState(resolveUniverseId(props.defaultUniverseId, universes));
    const [maxPan, setMaxPan] = useState(540);
    const [maxTilt, setMaxTilt] = useState(270);
    const [masterFixtureId, setMasterFixtureId] = useState("");
    const [channels, setChannels] = useState<DMXChannel[]>(defaultInitialChannels);
    const [partyChannelWeights, setPartyChannelWeights] = useState<Record<string, number>>({});
    const [partyStrobeEnabled, setPartyStrobeEnabled] = useState(false);
    const [partyStrobeOnMs, setPartyStrobeOnMs] = useState(120);
    const [partyStrobeOffMs, setPartyStrobeOffMs] = useState(500);
    const [partyCueSequence, setPartyCueSequence] = useState<DMXFixtureCueSequence>({});
    const [colorSweep, setColorSweep] = useState<DMXColorSweep>({});
    const [saveHint, setSaveHint] = useState<string | null>(null);
    const [pageMode, setPageMode] = useState<FixturePageMode>(props.fixture ? "live" : "editor");
    const [editLayout, setEditLayout] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const importInputRef = useRef<HTMLInputElement | null>(null);
    const fixturePartyIncluded = props.fixture
        ? isFixtureActiveInParty(props.fixture, props.dmxState.fixtures, props.dmxState.party?.config)
        : false;
    const liveLayoutConfigurable = props.fixture != null
        && !isFixtureSlave(props.fixture)
        && liveTileIdsForFixture(props.fixture).length > 0;
    // Only gate on busy — DMX live output auto-starts when an interface is ready,
    // so locking Save/Export/Clone/Delete on "connected" made them permanently unusable.
    const actionGroupDisabled = props.busy;
    const showPanTiltInputs = PAN_TILT_FIXTURE_TYPES.has(fixtureType);
    const showPartyCuesTab = fixtureType !== "smoke" && fixtureType !== "colorChanger";
    const showSceneCuesTab = fixtureType !== "smoke";
    const masterOptions = useMemo(
        () => masterEligibleFixtures(props.dmxState.fixtures, props.fixture?.id),
        [props.dmxState.fixtures, props.fixture?.id],
    );
    const masterSelectDisabled =
        props.busy ||
        (props.fixture != null && fixtureHasSlaves(props.dmxState.fixtures, props.fixture.id));

    useEffect(() => {
        setEditLayout(false);
    }, [props.fixture?.id, pageMode]);

    useEffect(() => {
        if (pageMode === "cues" && !showPartyCuesTab) {
            setPageMode("live");
            return;
        }
        if (pageMode === "sceneCues" && !showSceneCuesTab) {
            setPageMode("live");
        }
    }, [pageMode, showPartyCuesTab, showSceneCuesTab]);

    useEffect(() => {
        if (props.fixture) {
            setFixtureType(props.fixture.type || "movingHead");
            setName(props.fixture.name);
            setBrand(props.fixture.brand);
            setUniverseId(resolveUniverseId(props.fixture.universeId, universes));
            setAddress(props.fixture.dmxAddress || 1);
            setMaxPan(props.fixture.movingHead?.maxPan ?? 540);
            setMaxTilt(props.fixture.movingHead?.maxTilt ?? 270);
            setMasterFixtureId(props.fixture.masterFixtureId ?? "");
            setChannels(props.fixture.channels?.length ? cloneChannels(props.fixture.channels) : defaultInitialChannels());
            const pw = props.fixture.party?.channelWeights ?? {};
            setPartyChannelWeights({...pw});
            setPartyStrobeEnabled(!!props.fixture.party?.strobeEnabled);
            setPartyStrobeOnMs(Math.max(20, props.fixture.party?.strobeOnMs ?? 120));
            setPartyStrobeOffMs(Math.max(20, props.fixture.party?.strobeOffMs ?? 500));
            setPartyCueSequence(props.fixture.party?.cueSequence ? {...props.fixture.party.cueSequence} : {});
            setColorSweep(props.fixture.colorSweep ? {...props.fixture.colorSweep} : {});
            setSaveHint(null);
            return;
        }
        setName("");
        setBrand("");
        setFixtureType("movingHead");
        setUniverseId(resolveUniverseId(props.defaultUniverseId, universes));
        setAddress(1);
        setMaxPan(540);
        setMaxTilt(270);
        setMasterFixtureId("");
        setChannels(defaultInitialChannels());
        setPartyChannelWeights({});
        setPartyStrobeEnabled(false);
        setPartyStrobeOnMs(120);
        setPartyStrobeOffMs(500);
        setColorSweep({});
        setPartyCueSequence({});
    }, [props.fixture?.id, props.fixture?.updatedAt, props.defaultUniverseId]);

    useEffect(() => {
        setPageMode(props.fixture ? "live" : "editor");
    }, [props.fixture?.id]);

    useEffect(() => {
        if (props.fixture && pageMode !== "editor") {
            void props.pullDMXLiveStatus();
        }
    }, [pageMode, props.fixture?.id, props.pullDMXLiveStatus]);

    const [goboPickerTarget, setGoboPickerTarget] = useState<{
        channelIdx: number;
        slotIdx: number
    } | null>(
        null,
    );



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
            setSaveHint(t("fixture.hints.noFreeChannelOffsets", {address, max: slotBudget}));
            return;
        }
        setChannels((prev) => [
            ...prev,
            {
                channel: nextOff,
                type: "dimmer",
                defaultValue: 255,
                properties: defaultPropsForType("dimmer")
            },
        ]);
        setSaveHint(null);
    }, [address, channels, slotBudget, t]);

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
        universeId: "universe-1",
        dmxAddress: Math.max(1, Math.min(512, Math.round(address) || 1)),
        masterFixtureId: masterFixtureId.trim() || undefined,
        maxPan: Math.max(0, Math.round(maxPan) || 0),
        maxTilt: Math.max(0, Math.round(maxTilt) || 0),
        party: buildFixturePartySavePayload(
            channels,
            partyChannelWeights,
            partyStrobeEnabled,
            partyStrobeOnMs,
            partyStrobeOffMs,
            partyCueSequence,
        ),
        colorSweep: fixtureType === "colorChanger" ? colorSweep : undefined,
        sceneCues: props.fixture?.sceneCues,
        channels: cloneChannels(channels),
    }), [
        address,
        brand,
        channels,
        colorSweep,
        fixtureType,
        masterFixtureId,
        maxPan,
        maxTilt,
        name,
        partyChannelWeights,
        partyCueSequence,
        partyStrobeEnabled,
        partyStrobeOffMs,
        partyStrobeOnMs,
        props.fixture?.id,
        props.fixture?.sceneCues,
        universeId,
        universes,
    ]);

    const handleSaveCueSequence = useCallback(
        async (next: DMXFixtureCueSequence): Promise<boolean> => {
            const current = props.fixture;
            if (!current) {
                return false;
            }
            const sanitized = sanitizeCueSequenceForSave(next);
            const input: UpsertDMXFixtureInput = {
                ...fixtureToUpsertInput(current),
                party: {
                    ...(current.party ?? {}),
                    cueSequence: sanitized,
                },
            };
            const saved = await props.onUpdate(input);
            return saved != null;
        },
        [props.fixture, props.onUpdate],
    );

    const handleSaveSceneCues = useCallback(
        async (next: DMXFixtureCue[]): Promise<boolean> => {
            const current = props.fixture;
            if (!current) {
                return false;
            }
            const sanitized = sanitizeCueSequenceForSave({cues: next});
            const input: UpsertDMXFixtureInput = {
                ...fixtureToUpsertInput(current),
                sceneCues: sanitized?.cues ?? [],
            };
            const saved = await props.onUpdate(input);
            return saved != null;
        },
        [props.fixture, props.onUpdate],
    );

    const handleSaveColorSweep = useCallback(
        async (next: DMXColorSweep): Promise<boolean> => {
            const current = props.fixture;
            if (!current || current.type !== "colorChanger") {
                return false;
            }
            setColorSweep(next);
            const input: UpsertDMXFixtureInput = {
                ...fixtureToUpsertInput(current),
                colorSweep: next,
            };
            const saved = await props.onUpdate(input);
            return saved != null;
        },
        [props.fixture, props.onUpdate],
    );

    const handleSave = async () => {
        setSaveHint(null);
        const trimmedBrand = brand.trim();
        const trimmedName = name.trim();
        if (!trimmedBrand || !trimmedName) {
            setSaveHint(t("fixture.hints.brandAndNameRequired"));
            return;
        }
        const seen = new Set<number>();
        for (const ch of channels) {
            const off = Math.round(ch.channel);
            if (off < 1 || off > slotBudget) {
                setSaveHint(
                    t("fixture.hints.invalidOffset", {offset: off, address, max: slotBudget}),
                );
                return;
            }
            if (seen.has(off)) {
                setSaveHint(t("fixture.hints.duplicateOffset", {offset: off}));
                return;
            }
            if (ch.defaultValue !== undefined) {
                const defaultValue = Math.round(Number(ch.defaultValue));
                if (!Number.isFinite(defaultValue) || defaultValue < 0 || defaultValue > 255) {
                    setSaveHint(t("fixture.hints.invalidDefault", {offset: off}));
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
            setSaveHint(t("fixture.hints.brandAndNameRequired"));
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
            setSaveHint(t("fixture.hints.noFreeAddress"));
            return;
        }

        const input: UpsertDMXFixtureInput = {
            type: fixtureType,
            brand: trimmedBrand,
            name: `${trimmedName}${t("fixture.cloneSuffix")}`,
            dmxAddress: cloneAddress,
            maxPan: Math.max(0, Math.round(maxPan) || 0),
            maxTilt: Math.max(0, Math.round(maxTilt) || 0),
            party: buildFixturePartySavePayload(
                channels,
                partyChannelWeights,
                partyStrobeEnabled,
                partyStrobeOnMs,
                partyStrobeOffMs,
                partyCueSequence,
            ),
            channels: cloneChannels(channels),
        };

        const created = await props.onCreate(input);
        if (created) {
            await copyFixtureLiveLayoutDocument(props.fixture.id, created.id);
            props.onOpenFixture(created.id);
        }
    };

    const handleExport = async () => {
        if (!props.fixture) {
            return;
        }
        setSaveHint(null);
        const input = buildDraftInput(false);
        const payload = buildDMXFixtureConfigPayload(input);
        const contents = `${JSON.stringify(payload, null, 2)}\n`;
        const filename = safeDMXFixtureConfigFilename(input.brand, input.name);

        // Native desktop save dialog (lets the user choose the destination).
        if (props.onExportFixtureConfig) {
            try {
                const msg = await props.onExportFixtureConfig(filename, contents);
                setSaveHint(msg);
            } catch (err) {
                setSaveHint(t("fixture.hints.exportFailed", {error: String(err)}));
            }
            return;
        }

        // Fallback (e.g. browser build without the desktop runtime): download to the default location.
        const blob = new Blob([contents], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setSaveHint(t("fixture.hints.exported"));
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
            setPartyCueSequence(impParty?.cueSequence ? {...impParty.cueSequence} : {});
            setColorSweep(parsed.input.colorSweep ? {...parsed.input.colorSweep} : {});
            setPageMode("editor");
            setSaveHint(t("fixture.hints.importedOk"));
        } catch (e) {
            setSaveHint(e instanceof SyntaxError
                ? t("fixture.hints.importInvalidJson")
                : t("fixture.hints.importFailed"));
        }
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
                                    {t("fixture.tabs.live")}
                                </Button>
                                {showPartyCuesTab ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className={pageMode === "cues" ? "btn-active" : ""}
                                        aria-pressed={pageMode === "cues"}
                                        onClick={() => setPageMode("cues")}
                                    >
                                        {t("fixture.tabs.partyCues")}
                                    </Button>
                                ) : null}
                                {showSceneCuesTab ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className={pageMode === "sceneCues" ? "btn-active" : ""}
                                        aria-pressed={pageMode === "sceneCues"}
                                        onClick={() => setPageMode("sceneCues")}
                                    >
                                        {t("fixture.tabs.sceneCues")}
                                    </Button>
                                ) : null}
                                <Button
                                    type="button"
                                    variant="outline"
                                    className={pageMode === "editor" ? "btn-active" : ""}
                                    aria-pressed={pageMode === "editor"}
                                    onClick={() => setPageMode("editor")}
                                >
                                    {t("fixture.tabs.editor")}
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
                    <DMXEmergencyButton busy={props.busy} onEmergency={props.onEmergency}/>
                    <DMXOutputIndicator connected={props.dmxLiveStatus?.connected === true}/>
                    {props.fixture && props.partyRunning && fixturePartyIncluded ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => props.setRoute({kind: "settings", tab: "party"})}
                            disabled={props.busy}
                        >
                            {t("fixture.partyActive")}
                        </Button>
                    ) : null}
                    {props.fixture && pageMode === "live" && liveLayoutConfigurable && (
                        <Button
                            type="button"
                            size="sm"
                            variant={editLayout ? "default" : "outline"}
                            disabled={props.busy}
                            onClick={() => setEditLayout((v) => !v)}
                        >
                            {editLayout ? t("fixture.done") : t("fixture.editLayout")}
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
                                {t("fixture.importFixture")}
                            </Button>
                        )}
                        <Button onClick={handleSave} disabled={actionGroupDisabled} size="sm"
                                variant="outline">
                            {t("fixture.save")}
                        </Button>
                        {props.fixture && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon-sm"
                                        aria-label={t("fixture.moreActions")}
                                        disabled={actionGroupDisabled}
                                    >
                                        <MoreHorizontal className="size-4"/>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem
                                        disabled={actionGroupDisabled}
                                        onClick={() => void handleExport()}
                                    >
                                        {t("fixture.export")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        disabled={actionGroupDisabled}
                                        onClick={() => void handleClone()}
                                    >
                                        {t("fixture.clone")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        variant="destructive"
                                        disabled={actionGroupDisabled}
                                        onClick={() => setDeleteConfirmOpen(true)}
                                    >
                                        {t("fixture.delete")}
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
                        <DialogTitle>{t("fixture.deleteConfirm.title")}</DialogTitle>
                        <DialogDescription>
                            {t("fixture.deleteConfirm.body", {
                                name: props.fixture?.name ?? t("fixture.deleteConfirm.fallbackName"),
                            })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDeleteConfirmOpen(false)}
                            disabled={props.busy}
                        >
                            {t("fixture.deleteConfirm.cancel")}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={props.busy}
                        >
                            {t("fixture.deleteConfirm.confirm")}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {props.fixture && pageMode !== "editor" ? (
                <DMXFixtureLiveControls
                    fixture={props.fixture}
                    allFixtures={props.dmxState.fixtures}
                    onOpenFixture={props.onOpenFixture}
                    busy={props.busy}
                    liveStatus={props.dmxLiveStatus}
                    partyRunning={props.partyRunning}
                    queueDmxLivePatch={props.queueDmxLivePatch}
                    liveUniverse={props.dmxState.liveUniverse}
                    onSaveCueSequence={handleSaveCueSequence}
                    onSaveSceneCues={handleSaveSceneCues}
                    onSaveColorSweep={handleSaveColorSweep}
                    displayMode={pageMode}
                    editLayout={editLayout}
                    setEditLayout={setEditLayout}
                />
            ) : (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">{t("fixture.card.title")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="dmx-fixture-name">{t("fixture.card.name")}</Label>
                                    <Input
                                        id="dmx-fixture-name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        autoComplete="off"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="dmx-fixture-brand">{t("fixture.card.brand")}</Label>
                                    <Input
                                        id="dmx-fixture-brand"
                                        value={brand}
                                        onChange={(e) => setBrand(e.target.value)}
                                        autoComplete="off"
                                    />
                                </div>

                                <div className="space-y-2 grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="dmx-fixture-type">{t("fixture.card.fixtureType")}</Label>
                                        <NativeSelect
                                            id="dmx-fixture-type"
                                            value={fixtureType}
                                            onChange={(e) => setFixtureType(e.target.value as DMXFixtureType)}
                                            disabled={props.busy}
                                        >
                                            {FIXTURE_TYPE_VALUES.map((value) => (
                                                <NativeSelectOption key={value} value={value}>
                                                    {t(`types.${value}`)}
                                                </NativeSelectOption>
                                            ))}
                                        </NativeSelect>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="dmx-fixture-master">{t("fixture.card.masterFixture")}</Label>
                                        <NativeSelect
                                            id="dmx-fixture-master"
                                            value={masterFixtureId}
                                            onChange={(e) => setMasterFixtureId(e.target.value)}
                                            disabled={masterSelectDisabled}
                                        >
                                            <NativeSelectOption
                                                value="">{t("fixture.card.standalone")}</NativeSelectOption>
                                            {masterOptions.map((fx) => (
                                                <NativeSelectOption key={fx.id} value={fx.id}>
                                                    {fx.name}
                                                </NativeSelectOption>
                                            ))}
                                        </NativeSelect>
                                    </div>

                                </div>

                            </div>
                            <div
                                className={cn("grid gap-4", showPanTiltInputs ? "md:grid-cols-3" : "md:grid-cols-2")}>

                                <div className="space-y-2 w-40">
                                    <Label htmlFor="dmx-fixture-address">{t("fixture.card.startAddress")}</Label>
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
                                        <div></div>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2 w-40">
                                            <Label htmlFor="dmx-max-pan">{t("fixture.card.maxPan")}</Label>
                                            <Input
                                                id="dmx-max-pan"
                                                type="number"
                                                min={0}
                                                max={720}
                                                value={maxPan}
                                                onChange={(e) => setMaxPan(Number(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div className="space-y-2 w-40">
                                            <Label htmlFor="dmx-max-tilt">{t("fixture.card.maxTilt")}</Label>
                                            <Input
                                                id="dmx-max-tilt"
                                                type="number"
                                                min={0}
                                                max={360}
                                                value={maxTilt}
                                                onChange={(e) => setMaxTilt(Number(e.target.value) || 0)}
                                            />
                                        </div>
                                        </div>
                                    </>
                                )}
                            </div>

                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader
                            className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                            <CardTitle className="text-base">{t("fixture.channelsCard.title")}</CardTitle>
                            <Button type="button" size="sm" variant="outline" onClick={addChannel}
                                    disabled={props.busy}>
                                <PiPlus className="mr-1 inline size-4" aria-hidden/>
                                {t("fixture.channelsCard.addChannel")}
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {duplicateChannelOffsets.size > 0 ? (
                                <div
                                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                    {t("fixture.channelsCard.duplicateOffsetsPrefix")}{" "}
                                    {[...duplicateChannelOffsets].sort((a, b) => a - b).join(", ")}{t("fixture.channelsCard.duplicateOffsetsSuffix")}
                                </div>
                            ) : null}

                            {channelRows.map(({ch, originalIdx}) => (
                                <BaseChannelEditor
                                    key={originalIdx}
                                    ch={ch}
                                    originalIdx={originalIdx}
                                    slotBudget={slotBudget}
                                    isDuplicateOffset={duplicateChannelOffsets.has(Math.round(ch.channel))}
                                    busy={props.busy}
                                    channelsLength={channels.length}
                                    updateChannelAt={updateChannelAt}
                                    replaceChannelAt={replaceChannelAt}
                                    removeChannelAt={removeChannelAt}
                                    setGoboPickerTarget={setGoboPickerTarget}
                                />
                            ))}

                            <GoboPickerDialog
                                goboPickerTarget={goboPickerTarget}
                                setGoboPickerTarget={setGoboPickerTarget}
                                setChannels={setChannels}
                            />

                            {saveHint && <p className="text-sm text-destructive">{saveHint}</p>}
                        </CardContent>
                        <CardFooter>
                            <Button type="button" size="sm" variant="outline" onClick={addChannel}
                                    disabled={props.busy}>
                                <PiPlus className="mr-1 inline size-4" aria-hidden/>
                                {t("fixture.channelsCard.addChannel")}
                            </Button>
                        </CardFooter>
                    </Card>

                    <PartyModeTuning
                        channels={channels}
                        partyChannelWeights={partyChannelWeights}
                        setPartyChannelWeights={setPartyChannelWeights}
                        partyStrobeEnabled={partyStrobeEnabled}
                        setPartyStrobeEnabled={setPartyStrobeEnabled}
                        partyStrobeOnMs={partyStrobeOnMs}
                        setPartyStrobeOnMs={setPartyStrobeOnMs}
                        partyStrobeOffMs={partyStrobeOffMs}
                        setPartyStrobeOffMs={setPartyStrobeOffMs}
                        busy={props.busy}
                    />

                    {fixtureType === "colorChanger" && !masterFixtureId.trim() ? (
                        <ColorSweepPanel
                            variant="editor"
                            value={colorSweep}
                            onChange={setColorSweep}
                            slaveCount={
                                props.fixture
                                    ? slavesOf(props.dmxState.fixtures, props.fixture.id).length
                                    : 0
                            }
                            busy={props.busy}
                        />
                    ) : null}

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">{t("fixture.cueChaseCard.title")}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DMXFixtureCueSequenceEditor
                                channels={channels}
                                value={partyCueSequence}
                                onChange={setPartyCueSequence}
                                busy={props.busy}
                            />
                        </CardContent>
                    </Card>

                </>
            )}
        </div>
    );
}
