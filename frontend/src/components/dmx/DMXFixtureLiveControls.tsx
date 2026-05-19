import {useCallback, useEffect, useMemo, useState} from "react";
import type {DMXLiveStatus} from "../../../bindings/goldbus/internal/dmx/models";
import type {DMXChannelType, DMXFixture, JSONMap} from "../../types/controller";
import {
    buildDmxLivePatch,
    defaultDmxLiveControlState,
    type DMXLiveControlState,
    type DMXLiveShutterMode,
    parseFixtureEntries,
} from "../../lib/dmxLiveMap";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Label} from "@/components/ui/label";
import {Separator} from "@/components/ui/separator";
import {Slider} from "@/components/ui/slider";
import {cn} from "@/lib/utils";
import {ColorWheelSegmentControl} from "./ColorWheelSegmentControl";
import {GoboWheelSegmentControl} from "./GoboWheelSegmentControl";
import {DMXFixturePreview3D} from "./DMXFixturePreview3D";
import {fixturePreviewDrive} from "../../lib/dmxFixturePreviewDrive";

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

const SHUTTER_OPTIONS: { value: DMXLiveShutterMode; label: string; symbol: string }[] = [
    {value: "open", label: "Open", symbol: "●"},
    {value: "closed", label: "Closed", symbol: "○"},
    {value: "strobe", label: "Strobe", symbol: "⚡"},
    {value: "pulse", label: "Pulse", symbol: "▲"},
];

