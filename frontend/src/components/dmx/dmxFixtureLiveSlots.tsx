import type {ReactNode} from "react";
import type {DMXFixture, JSONMap} from "@/types/controller.ts";
import type {CustomChannelLiveState, DMXLiveControlState, DMXLiveShutterMode} from "@/lib/dmxLiveMap.ts";
import {customChannelLabel, initCustomChannelState, parseFixtureEntries} from "@/lib/dmxLiveMap.ts";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Separator} from "@/components/ui/separator";
import {Slider} from "@/components/ui/slider";
import {cn} from "@/lib/utils";
import {ColorWheelSegmentControl} from "./ColorWheelSegmentControl";
import {GoboWheelSegmentControl} from "./GoboWheelSegmentControl";
import {DMXFixturePreview3D} from "./DMXFixturePreview3D";
import {fixturePartyIncludesChannelType, channelIncludedInParty} from "@/lib/dmxPartyInclude.ts";
import {LiveControlLabel} from "./LiveControlLabel";

const SHUTTER_OPTIONS: { value: DMXLiveShutterMode; label: string; symbol: string }[] = [
    {value: "open", label: "Open", symbol: "●"},
    {value: "closed", label: "Closed", symbol: "○"},
    {value: "strobe", label: "Strobe", symbol: "⚡"},
    {value: "pulse", label: "Pulse", symbol: "▲"},
];

const SMOKE_FOG_PRESETS: { value: number; label: string }[] = [
    {value: 0, label: "Off"},
    {value: 0.25, label: "25%"},
    {value: 0.5, label: "50%"},
    {value: 0.75, label: "75%"},
    {value: 1, label: "100%"},
];

export type LiveControlsSlotCtx = {
    fixture: DMXFixture;
    liveState: DMXLiveControlState;
    patchState: (partial: Partial<DMXLiveControlState>) => void;
    patchCustomChannel: (offset: number, next: CustomChannelLiveState) => void;
    sliderDisabled: boolean;
    hasPan: boolean;
    hasTilt: boolean;
    hasDimmer: boolean;
    hasColorWheel: boolean;
    hasGobo1: boolean;
    hasGobo2: boolean;
    hasShutter: boolean;
    hasMovementSpeed: boolean;
    hasFocus: boolean;
    hasZoom: boolean;
    hasIris: boolean;
    hasFrost: boolean;
    hasSmokeFogOutput: boolean;
    hasCustom: boolean;
    isColorChanger: boolean;
    customChannels: DMXFixture["channels"];
    sliderGridClass: string;
    sliderFullRowClass: string;
    cwEntries: ReturnType<typeof parseFixtureEntries>;
    g1Entries: ReturnType<typeof parseFixtureEntries>;
    g2Entries: ReturnType<typeof parseFixtureEntries>;
    msEntries: ReturnType<typeof parseFixtureEntries>;
    shutterEntries: ReturnType<typeof parseFixtureEntries>;
    frostEntries: ReturnType<typeof parseFixtureEntries>;
    cwMax: number;
    msMax: number;
    maxPanDeg: number;
    maxTiltDeg: number;
    previewPanDeg: number;
    previewTiltDeg: number;
    previewFocus: number;
    previewBeamColor: string;
    previewBeamRainbow: boolean;
    previewIntensity: number;
    previewSmokeIntensity: number;
    onPreviewPanTiltChange: (next: { pan01: number; tilt01: number }) => void;
};

function SlotPreview(ctx: LiveControlsSlotCtx) {
    const {fixture, previewPanDeg, previewTiltDeg, maxPanDeg, maxTiltDeg, previewFocus, previewBeamColor, previewBeamRainbow, previewIntensity, previewSmokeIntensity, sliderDisabled, hasPan, hasTilt, onPreviewPanTiltChange} = ctx;
    return (
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
                beamRainbow={previewBeamRainbow}
                intensity={fixture.type === "smoke" ? previewSmokeIntensity : previewIntensity}
                disabled={sliderDisabled || (!hasPan && !hasTilt)}
                onPanTiltChange={onPreviewPanTiltChange}
            />
        </div>
    );
}

