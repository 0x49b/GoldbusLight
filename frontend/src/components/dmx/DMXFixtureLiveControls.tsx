import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {DMXLiveStatus} from "../../../bindings/goldbus/internal/dmx";
import type {DMXChannelType, DMXFixture, JSONMap} from "@/types/controller.ts";
import {
    buildDmxLivePatch,
    defaultDmxLiveControlState,
    initCustomChannelState,
    type CustomChannelLiveState,
    type DMXLiveControlState,
    parseFixtureEntries,
    smokeFogOutputRange,
} from "@/lib/dmxLiveMap.ts";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {cn} from "@/lib/utils";
import {fixturePreviewDrive} from "@/lib/dmxFixturePreviewDrive.ts";
import {mergeLiveLayoutWithActiveIds, type LiveLayoutTile} from "@/lib/dmxFixtureLiveLayout";
import {loadFixtureLiveLayoutDocument, saveFixtureLiveLayoutDocument} from "@/lib/dmxFixtureLiveLayoutStorage";
import {DMXFixtureLiveLayoutGrid} from "./DMXFixtureLiveLayoutGrid";
import {renderLiveControlsSlot, type LiveControlsSlotCtx} from "./dmxFixtureLiveSlots";

type DMXFixtureLiveControlsProps = {
    fixture: DMXFixture;
    busy: boolean;
    liveStatus: DMXLiveStatus | null;
    partyRunning: boolean;
    queueDmxLivePatch: (entries: Array<{ address: number; value: number }>) => void;
    liveUniverse?: number[];
    pullDMXState?: () => Promise<unknown>;
};

function firstChannel(channels: DMXFixture["channels"], type: DMXChannelType) {
    return channels.find((c) => c.type === type);
}

function allChannelsOfType(channels: DMXFixture["channels"], type: DMXChannelType) {
    return channels.filter((c) => c.type === type);
}