export function DMXFixtureLiveControls({
                                           fixture,
                                           busy,
                                           liveStatus,
                                           partyRunning,
                                           queueDmxLivePatch,
                                           liveUniverse,
                                           pullDMXState,
                                       }: DMXFixtureLiveControlsProps) {
    const connected = liveStatus?.connected ?? false;
    const [liveState, setLiveState] = useState<DMXLiveControlState>(() => defaultDmxLiveControlState());

    useEffect(() => {
        setLiveState(defaultDmxLiveControlState());
    }, [fixture.id]);

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

    const cwEntries = useMemo(
        () => parseFixtureEntries(firstChannel(chans, "colorWheel")?.properties as JSONMap | undefined),
        [chans],
    );
    const goboWheels = useMemo(() => allChannelsOfType(chans, "goboWheel"), [chans]);
    const g1Entries = useMemo(
        () => parseFixtureEntries(goboWheels[0]?.properties as JSONMap | undefined),
        [goboWheels],
    );
    const g2Entries = useMemo(
        () => parseFixtureEntries(goboWheels[1]?.properties as JSONMap | undefined),
        [goboWheels],
    );
    const msEntries = useMemo(
        () => parseFixtureEntries(firstChannel(chans, "movementSpeed")?.properties as JSONMap | undefined),
        [chans],
    );
    const shutterEntries = useMemo(
        () => parseFixtureEntries(firstChannel(chans, "shutterStrobe")?.properties as JSONMap | undefined),
        [chans],
    );
    const frostEntries = useMemo(
        () => parseFixtureEntries(firstChannel(chans, "frost")?.properties as JSONMap | undefined),
        [chans],
    );

    const hasPan = Boolean(firstChannel(chans, "pan"));
    const hasTilt = Boolean(firstChannel(chans, "tilt"));
    const hasDimmer = Boolean(firstChannel(chans, "dimmer"));
    const hasColorWheel = cwEntries.length > 0;
    const hasGobo1 = g1Entries.length > 0;
    const hasGobo2 = g2Entries.length > 0;
    const hasShutter = shutterEntries.length > 0;
    const hasMovementSpeed = msEntries.length > 0;
    const hasFocus = Boolean(firstChannel(chans, "focus"));
    const hasZoom = Boolean(firstChannel(chans, "zoom"));
    const hasIris = Boolean(firstChannel(chans, "iris"));
    const hasFrost = Boolean(firstChannel(chans, "frost"));
    const maxPanDeg = Math.max(0, Math.round(fixture.movingHead?.maxPan ?? 540));
    const maxTiltDeg = Math.max(0, Math.round(fixture.movingHead?.maxTilt ?? 270));

    const previewDrive = fixturePreviewDrive(fixture, liveUniverse, liveState);
    const previewPanDeg = previewDrive.pan01 * maxPanDeg;
    const previewTiltDeg = previewDrive.tilt01 * maxTiltDeg;
    const previewIntensity = previewDrive.dimmer01;
    const previewFocus = previewDrive.focus01;
    const previewBeamColor = previewDrive.beamColor;
    const showFixturePreview = fixture.type === "movingHead" || fixture.type === "smoke";

    const cwMax = Math.max(0, cwEntries.length - 1);
    const msMax = Math.max(0, msEntries.length - 1);

    const patchState = useCallback((partial: Partial<DMXLiveControlState>) => {
        setLiveState((s) => ({...s, ...partial}));
    }, []);

    const sliderDisabled = busy || !connected || partyRunning;
    const noneConfigured =
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
        !hasFrost;

    return (
        <div className="space-y-4">
            {partyRunning && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                    Party mode controls this fixture. Stop Party to use manual live controls.
                </div>
            )}

            {showFixturePreview && (
                <div className="space-y-1.5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3D preview</div>
                    <DMXFixturePreview3D
                        variant={fixture.type === "smoke" ? "smoke" : "movingHead"}
                        panDeg={previewPanDeg}
                        tiltDeg={previewTiltDeg}
                        maxPanDeg={maxPanDeg}
                        maxTiltDeg={maxTiltDeg}
                        focus01={previewFocus}
                        beamColor={previewBeamColor}
                        intensity={previewIntensity}
                    />
                    <p className="text-[11px] text-muted-foreground">
                        Meshes from{" "}
                        <a
                            className="underline"
                            href="https://github.com/mcallegari/qlcplus/tree/master/resources/meshes/fixtures"
                            target="_blank"
                            rel="noreferrer"
                        >
                            QLC+
                        </a>
                        . Pose tracks live DMX when output is running; otherwise it follows the controls below.
                    </p>
                </div>
            )}

            {noneConfigured ? (
                <Card>
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                        No mappable channels found for live control (add pan, tilt, dimmer, wheels,
                        etc. in the fixture editor).
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Live controls</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        {(hasPan || hasTilt || hasDimmer || hasMovementSpeed) && (
                            <section className="space-y-4">
                                <div
                                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Movement &amp; master
                                </div>
                                <div className="grid gap-6 md:grid-cols-2">
                                    {hasPan && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <Label>Pan</Label>
                                                <span
                                                    className="tabular-nums text-muted-foreground">{Math.round(liveState.pan01 * maxPanDeg)}°</span>
                                            </div>
                                            <Slider
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={[liveState.pan01 * 100]}
                                                onValueChange={([v]) => patchState({pan01: (v ?? 0) / 100})}
                                                disabled={sliderDisabled}
                                            />
                                        </div>
                                    )}
                                    {hasTilt && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <Label>Tilt</Label>
                                                <span
                                                    className="tabular-nums text-muted-foreground">{Math.round(liveState.tilt01 * maxTiltDeg)}°</span>
                                            </div>
                                            <Slider
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={[liveState.tilt01 * 100]}
                                                onValueChange={([v]) => patchState({tilt01: (v ?? 0) / 100})}
                                                disabled={sliderDisabled}
                                            />
                                        </div>
                                    )}
                                    {hasDimmer && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <Label>Dimmer</Label>
                                                <span
                                                    className="tabular-nums text-muted-foreground">{Math.round(liveState.dimmer01 * 100)}%</span>
                                            </div>
                                            <Slider
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={[liveState.dimmer01 * 100]}
                                                onValueChange={([v]) => patchState({dimmer01: (v ?? 0) / 100})}
                                                disabled={sliderDisabled}
                                            />
                                        </div>
                                    )}
                                    {hasMovementSpeed && (
                                        <div className="space-y-2 md:col-span-2">
                                            <div className="flex justify-between text-sm">
                                                <Label>Movement speed slot</Label>
                                                <span
                                                    className="tabular-nums text-muted-foreground">
                          {liveState.movementSpeedIdx + 1} / {msEntries.length}
                        </span>
                                            </div>
                                            <Slider
                                                min={0}
                                                max={msMax}
                                                step={1}
                                                value={[Math.min(liveState.movementSpeedIdx, msMax)]}
                                                onValueChange={([v]) => patchState({movementSpeedIdx: Math.round(v ?? 0)})}
                                                disabled={sliderDisabled}
                                            />
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {(hasColorWheel || hasGobo1 || hasGobo2) && (
                            <>
                                <Separator/>
                                <section className="space-y-4">
                                    <div
                                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Color &amp; gobos
                                    </div>
                                    <div className="grid gap-6 md:grid-cols-2">
                                        {hasColorWheel && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <Label>Color wheel</Label>
                                                    <span
                                                        className="tabular-nums text-muted-foreground">
                            Slot {liveState.colorWheelIdx + 1}
                                                        {cwEntries[liveState.colorWheelIdx]?.label
                                                            ? ` · ${cwEntries[liveState.colorWheelIdx]?.label}`
                                                            : ""}
                          </span>
                                                </div>
                                                <ColorWheelSegmentControl
                                                    entries={cwEntries}
                                                    value={Math.min(liveState.colorWheelIdx, cwMax)}
                                                    onChange={(idx) => patchState({colorWheelIdx: idx})}
                                                    disabled={sliderDisabled}
                                                />
                                            </div>
                                        )}
                                        {hasGobo1 && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <Label>Gobo wheel 1</Label>
                                                    <span
                                                        className="tabular-nums text-muted-foreground">
                            Slot {liveState.gobo1Idx + 1}
                                                        {g1Entries[liveState.gobo1Idx]?.label
                                                            ? ` · ${g1Entries[liveState.gobo1Idx]?.label}`
                                                            : ""}
                          </span>
                                                </div>
                                                <GoboWheelSegmentControl
                                                    entries={g1Entries}
                                                    value={Math.min(liveState.gobo1Idx, Math.max(0, g1Entries.length - 1))}
                                                    onChange={(idx) => patchState({gobo1Idx: idx})}
                                                    disabled={sliderDisabled}
                                                />
                                            </div>
                                        )}
                                        {hasGobo2 && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <Label>Gobo wheel 2</Label>
                                                    <span
                                                        className="tabular-nums text-muted-foreground">
                            Slot {liveState.gobo2Idx + 1}
                                                        {g2Entries[liveState.gobo2Idx]?.label
                                                            ? ` · ${g2Entries[liveState.gobo2Idx]?.label}`
                                                            : ""}
                          </span>
                                                </div>
                                                <GoboWheelSegmentControl
                                                    entries={g2Entries}
                                                    value={Math.min(liveState.gobo2Idx, Math.max(0, g2Entries.length - 1))}
                                                    onChange={(idx) => patchState({gobo2Idx: idx})}
                                                    disabled={sliderDisabled}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </section>
                            </>
                        )}

                        {(hasShutter || hasFocus || hasZoom || hasIris || hasFrost) && (
                            <>
                                <Separator/>
                                <section className="space-y-4">
                                    <div
                                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Beam
                                    </div>
                                    <div className="grid gap-6 md:grid-cols-2">
                                        {hasShutter && (
                                            <div className="space-y-2 md:col-span-2">
                                                <Label>Shutter / strobe</Label>
                                                <div
                                                    className={cn(
                                                        "grid w-full max-w-md grid-cols-2 overflow-hidden rounded-lg border border-border",
                                                        sliderDisabled && "pointer-events-none opacity-60",
                                                    )}
                                                    role="group"
                                                    aria-label="Shutter and strobe modes"
                                                >
                                                    {SHUTTER_OPTIONS.map((o, idx) => {
                                                        const active = liveState.shutter === o.value;
                                                        return (
                                                            <button
                                                                key={o.value}
                                                                type="button"
                                                                onClick={() => patchState({shutter: o.value})}
                                                                className={cn(
                                                                    "flex items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition-colors",
                                                                    idx % 2 === 0 && "border-r border-border",
                                                                    idx < 2 && "border-b border-border",
                                                                    active
                                                                        ? "bg-primary text-primary-foreground ring-1 ring-primary/80"
                                                                        : "bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                                                )}
                                                                aria-pressed={active}
                                                                disabled={sliderDisabled}
                                                            >
                                                                <span className="text-base leading-none"
                                                                      aria-hidden>{o.symbol}</span>
                                                                <span>{o.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        {hasFocus && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <Label>Focus</Label>
                                                    <span
                                                        className="tabular-nums text-muted-foreground">{Math.round(liveState.focus01 * 100)}%</span>
                                                </div>
                                                <Slider
                                                    min={0}
                                                    max={100}
                                                    step={1}
                                                    value={[liveState.focus01 * 100]}
                                                    onValueChange={([v]) => patchState({focus01: (v ?? 0) / 100})}
                                                    disabled={sliderDisabled}
                                                />
                                            </div>
                                        )}
                                        {hasZoom && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <Label>Zoom</Label>
                                                    <span
                                                        className="tabular-nums text-muted-foreground">{Math.round(liveState.zoom01 * 100)}%</span>
                                                </div>
                                                <Slider
                                                    min={0}
                                                    max={100}
                                                    step={1}
                                                    value={[liveState.zoom01 * 100]}
                                                    onValueChange={([v]) => patchState({zoom01: (v ?? 0) / 100})}
                                                    disabled={sliderDisabled}
                                                />
                                            </div>
                                        )}
                                        {hasIris && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <Label>Iris</Label>
                                                    <span
                                                        className="tabular-nums text-muted-foreground">{Math.round(liveState.iris01 * 100)}%</span>
                                                </div>
                                                <Slider
                                                    min={0}
                                                    max={100}
                                                    step={1}
                                                    value={[liveState.iris01 * 100]}
                                                    onValueChange={([v]) => patchState({iris01: (v ?? 0) / 100})}
                                                    disabled={sliderDisabled}
                                                />
                                            </div>
                                        )}
                                        {hasFrost && (
                                            <>
                                                <div className="space-y-2 md:col-span-2">
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant={liveState.frostCurve === "linear" ? "secondary" : "outline"}
                                                            className={cn(sliderDisabled && "pointer-events-none opacity-50")}
                                                            onClick={() => patchState({frostCurve: "linear"})}
                                                            disabled={sliderDisabled}
                                                        >
                                                            Frost · linear curve
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant={liveState.frostCurve === "pulse" ? "secondary" : "outline"}
                                                            className={cn(sliderDisabled && "pointer-events-none opacity-50")}
                                                            onClick={() => patchState({frostCurve: "pulse"})}
                                                            disabled={sliderDisabled}
                                                        >
                                                            Frost · pulse curve
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2 md:col-span-2">
                                                    <div className="flex justify-between text-sm">
                                                        <Label>Frost</Label>
                                                        <span
                                                            className="tabular-nums text-muted-foreground">{Math.round(liveState.frost01 * 100)}%</span>
                                                    </div>
                                                    <Slider
                                                        min={0}
                                                        max={100}
                                                        step={1}
                                                        value={[liveState.frost01 * 100]}
                                                        onValueChange={([v]) => patchState({frost01: (v ?? 0) / 100})}
                                                        disabled={sliderDisabled || frostEntries.length === 0}
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </section>
                            </>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