function SlotCustomAll(ctx: LiveControlsSlotCtx) {
    const {fixture, liveState, patchCustomChannel, sliderDisabled, customChannels} = ctx;
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">Live controls</CardTitle>
            </CardHeader>
            <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                            {customChannels.flatMap((ch) => {
                                const props = ch.properties as JSONMap | undefined;
                                const entries = parseFixtureEntries(props);
                                const slotMode = entries.length > 0;
                                const customState = liveState.customChannels[ch.channel] ?? initCustomChannelState(ch);
                                const channelTitle = customChannelLabel(ch);
                                const partyChannel = channelIncludedInParty(fixture, ch);
                
                                if (!slotMode) {
                                    return [(
                                        <div key={`custom-${ch.channel}-linear`} className="space-y-2">
                                            <div className="flex justify-between gap-2 text-sm">
                                                <LiveControlLabel party={partyChannel}>{channelTitle}</LiveControlLabel>
                                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                                    {customState.outputByte}
                                                </span>
                                            </div>
                                            <Slider
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={[customState.linear01 * 100]}
                                                onValueChange={([v]) => {
                                                    const linear01 = (v ?? 0) / 100;
                                                    const min = typeof props?.min === "number" ? props.min : 0;
                                                    const max = typeof props?.max === "number" ? props.max : 255;
                                                    const outputByte = Math.round(
                                                        Math.max(0, Math.min(255, min + linear01 * (max - min))),
                                                    );
                                                    patchCustomChannel(ch.channel, {
                                                        linear01,
                                                        slot01: [],
                                                        outputByte,
                                                    });
                                                }}
                                                disabled={sliderDisabled}
                                            />
                                        </div>
                                    )];
                                }
                
                                return entries.map((entry, si) => {
                                    const slot01 = customState.slot01[si] ?? 0.5;
                                    const slotValue = Math.round(entry.from + slot01 * (entry.to - entry.from));
                                    const slotLabel = entry.label?.trim() || `Slot ${si + 1}`;
                                    const title = entries.length > 1 ? `${channelTitle} · ${slotLabel}` : channelTitle;
                                    return (
                                        <div key={`custom-${ch.channel}-slot-${si}`} className="space-y-2">
                                            <div className="flex justify-between gap-2 text-sm">
                                                <LiveControlLabel party={partyChannel}>{title}</LiveControlLabel>
                                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                                    {slotValue}
                                                </span>
                                            </div>
                                            <Slider
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={[slot01 * 100]}
                                                onValueChange={([v]) => {
                                                    const t01 = (v ?? 0) / 100;
                                                    const slot01Next = [...customState.slot01];
                                                    while (slot01Next.length < entries.length) {
                                                        slot01Next.push(0.5);
                                                    }
                                                    slot01Next[si] = t01;
                                                    const outputByte = Math.round(
                                                        entry.from + t01 * (entry.to - entry.from),
                                                    );
                                                    patchCustomChannel(ch.channel, {
                                                        ...customState,
                                                        slot01: slot01Next,
                                                        outputByte: Math.max(0, Math.min(255, outputByte)),
                                                    });
                                                }}
                                                disabled={sliderDisabled}
                                            />
                                        </div>
                                    );
                                });
                            })}
                        </div>
            </CardContent>
        </Card>
    );
}

