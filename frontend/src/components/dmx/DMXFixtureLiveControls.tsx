import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {DMXLiveStatus} from "../../../bindings/goldbus/internal/dmx";
import type {DMXFixture} from "@/types/controller.ts";
import {
    buildDmxLivePatch,
    channelOutputByte,
    defaultDmxLiveControlState,
    defaultEntryStateForChannel,
    dmxLiveControlStateFromCue,
    legacyFocus01,
    legacyPan01,
    legacyTilt01,
    type DMXLiveControlState,
} from "@/lib/dmxLiveMap.ts";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {parseChannelLiveTileId, resolveLiveWidget} from "@/lib/dmxLiveWidget.ts";
import {fixturePreviewDrive} from "@/lib/dmxFixturePreviewDrive.ts";
import {
    LIVE_LAYOUT_DOC_VERSION,
    liveTileIdsForFixture,
    mergeLiveLayoutWithActiveIds,
    type LiveLayoutTile,
} from "@/lib/dmxFixtureLiveLayout";
import {loadFixtureLiveLayoutDocument, saveFixtureLiveLayoutDocument} from "@/lib/dmxFixtureLiveLayoutStorage";
import {DMXFixtureLiveLayoutGrid} from "./DMXFixtureLiveLayoutGrid";
import {DMXFixturePreview3D} from "./DMXFixturePreview3D";
import {DMXFixtureCueManager} from "./DMXFixtureCueManager";
import {LiveChannelControl} from "./LiveChannelControl";
import type {DMXFixtureCue, DMXFixtureCueSequence} from "@/types/controller.ts";

type DMXFixtureLiveControlsProps = {
    fixture: DMXFixture;
    busy: boolean;
    liveStatus: DMXLiveStatus | null;
    partyRunning: boolean;
    queueDmxLivePatch: (entries: Array<{ address: number; value: number }>) => void;
    liveUniverse?: number[];
    pullDMXState?: () => Promise<unknown>;
    onSaveCueSequence?: (next: DMXFixtureCueSequence) => Promise<boolean>;
    /**
     * Which section to display. The component stays mounted in both modes so
     * live state (and the active cue) survives switching between the Live
     * and Cues tabs.
     */
    displayMode?: "live" | "cues";
    /** When set with `setEditLayout`, layout edit mode is controlled by the parent (e.g. top bar). */
    editLayout?: boolean;
    setEditLayout?: React.Dispatch<React.SetStateAction<boolean>>;
};