export function DMXFixtureLiveControls({
                                           fixture,
                                           busy,
                                           liveStatus,
                                           partyRunning,
                                           queueDmxLivePatch,
                                           liveUniverse,
                                           pullDMXState,
                                       }: DMXFixtureLiveControlsProps) {
    const connected                 = liveStatus?.connected ?? false;
    const [liveState, setLiveState] = useState<DMXLiveControlState>(() => defaultDmxLiveControlState(fixture));

    useEffect(() => {
        setLiveState(defaultDmxLiveControlState(fixture));
    }, [fixture.id]);

    useEffect(() => {
        setLiveState((prev) => {
            const customChannels = {...prev.customChannels};
            let changed          = false;
            for (const ch of fixture.channels) {
                if (ch.type === "custom" && !customChannels[ch.channel]) {
                    customChannels[ch.channel] = initCustomChannelState(ch);
                    changed                    = true;
                }
            }
            return changed ? {...prev, customChannels} : prev;
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

    const chans = fixture.channels;

    const cwEntries      = useMemo(
        () => parseFixtureEntries(firstChannel(chans, "colorWheel")?.properties as JSONMap | undefined),
        [chans],
    );
    const goboWheels     = useMemo(() => allChannelsOfType(chans, "goboWheel"), [chans]);
    const g1Entries      = useMemo(
        () => parseFixtureEntries(goboWheels[0]?.properties as JSONMap | undefined),
        [goboWheels],
    );
    const g2Entries      = useMemo(
        () => parseFixtureEntries(goboWheels[1]?.properties as JSONMap | undefined),
        [goboWheels],
    );
    const msEntries      = useMemo(
        () => parseFixtureEntries(firstChannel(chans, "movementSpeed")?.properties as JSONMap | undefined),
        [chans],
    );
    const shutterEntries = useMemo(
        () => parseFixtureEntries(firstChannel(chans, "shutterStrobe")?.properties as JSONMap | undefined),
        [chans],
    );
    const frostEntries   = useMemo(
        () => parseFixtureEntries(firstChannel(chans, "frost")?.properties as JSONMap | undefined),
        [chans],
    );
    const fogChannel     = firstChannel(chans, "fog");
    const smokeFogRange  = useMemo(
        () => smokeFogOutputRange(fogChannel?.properties as JSONMap | undefined),
        [fogChannel],
    );
    const customChannels = useMemo(() => allChannelsOfType(chans, "custom"), [chans]);

    const hasPan            = Boolean(firstChannel(chans, "pan"));
    const hasTilt           = Boolean(firstChannel(chans, "tilt"));
    const hasDimmer         = Boolean(firstChannel(chans, "dimmer"));
    const hasColorWheel     = cwEntries.length > 0;
    const hasGobo1          = g1Entries.length > 0;
    const hasGobo2          = g2Entries.length > 0;
    const hasShutter        = shutterEntries.length > 0;
    const hasMovementSpeed  = msEntries.length > 0;
    const hasFocus          = Boolean(firstChannel(chans, "focus"));
    const hasZoom           = Boolean(firstChannel(chans, "zoom"));
    const hasIris           = Boolean(firstChannel(chans, "iris"));
    const hasFrost          = Boolean(firstChannel(chans, "frost"));
    const hasSmokeFogOutput = fixture.type === "smoke" && Boolean(fogChannel && smokeFogRange);
    const hasCustom         = customChannels.length > 0;
    const isColorChanger    = fixture.type === "colorChanger";
    const sliderGridClass   = cn("grid gap-4", isColorChanger ? "grid-cols-3" : "gap-6 md:grid-cols-2");
    const sliderFullRowClass = isColorChanger ? "col-span-3" : "md:col-span-2";
    const maxPanDeg         = Math.max(0, Math.round(fixture.movingHead?.maxPan ?? 540));
    const maxTiltDeg        = Math.max(0, Math.round(fixture.movingHead?.maxTilt ?? 270));

    const previewDrive          = fixturePreviewDrive(fixture, liveUniverse, liveState);
    const previewPanDeg         = liveState.pan01 * maxPanDeg;
    const previewTiltDeg        = liveState.tilt01 * maxTiltDeg;
    const previewIntensity      = previewDrive.dimmer01;
    const previewSmokeIntensity = liveState.fog01;
    const previewFocus          = previewDrive.focus01;
    const previewBeamColor      = previewDrive.beamColor;
    const previewBeamRainbow    = previewDrive.beamRainbow;

    const cwMax = Math.max(0, cwEntries.length - 1);
    const msMax = Math.max(0, msEntries.length - 1);

    const patchState = useCallback((partial: Partial<DMXLiveControlState>) => {
        setLiveState((s) => ({...s, ...partial}));
    }, []);

    const patchCustomChannel = useCallback((offset: number, next: CustomChannelLiveState) => {
        setLiveState((s) => ({
            ...s,
            customChannels: {...s.customChannels, [offset]: next},
        }));
    }, []);

    const sliderDisabled             = busy || !connected || partyRunning;
    const handlePreviewPanTiltChange = useCallback((next: { pan01: number; tilt01: number }) => {
        if (sliderDisabled) {
            return;
        }
        const partial: Partial<DMXLiveControlState> = {};
        if (hasPan) {
            partial.pan01 = next.pan01;
        }
        if (hasTilt) {
            partial.tilt01 = next.tilt01;
        }
        if (Object.keys(partial).length > 0) {
            patchState(partial);
        }
    }, [hasPan, hasTilt, patchState, sliderDisabled]);
    const noneConfigured             =
              !hasPan &&
              !hasTilt &&
              !hasDimmer &&
              !hasColorWheel &&
              !hasGobo1 &&
              !hasGobo2 &&
              !hasShutter &&
              !hasMovementSpeed &&
              !hasFocus &&
              !hasZoom &&
              !hasIris &&
              !hasFrost &&
              !hasSmokeFogOutput &&
              !hasCustom;

    const liveTileIds = useMemo(() => {
        const ids: string[] = [];
        if (fixture.type === "movingHead" || fixture.type === "smoke") {
            ids.push("preview");
        }
        if (hasSmokeFogOutput) {
            ids.push("smoke");
        }
        if (hasPan || hasTilt || hasDimmer || hasMovementSpeed) {
            ids.push("movement");
        }
        if (hasColorWheel || hasGobo1 || hasGobo2) {
            ids.push("colorGobo");
        }
        if (hasShutter || hasFocus || hasZoom || hasIris || hasFrost) {
            ids.push("beam");
        }
        if (hasCustom) {
            if (isColorChanger) {
                ids.push("custom-all");
            } else {
                for (const ch of customChannels) {
                    ids.push(`custom-${ch.channel}`);
                }
            }
        }
        return ids;
    }, [
        fixture.type,
        hasSmokeFogOutput,
        hasPan,
        hasTilt,
        hasDimmer,
        hasMovementSpeed,
        hasColorWheel,
        hasGobo1,
        hasGobo2,
        hasShutter,
        hasFocus,
        hasZoom,
        hasIris,
        hasFrost,
        hasCustom,
        isColorChanger,
        customChannels,
    ]);

    const liveTileIdsKey = liveTileIds.join("|");

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
            setLayoutTiles(mergeLiveLayoutWithActiveIds(saved, liveTileIds));
        })();
        return () => {
            cancelled = true;
        };
    }, [fixture.id, liveTileIdsKey]);

    useEffect(() => {
        if (prevEditRef.current && !editLayout) {
            void saveFixtureLiveLayoutDocument(fixture.id, {version: 1, tiles: layoutTilesRef.current});
        }
        prevEditRef.current = editLayout;
    }, [editLayout, fixture.id]);

    useEffect(() => {
        return () => {
            if (editLayout) {
                void saveFixtureLiveLayoutDocument(fixture.id, {version: 1, tiles: layoutTilesRef.current});
            }
        };
    }, [editLayout, fixture.id]);

    const slotCtx: LiveControlsSlotCtx = useMemo(
        () => ({
            fixture,
            liveState,
            patchState,
            patchCustomChannel,
            sliderDisabled,
            hasPan,
            hasTilt,
            hasDimmer,
            hasColorWheel,
            hasGobo1,
            hasGobo2,
            hasShutter,
            hasMovementSpeed,
            hasFocus,
            hasZoom,
            hasIris,
            hasFrost,
            hasSmokeFogOutput,
            hasCustom,
            isColorChanger,
            customChannels,
            sliderGridClass,
            sliderFullRowClass,
            cwEntries,
            g1Entries,
            g2Entries,
            msEntries,
            shutterEntries,
            frostEntries,
            cwMax,
            msMax,
            maxPanDeg,
            maxTiltDeg,
            previewPanDeg,
            previewTiltDeg,
            previewFocus,
            previewBeamColor: previewBeamColor ?? "#ffffff",
            previewBeamRainbow,
            previewIntensity,
            previewSmokeIntensity,
            onPreviewPanTiltChange: handlePreviewPanTiltChange,
        }),
        [
            fixture,
            liveState,
            patchState,
            patchCustomChannel,
            sliderDisabled,
            hasPan,
            hasTilt,
            hasDimmer,
            hasColorWheel,
            hasGobo1,
            hasGobo2,
            hasShutter,
            hasMovementSpeed,
            hasFocus,
            hasZoom,
            hasIris,
            hasFrost,
            hasSmokeFogOutput,
            hasCustom,
            isColorChanger,
            customChannels,
            sliderGridClass,
            sliderFullRowClass,
            cwEntries,
            g1Entries,
            g2Entries,
            msEntries,
            shutterEntries,
            frostEntries,
            cwMax,
            msMax,
            maxPanDeg,
            maxTiltDeg,
            previewPanDeg,
            previewTiltDeg,
            previewFocus,
            previewBeamColor,
            previewBeamRainbow,
            previewIntensity,
            previewSmokeIntensity,
            handlePreviewPanTiltChange,
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
                        No mappable channels found for live control (add pan, tilt, dimmer, wheels,
                        custom channels, etc. in the fixture editor).
                    </CardContent>
                </Card>
            ) : (
                <DMXFixtureLiveLayoutGrid
                    editMode={editLayout}
                    tiles={layoutTiles}
                    onTilesChange={setLayoutTiles}
                    renderSlot={(id) => renderLiveControlsSlot(id, slotCtx)}
                />
            )}
        </div>
    );
}