function renderCustomChannelCard(ctx: LiveControlsSlotCtx, ch: DMXFixture["channels"][number]) {
    const {fixture, liveState, patchCustomChannel, sliderDisabled} = ctx;
    const props = ch.properties as JSONMap | undefined;
    const entries = parseFixtureEntries(props);
    const slotMode = entries.length > 0;
    const customState = liveState.customChannels[ch.channel] ?? initCustomChannelState(ch);
    const title = customChannelLabel(ch);
    const partyChannel = channelIncludedInParty(fixture, ch);
    return (
        <Card key={`custom-${ch.channel}`}>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                    <span className="min-w-0 truncate">{title}</span>
                    {partyChannel && (
                        <Badge
                            variant="outline"
                            className="h-4 shrink-0 border-violet-500/40 bg-violet-500/10 px-1.5 text-[10px] font-medium text-violet-700 dark:text-violet-300"
                        >
                            Party
                        </Badge>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {!slotMode ? (
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <LiveControlLabel party={partyChannel}>Value</LiveControlLabel>
                            <span className="tabular-nums text-muted-foreground">{customState.outputByte}</span>
                        </div>
                        <Slider
                            min={0}
                            max={100}
                            step={1}
                            value={[customState.linear01 * 100]}
                            onValueChange={([v]) => {
                                const linear01 = (v ?? 0) / 100;
                                const min = typeof props?.min === "number" ? props.min : 0;
                                const max = typeof props?.max === "number" ? props.max : 255;
                                const outputByte = Math.round(Math.max(0, Math.min(255, min + linear01 * (max - min))));
                                patchCustomChannel(ch.channel, {linear01, slot01: [], outputByte});
                            }}
                            disabled={sliderDisabled}
                        />
                    </div>
                ) : (
                    entries.map((entry, si) => {
                        const slot01 = customState.slot01[si] ?? 0.5;
                        const slotValue = Math.round(entry.from + slot01 * (entry.to - entry.from));
                        return (
                            <div key={si} className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <LiveControlLabel party={partyChannel}>
                                        {entry.label?.trim() || `Slot ${si + 1}`}
                                    </LiveControlLabel>
                                    <span className="tabular-nums text-muted-foreground">{slotValue}</span>
                                </div>
                                <Slider
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={[slot01 * 100]}
                                    onValueChange={([v]) => {
                                        const t01 = (v ?? 0) / 100;
                                        const slot01Next = [...customState.slot01];
                                        while (slot01Next.length < entries.length) {
                                            slot01Next.push(0.5);
                                        }
                                        slot01Next[si] = t01;
                                        const outputByte = Math.round(entry.from + t01 * (entry.to - entry.from));
                                        patchCustomChannel(ch.channel, {
                                            ...customState,
                                            slot01: slot01Next,
                                            outputByte: Math.max(0, Math.min(255, outputByte)),
                                        });
                                    }}
                                    disabled={sliderDisabled}
                                />
                            </div>
                        );
                    })
                )}
            </CardContent>
        </Card>
    );
}

function SlotSmoke(ctx: LiveControlsSlotCtx) {
    const {hasSmokeFogOutput} = ctx;
    if (!hasSmokeFogOutput) {
        return null;
    }
    const {liveState, patchState, sliderDisabled, sliderGridClass, sliderFullRowClass, fixture} = ctx;
    return (
        <section className="space-y-4">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Smoke</div>
                                        <div className={sliderGridClass}>
                                            <div className={cn("space-y-2", sliderFullRowClass)}>
                                                <div className="flex justify-between text-sm">
                                                    <LiveControlLabel party={fixturePartyIncludesChannelType(fixture, "fog")}>
                                                        Fog output
                                                    </LiveControlLabel>
                                                    <span className="tabular-nums text-muted-foreground">
                                                        {liveState.fog01 <= 0 ? "Off" : `${Math.round(liveState.fog01 * 100)}%`}
                                                    </span>
                                                </div>
                                                <Slider
                                                    min={0}
                                                    max={100}
                                                    step={1}
                                                    value={[liveState.fog01 * 100]}
                                                    onValueChange={([v]) => patchState({fog01: (v ?? 0) / 100})}
                                                    disabled={sliderDisabled}
                                                />
                                                <div className="flex flex-wrap gap-2">
                                                    {SMOKE_FOG_PRESETS.map((preset) => (
                                                        <Button
                                                            key={preset.label}
                                                            type="button"
                                                            size="sm"
                                                            variant={Math.abs(liveState.fog01 - preset.value) < 0.005 ? "default" : "outline"}
                                                            onClick={() => patchState({fog01: preset.value})}
                                                            disabled={sliderDisabled}
                                                        >
                                                            {preset.label}
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </section>
    );
}

function SlotMovement(ctx: LiveControlsSlotCtx) {
    const {hasPan, hasTilt, hasDimmer, hasMovementSpeed} = ctx;
    if (!hasPan && !hasTilt && !hasDimmer && !hasMovementSpeed) {
        return null;
    }
    const {liveState, patchState, sliderDisabled, sliderGridClass, sliderFullRowClass, fixture, maxPanDeg, maxTiltDeg, msEntries, msMax} = ctx;
    return (
        <section className="space-y-4">
                                        <div
                                            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Movement &amp; master
                                        </div>
                                        <div className={sliderGridClass}>
                                            {hasPan && (
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-sm">
                                                        <LiveControlLabel party={fixturePartyIncludesChannelType(fixture, "pan")}>
                                                            Pan
                                                        </LiveControlLabel>
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
                                                        <LiveControlLabel party={fixturePartyIncludesChannelType(fixture, "tilt")}>
                                                            Tilt
                                                        </LiveControlLabel>
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
                                                        <LiveControlLabel party={fixturePartyIncludesChannelType(fixture, "dimmer")}>
                                                            Dimmer
                                                        </LiveControlLabel>
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
                                                <div className={cn("space-y-2", sliderFullRowClass)}>
                                                    <div className="flex justify-between text-sm">
                                                        <LiveControlLabel
                                                            party={fixturePartyIncludesChannelType(fixture, "movementSpeed")}
                                                        >
                                                            Movement speed slot
                                                        </LiveControlLabel>
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
    );
}

function SlotColorGobo(ctx: LiveControlsSlotCtx) {
    const {hasColorWheel, hasGobo1, hasGobo2} = ctx;
    if (!hasColorWheel && !hasGobo1 && !hasGobo2) {
        return null;
    }
    const {liveState, patchState, sliderDisabled, sliderGridClass, fixture, cwEntries, g1Entries, g2Entries, cwMax} = ctx;
    return (
        <>
            <Separator/>
                                        <section className="space-y-4">
                                            <div
                                                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Color &amp; gobos
                                            </div>
                                            <div className={sliderGridClass}>
                                                {hasColorWheel && (
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between text-sm">
                                                            <LiveControlLabel
                                                                party={fixturePartyIncludesChannelType(fixture, "colorWheel")}
                                                            >
                                                                Color wheel
                                                            </LiveControlLabel>
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
                                                            <LiveControlLabel
                                                                party={fixturePartyIncludesChannelType(fixture, "goboWheel")}
                                                            >
                                                                Gobo wheel 1
                                                            </LiveControlLabel>
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
                                                            <LiveControlLabel
                                                                party={fixturePartyIncludesChannelType(fixture, "goboWheel")}
                                                            >
                                                                Gobo wheel 2
                                                            </LiveControlLabel>
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
    );
}

function SlotBeam(ctx: LiveControlsSlotCtx) {
    const {hasShutter, hasFocus, hasZoom, hasIris, hasFrost} = ctx;
    if (!hasShutter && !hasFocus && !hasZoom && !hasIris && !hasFrost) {
        return null;
    }
    const {liveState, patchState, sliderDisabled, sliderGridClass, sliderFullRowClass, fixture, frostEntries} = ctx;
    return (
        <>
            <Separator/>
                                        <section className="space-y-4">
                                            <div
                                                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Beam
                                            </div>
                                            <div className={sliderGridClass}>
                                                {hasShutter && (
                                                    <div className={cn("space-y-2", sliderFullRowClass)}>
                                                        <LiveControlLabel
                                                            party={fixturePartyIncludesChannelType(fixture, "shutterStrobe")}
                                                        >
                                                            Shutter / strobe
                                                        </LiveControlLabel>
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
                                                            <LiveControlLabel party={fixturePartyIncludesChannelType(fixture, "focus")}>
                                                                Focus
                                                            </LiveControlLabel>
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
                                                            <LiveControlLabel party={fixturePartyIncludesChannelType(fixture, "zoom")}>
                                                                Zoom
                                                            </LiveControlLabel>
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
                                                            <LiveControlLabel party={fixturePartyIncludesChannelType(fixture, "iris")}>
                                                                Iris
                                                            </LiveControlLabel>
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
                                                        <div className={cn("space-y-2", sliderFullRowClass)}>
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
                                                        <div className={cn("space-y-2", sliderFullRowClass)}>
                                                            <div className="flex justify-between text-sm">
                                                                <LiveControlLabel party={fixturePartyIncludesChannelType(fixture, "frost")}>
                                                                    Frost
                                                                </LiveControlLabel>
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
    );
}

export function renderLiveControlsSlot(id: string, ctx: LiveControlsSlotCtx): ReactNode {
    switch (id) {
        case "preview":
            return SlotPreview(ctx);
        case "smoke":
            return SlotSmoke(ctx);
        case "movement":
            return SlotMovement(ctx);
        case "colorGobo":
            return SlotColorGobo(ctx);
        case "beam":
            return SlotBeam(ctx);
        case "custom-all":
            return SlotCustomAll(ctx);
        default:
            if (id.startsWith("custom-")) {
                const n = Number(id.slice("custom-".length));
                const ch = ctx.fixture.channels.find((c) => c.type === "custom" && c.channel === n);
                if (!ch) {
                    return null;
                }
                return renderCustomChannelCard(ctx, ch);
            }
            return null;
    }
}