function renderLiveTile(
    id: string,
    fixture: DMXFixture,
    liveState: DMXLiveControlState,
    setLiveState: React.Dispatch<React.SetStateAction<DMXLiveControlState>>,
    opts: {
        sliderDisabled: boolean;
        maxPanDeg: number;
        maxTiltDeg: number;
        previewPanDeg: number;
        previewTiltDeg: number;
        previewFocus: number;
        previewBeamColor: string;
        previewBeamRainbow: boolean;
        previewIntensity: number;
        previewSmokeIntensity: number;
        hasPan: boolean;
        hasTilt: boolean;
        activeCueLabel: string | null;
        activeCueIndex: number | null;
        activeCueDirty: boolean;
        canUpdateActiveCue: boolean;
        savingActiveCue: boolean;
        onUpdateActiveCue: () => void;
    },
) {
    if (id === "preview") {
        if (fixture.type !== "movingHead" && fixture.type !== "smoke") {
            return null;
        }
        return (
            <div className="flex h-full min-h-0 flex-col gap-1.5">
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3D preview</span>
                    {opts.activeCueLabel ? (
                        <>
                            <span
                                className={
                                    opts.activeCueDirty
                                        ? "inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                                        : "inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                                }
                                title={opts.activeCueDirty ? "Live values differ from this cue" : "Currently applied cue"}
                            >
                                {opts.activeCueIndex != null && (
                                    <span className="font-semibold opacity-80">#{opts.activeCueIndex + 1}</span>
                                )}
                                <span className="max-w-[12rem] truncate">{opts.activeCueLabel}</span>
                                {opts.activeCueDirty && <span className="font-semibold">•</span>}
                            </span>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                disabled={!opts.canUpdateActiveCue || opts.savingActiveCue || !opts.activeCueDirty}
                                onClick={opts.onUpdateActiveCue}
                                title={
                                    !opts.canUpdateActiveCue
                                        ? "Connect live output (and stop party) to update"
                                        : !opts.activeCueDirty
                                            ? "Live values already match this cue"
                                            : "Overwrite this cue with the current live values"
                                }
                            >
                                {opts.savingActiveCue ? "Updating…" : "Update cue"}
                            </Button>
                        </>
                    ) : (
                        <span className="text-[11px] text-muted-foreground/70">no cue applied</span>
                    )}
                </div>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <DMXFixturePreview3D
                        fillGridCell
                        variant={fixture.type === "smoke" ? "smoke" : "movingHead"}
                        panDeg={opts.previewPanDeg}
                        tiltDeg={opts.previewTiltDeg}
                        maxPanDeg={opts.maxPanDeg}
                        maxTiltDeg={opts.maxTiltDeg}
                        focus01={opts.previewFocus}
                        beamColor={opts.previewBeamColor}
                        beamRainbow={opts.previewBeamRainbow}
                        intensity={fixture.type === "smoke" ? opts.previewSmokeIntensity : opts.previewIntensity}
                        disabled={opts.sliderDisabled || (!opts.hasPan && !opts.hasTilt)}
                        onPanTiltChange={(next) => {
                            if (opts.sliderDisabled) {
                                return;
                            }
                            setLiveState((s) => {
                                let nextState = s;
                                const panCh = fixture.channels.find((c) => c.type === "pan" || c.type === "infinitePan");
                                const tiltCh = fixture.channels.find((c) => c.type === "tilt" || c.type === "infiniteTilt");
                                if (panCh && resolveLiveWidget(panCh) !== "hidden") {
                                    const prev = s.entryChannels[panCh.channel] ?? defaultEntryStateForChannel(panCh);
                                    nextState = {
                                        ...nextState,
                                        entryChannels: {
                                            ...nextState.entryChannels,
                                            [panCh.channel]: {...prev, linear01: next.pan01},
                                        },
                                    };
                                }
                                if (tiltCh && resolveLiveWidget(tiltCh) !== "hidden") {
                                    const prev = nextState.entryChannels[tiltCh.channel] ?? defaultEntryStateForChannel(tiltCh);
                                    nextState = {
                                        ...nextState,
                                        entryChannels: {
                                            ...nextState.entryChannels,
                                            [tiltCh.channel]: {...prev, linear01: next.tilt01},
                                        },
                                    };
                                }
                                return nextState;
                            });
                        }}
                    />
                </div>
            </div>
        );
    }

    const offset = parseChannelLiveTileId(id);
    if (offset == null) {
        return null;
    }
    const ch = fixture.channels.find((c) => c.channel === offset);
    if (!ch || resolveLiveWidget(ch) === "hidden") {
        return null;
    }

    return (
        <LiveChannelControl
            fixture={fixture}
            channel={ch}
            liveState={liveState}
            onStateChange={setLiveState}
            disabled={opts.sliderDisabled}
            compact
        />
    );
}

