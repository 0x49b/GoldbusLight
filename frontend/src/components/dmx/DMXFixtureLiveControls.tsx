import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {DMXLiveStatus} from "../../../bindings/goldbus/internal/dmx";
import type {DMXFixture} from "@/types/controller.ts";
import {
    buildDmxLivePatch,
    channelOutputByte,
    defaultDmxLiveControlState,
    defaultEntryStateForChannel,
    dmxLiveControlStateFromPreset,
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
    liveTileIdsForFixture,
    mergeLiveLayoutWithActiveIds,
    type LiveLayoutTile,
} from "@/lib/dmxFixtureLiveLayout";
import {loadFixtureLiveLayoutDocument, saveFixtureLiveLayoutDocument} from "@/lib/dmxFixtureLiveLayoutStorage";
import {DMXFixtureLiveLayoutGrid} from "./DMXFixtureLiveLayoutGrid";
import {DMXFixturePreview3D} from "./DMXFixturePreview3D";
import {DMXFixturePresetManager} from "./DMXFixturePresetManager";
import {LiveChannelControl} from "./LiveChannelControl";
import type {DMXFixturePreset, DMXFixturePresetSequence} from "@/types/controller.ts";

type DMXFixtureLiveControlsProps = {
    fixture: DMXFixture;
    busy: boolean;
    liveStatus: DMXLiveStatus | null;
    partyRunning: boolean;
    queueDmxLivePatch: (entries: Array<{ address: number; value: number }>) => void;
    liveUniverse?: number[];
    pullDMXState?: () => Promise<unknown>;
    onSavePresetSequence?: (next: DMXFixturePresetSequence) => Promise<boolean>;
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
    },
) {
    if (id === "preview") {
        if (fixture.type !== "movingHead" && fixture.type !== "smoke") {
            return null;
        }
        return (
            <div className="flex h-full min-h-0 flex-col gap-1.5">
                <div className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">3D preview</div>
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
    onSavePresetSequence,
}: DMXFixtureLiveControlsProps) {
    const connected = liveStatus?.connected ?? false;
    const [liveState, setLiveState] = useState<DMXLiveControlState>(() => defaultDmxLiveControlState(fixture));

    useEffect(() => {
        // Start from the fixture's idle pose (if configured) so it opens in the saved
        // static position rather than bare defaults.
        const seq = fixture.party?.presetSequence;
        const idle = seq?.idlePresetId ? seq.presets?.find((p) => p.id === seq.idlePresetId) : undefined;
        setLiveState(idle ? dmxLiveControlStateFromPreset(fixture, idle.values) : defaultDmxLiveControlState(fixture));
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
        if (!connected || !pullDMXState) {
            return;
        }
        const id = window.setInterval(() => {
            void pullDMXState();
        }, 200);
        return () => window.clearInterval(id);
    }, [connected, pullDMXState]);

    const maxPanDeg = Math.max(0, Math.round(fixture.movingHead?.maxPan ?? 540));
    const maxTiltDeg = Math.max(0, Math.round(fixture.movingHead?.maxTilt ?? 270));
    const previewDrive = fixturePreviewDrive(fixture, liveUniverse, liveState);
    const previewPanDeg = legacyPan01(fixture, liveState) * maxPanDeg;
    const previewTiltDeg = legacyTilt01(fixture, liveState) * maxTiltDeg;
    const hasPan = fixture.channels.some((c) => (c.type === "pan" || c.type === "infinitePan") && resolveLiveWidget(c) !== "hidden");
    const hasTilt = fixture.channels.some((c) => (c.type === "tilt" || c.type === "infiniteTilt") && resolveLiveWidget(c) !== "hidden");

    const fogChannel = fixture.channels.find((c) => c.type === "fog");
    const previewSmoke01 = useMemo(() => {
        if (!fogChannel) {
            return liveState.fog01;
        }
        const st = liveState.entryChannels[fogChannel.channel] ?? defaultEntryStateForChannel(fogChannel);
        return channelOutputByte(fogChannel, st) / 255;
    }, [fogChannel, liveState]);

    const liveTileIds = useMemo(() => liveTileIdsForFixture(fixture), [fixture]);
    const liveTileIdsKey = liveTileIds.join("|");
    const noneConfigured = liveTileIds.length === 0;

    const [layoutTiles, setLayoutTiles] = useState<LiveLayoutTile[]>([]);
    const [editLayout, setEditLayout] = useState(false);
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
            void saveFixtureLiveLayoutDocument(fixture.id, {version: 3, tiles: layoutTilesRef.current});
        }
        prevEditRef.current = editLayout;
    }, [editLayout, fixture.id]);

    useEffect(() => {
        return () => {
            if (editLayout) {
                void saveFixtureLiveLayoutDocument(fixture.id, {version: 3, tiles: layoutTilesRef.current});
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

    const applyPreset = useCallback(
        (preset: DMXFixturePreset) => {
            setLiveState(dmxLiveControlStateFromPreset(fixture, preset.values));
        },
        [fixture],
    );

    const renderSlot = useCallback(
        (id: string) =>
            renderLiveTile(id, fixture, liveState, setLiveState, {
                sliderDisabled,
                maxPanDeg,
                maxTiltDeg,
                previewPanDeg,
                previewTiltDeg,
                previewFocus: legacyFocus01(fixture, liveState),
                previewBeamColor: previewDrive.beamColor ?? "#ffffff",
                previewBeamRainbow: previewDrive.beamRainbow,
                previewIntensity: previewDrive.dimmer01,
                previewSmokeIntensity: previewSmoke01,
                hasPan,
                hasTilt,
            }),
        [
            fixture,
            liveState,
            sliderDisabled,
            maxPanDeg,
            maxTiltDeg,
            previewPanDeg,
            previewTiltDeg,
            previewDrive,
            previewSmoke01,
            hasPan,
            hasTilt,
        ],
    );

    return (
        <div className="space-y-4">
            {partyRunning && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                    Party mode controls this fixture. Stop Party to use manual live controls.
                </div>
            )}

            {!noneConfigured && (
                <div className="flex justify-end">
                    <Button type="button" size="sm" variant={editLayout ? "default" : "outline"} onClick={() => setEditLayout((v) => !v)}>
                        {editLayout ? "Done" : "Edit layout"}
                    </Button>
                </div>
            )}

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

            {onSavePresetSequence && (
                <DMXFixturePresetManager
                    fixture={fixture}
                    sequence={fixture.party?.presetSequence}
                    captureValues={captureCurrentValues}
                    onSave={onSavePresetSequence}
                    onApplyPreset={applyPreset}
                    canApply={connected && !partyRunning}
                    busy={busy}
                />
            )}
        </div>
    );
}