export function DMXFixtureLiveControls({
    fixture,
    busy,
    liveStatus,
    partyRunning,
    queueDmxLivePatch,
    liveUniverse,
    pullDMXState,
    onSaveCueSequence,
    displayMode = "live",
    editLayout: editLayoutProp,
}: DMXFixtureLiveControlsProps) {
    const connected = liveStatus?.connected ?? false;
    const [liveState, setLiveState] = useState<DMXLiveControlState>(() => defaultDmxLiveControlState(fixture));
    // Live DMX buffer sourced directly from the poll (see effect below) so the party
    // mirror does not depend on the parent re-passing `liveUniverse` in time.
    const [polledUniverse, setPolledUniverse] = useState<number[] | undefined>(undefined);

    useEffect(() => {
        // Start from the fixture's idle pose (if configured) so it opens in the saved
        // static position rather than bare defaults.
        const seq = fixture.party?.cueSequence;
        const idle = seq?.idleCueId ? seq.cues?.find((p) => p.id === seq.idleCueId) : undefined;
        setLiveState(idle ? dmxLiveControlStateFromCue(fixture, idle.values) : defaultDmxLiveControlState(fixture));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fixture.id]);

    useEffect(() => {
        setLiveState((prev) => {
            const entryChannels = {...prev.entryChannels};
            let changed = false;
            for (const ch of fixture.channels) {
                if (resolveLiveWidget(ch) !== "hidden" && !entryChannels[ch.channel]) {
                    entryChannels[ch.channel] = defaultEntryStateForChannel(ch);
                    changed = true;
                }
            }
            return changed ? {...prev, entryChannels} : prev;
        });
    }, [fixture.channels]);

    useEffect(() => {
        if (!connected || partyRunning) {
            return;
        }
        queueDmxLivePatch(buildDmxLivePatch(fixture, liveState));
    }, [connected, fixture, liveState, partyRunning, queueDmxLivePatch]);

    useEffect(() => {
        if ((!connected && !partyRunning) || !pullDMXState) {
            return;
        }
        let active = true;
        const tick = async () => {
            const st = (await pullDMXState()) as {liveUniverse?: number[]} | undefined;
            if (active && st && Array.isArray(st.liveUniverse)) {
                setPolledUniverse(st.liveUniverse);
            }
        };
        void tick();
        const id = window.setInterval(() => void tick(), 200);
        return () => {
            active = false;
            window.clearInterval(id);
        };
    }, [connected, partyRunning, pullDMXState]);

    // While party mode runs it drives the universe directly. Reconstruct a read-only
    // control state from the live DMX output so opening the Live view shows what party
    // is currently doing. The user's manual `liveState` is left untouched and returns
    // when party stops.
    const universe = partyRunning ? (polledUniverse ?? liveUniverse) : liveUniverse;
    const partyDisplayState = useMemo(() => {
        if (!partyRunning || !universe || universe.length < 512) {
            return null;
        }
        const base = Math.max(1, Math.round(fixture.dmxAddress || 1));
        const values: Record<string, number> = {};
        for (const ch of fixture.channels) {
            const addr = base + Math.round(ch.channel) - 1;
            if (addr >= 1 && addr <= 512) {
                const v = universe[addr - 1];
                if (typeof v === "number" && Number.isFinite(v)) {
                    values[String(ch.channel)] = v;
                }
            }
        }
        return dmxLiveControlStateFromCue(fixture, values);
    }, [partyRunning, universe, fixture]);
    const displayState = partyDisplayState ?? liveState;

    const maxPanDeg = Math.max(0, Math.round(fixture.movingHead?.maxPan ?? 540));
    const maxTiltDeg = Math.max(0, Math.round(fixture.movingHead?.maxTilt ?? 270));
    const previewDrive = fixturePreviewDrive(fixture, universe, displayState);
    const previewPanDeg = legacyPan01(fixture, displayState) * maxPanDeg;
    const previewTiltDeg = legacyTilt01(fixture, displayState) * maxTiltDeg;
    const hasPan = fixture.channels.some((c) => (c.type === "pan" || c.type === "infinitePan") && resolveLiveWidget(c) !== "hidden");
    const hasTilt = fixture.channels.some((c) => (c.type === "tilt" || c.type === "infiniteTilt") && resolveLiveWidget(c) !== "hidden");

    const fogChannel = fixture.channels.find((c) => c.type === "fog");
    const previewSmoke01 = useMemo(() => {
        if (!fogChannel) {
            return displayState.fog01;
        }
        const st = displayState.entryChannels[fogChannel.channel] ?? defaultEntryStateForChannel(fogChannel);
        return channelOutputByte(fogChannel, st) / 255;
    }, [fogChannel, displayState]);

    const liveTileIds = useMemo(() => liveTileIdsForFixture(fixture), [fixture]);
    const liveTileIdsKey = liveTileIds.join("|");
    const noneConfigured = liveTileIds.length === 0;

    const [layoutTiles, setLayoutTiles] = useState<LiveLayoutTile[]>([]);
    const [editLayoutInternal] = useState(false);
    const editLayout = editLayoutProp ?? editLayoutInternal;
    const prevEditRef = useRef(false);
    const layoutTilesRef = useRef<LiveLayoutTile[]>([]);

    useEffect(() => {
        layoutTilesRef.current = layoutTiles;
    }, [layoutTiles]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const saved = await loadFixtureLiveLayoutDocument(fixture.id);
            if (cancelled) {
                return;
            }
            setLayoutTiles(mergeLiveLayoutWithActiveIds(saved, liveTileIds, fixture));
        })();
        return () => {
            cancelled = true;
        };
    }, [fixture.id, liveTileIdsKey]);

    useEffect(() => {
        if (prevEditRef.current && !editLayout) {
            void saveFixtureLiveLayoutDocument(fixture.id, {version: LIVE_LAYOUT_DOC_VERSION, tiles: layoutTilesRef.current});
        }
        prevEditRef.current = editLayout;
    }, [editLayout, fixture.id]);

    useEffect(() => {
        return () => {
            if (editLayout) {
                void saveFixtureLiveLayoutDocument(fixture.id, {version: LIVE_LAYOUT_DOC_VERSION, tiles: layoutTilesRef.current});
            }
        };
    }, [editLayout, fixture.id]);

    const sliderDisabled = busy || !connected || partyRunning;

    const captureCurrentValues = useCallback((): Record<string, number> => {
        const base = Math.max(1, Math.round(fixture.dmxAddress || 1));
        const values: Record<string, number> = {};
        for (const {address, value} of buildDmxLivePatch(fixture, liveState)) {
            const offset = address - base + 1;
            if (offset >= 1) {
                values[String(offset)] = value;
            }
        }
        return values;
    }, [fixture, liveState]);

    const [activeCueId, setActiveCueId] = useState<string | null>(null);
    const [activeCueDirty, setActiveCueDirty] = useState(false);
    const appliedLiveStateRef = useRef<DMXLiveControlState | null>(null);

    const applyCue = useCallback(
        (cue: DMXFixtureCue) => {
            const nextState = dmxLiveControlStateFromCue(fixture, cue.values);
            appliedLiveStateRef.current = nextState;
            setLiveState(nextState);
            setActiveCueId(cue.id);
            setActiveCueDirty(false);
        },
        [fixture],
    );

    useEffect(() => {
        if (!activeCueId || activeCueDirty) return;
        if (appliedLiveStateRef.current && appliedLiveStateRef.current !== liveState) {
            // User changed something after applying the cue — cue is now "dirty".
            setActiveCueDirty(true);
        }
    }, [activeCueDirty, activeCueId, liveState]);

    const cues = useMemo(() => fixture.party?.cueSequence?.cues ?? [], [fixture.party?.cueSequence?.cues]);
    const canApplyCue = connected && !partyRunning && !busy;

    const [savingActiveCue, setSavingActiveCue] = useState(false);
    const updateActiveCueFromLive = useCallback(async () => {
        if (!activeCueId || !onSaveCueSequence) return;
        const seq = fixture.party?.cueSequence;
        if (!seq) return;
        const existing = seq.cues ?? [];
        if (!existing.some((p) => p.id === activeCueId)) return;
        setSavingActiveCue(true);
        try {
            const nextValues = captureCurrentValues();
            const next: DMXFixtureCueSequence = {
                ...seq,
                cues: existing.map((p) => (p.id === activeCueId ? {...p, values: nextValues} : p)),
            };
            const ok = await onSaveCueSequence(next);
            if (ok) {
                // The applied baseline is now the current state, so we're back in sync.
                appliedLiveStateRef.current = liveState;
                setActiveCueDirty(false);
            }
        } finally {
            setSavingActiveCue(false);
        }
    }, [activeCueId, captureCurrentValues, fixture.party?.cueSequence, liveState, onSaveCueSequence]);

    useEffect(() => {
        setActiveCueId(null);
        setActiveCueDirty(false);
        appliedLiveStateRef.current = null;
    }, [fixture.id]);

    useEffect(() => {
        if (displayMode !== "live" || !canApplyCue || cues.length === 0) {
            return;
        }
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target) {
                const tag = target.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
                    return;
                }
            }
            if (e.altKey || e.ctrlKey || e.metaKey) {
                return;
            }

            if (e.shiftKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault();
                const currentIdx = activeCueId ? cues.findIndex((p) => p.id === activeCueId) : -1;
                const dir = e.key === "ArrowDown" ? 1 : -1;
                let nextIdx: number;
                if (currentIdx < 0) {
                    nextIdx = dir === 1 ? 0 : cues.length - 1;
                } else {
                    nextIdx = (currentIdx + dir + cues.length) % cues.length;
                }
                applyCue(cues[nextIdx]);
                return;
            }

            if (!e.shiftKey && e.key.length === 1 && e.key >= "0" && e.key <= "9") {
                const digit = Number(e.key);
                const idx = digit === 0 ? 9 : digit - 1;
                if (idx < cues.length) {
                    e.preventDefault();
                    applyCue(cues[idx]);
                }
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [activeCueId, applyCue, canApplyCue, displayMode, cues]);

    const activeCueIndex = useMemo(() => {
        if (!activeCueId) return null;
        const idx = cues.findIndex((p) => p.id === activeCueId);
        return idx >= 0 ? idx : null;
    }, [activeCueId, cues]);
    const activeCueLabel = useMemo(() => {
        if (activeCueIndex == null) return null;
        const p = cues[activeCueIndex];
        return p.label?.trim() ? p.label : `Pose ${activeCueIndex + 1}`;
    }, [activeCueIndex, cues]);

    const renderSlot = useCallback(
        (id: string) =>
            renderLiveTile(id, fixture, displayState, setLiveState, {
                sliderDisabled,
                maxPanDeg,
                maxTiltDeg,
                previewPanDeg,
                previewTiltDeg,
                previewFocus: legacyFocus01(fixture, displayState),
                previewBeamColor: previewDrive.beamColor ?? "#ffffff",
                previewBeamRainbow: previewDrive.beamRainbow,
                previewIntensity: previewDrive.dimmer01,
                previewSmokeIntensity: previewSmoke01,
                hasPan,
                hasTilt,
                activeCueLabel,
                activeCueIndex,
                activeCueDirty,
                canUpdateActiveCue: canApplyCue && !!onSaveCueSequence,
                savingActiveCue,
                onUpdateActiveCue: () => void updateActiveCueFromLive(),
            }),
        [
            fixture,
            displayState,
            sliderDisabled,
            maxPanDeg,
            maxTiltDeg,
            previewPanDeg,
            previewTiltDeg,
            previewDrive,
            previewSmoke01,
            hasPan,
            hasTilt,
            activeCueLabel,
            activeCueIndex,
            activeCueDirty,
            canApplyCue,
            onSaveCueSequence,
            savingActiveCue,
            updateActiveCueFromLive,
        ],
    );

    const showLive = displayMode === "live";
    const showCues = displayMode === "cues";

    return (
        <div className="space-y-4">
            {partyRunning && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                    Party mode controls this fixture. Stop Party to use manual live controls.
                </div>
            )}

            <div className={showLive ? "space-y-4" : "hidden"} aria-hidden={!showLive}>
                {noneConfigured ? (
                    <Card>
                        <CardContent className="py-8 text-center text-sm text-muted-foreground">
                            No mappable channels found for live control (configure channels in the fixture editor).
                        </CardContent>
                    </Card>
                ) : (
                    <DMXFixtureLiveLayoutGrid
                        editMode={editLayout}
                        tiles={layoutTiles}
                        onTilesChange={setLayoutTiles}
                        renderSlot={renderSlot}
                    />
                )}
            </div>

            {onSaveCueSequence && (
                <div className={showCues ? "" : "hidden"} aria-hidden={!showCues}>
                    <DMXFixtureCueManager
                        fixture={fixture}
                        sequence={fixture.party?.cueSequence}
                        captureValues={captureCurrentValues}
                        onSave={onSaveCueSequence}
                        onApplyCue={applyCue}
                        canApply={connected && !partyRunning}
                        activeCueId={activeCueId}
                        busy={busy}
                    />
                </div>
            )}
        </div>
    );
}
