import {useEffect, useMemo, useState} from "react";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {DMXPartyPanel} from "@/components/dmx/DMXPartyPanel";
import {
    channelIndexToCell,
    DMX_UNIVERSE_GRID_COLS,
    DMX_UNIVERSE_SLOTS,
    footprint,
    splitRangeIntoSegments,
    universeRange,
} from "@/lib/dmxUniverseGrid";
import {parseFixtureEntries} from "@/lib/dmxLiveMap";
import type {DetailRoute, DMXFixture, DMXPartyAudioInputDevice, DMXPartyConfig, DMXPartyState, USBSerialDevice} from "../../types/controller";
import type {DMXLiveStatus} from "../../../bindings/goldbus/internal/dmx/models";
import type {JSONMap} from "../../types/controller";
import {PiPlus, PiWarningCircle} from "react-icons/pi";

export type DMXUniverseViewProps = {
    fixtures: DMXFixture[];
    busy: boolean;
    selectedUSBDeviceId: string;
    usbSerialDevices: USBSerialDevice[];
    setRoute: (route: DetailRoute) => void;
    onReaddressFixtures: (updates: Array<{ id: string; dmxAddress: number }>, successLabel?: string) => Promise<boolean>;
    dmxLiveStatus: DMXLiveStatus | null;
    pullDMXLiveStatus: () => Promise<void>;
    startDMXLiveOutput: (fixtureID: string) => Promise<boolean>;
    stopDMXLiveOutput: () => Promise<void>;
    queueDmxLivePatch: (entries: Array<{ address: number; value: number }>) => void;
    partyState: DMXPartyState;
    partyAudioInputDevices: DMXPartyAudioInputDevice[];
    pullPartyAudioInputDevices: () => Promise<DMXPartyAudioInputDevice[]>;
    setDMXPartyConfig: (partial: Partial<DMXPartyConfig>) => Promise<boolean>;
    startDMXPartyMode: () => Promise<boolean>;
    stopDMXPartyMode: () => Promise<void>;
};

function padChannel(n: number): string {
    return String(Math.max(1, Math.min(DMX_UNIVERSE_SLOTS, n))).padStart(3, "0");
}

function buildSlotOccupancy(fixtures: DMXFixture[]): Map<number, string[]> {
    const map = new Map<number, string[]>();
    for (const fx of fixtures) {
        const range = universeRange(fx);
        if (!range) {
            continue;
        }
        for (let s = range.start; s <= range.end; s++) {
            const list = map.get(s);
            if (list) {
                list.push(fx.id);
            } else {
                map.set(s, [fx.id]);
            }
        }
    }
    return map;
}

function fixtureHasConflict(fx: DMXFixture, occupancy: Map<number, string[]>): boolean {
    const range = universeRange(fx);
    if (!range) {
        return false;
    }
    for (let s = range.start; s <= range.end; s++) {
        const ids = occupancy.get(s);
        if (ids && ids.length > 1) {
            return true;
        }
    }
    return false;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
    return aStart <= bEnd && bStart <= aEnd;
}

type ReaddressPlan = {
    updates: Array<{ id: string; dmxAddress: number }>;
    shiftedCount: number;
};

function fixtureAddress(base: number, offset: number): number {
    return base + offset - 1;
}

function clamp255(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n)));
}

function entryMid(from: number, to: number): number {
    return clamp255((from + to) / 2);
}

function pickEntryByKeywords(
    entries: Array<{ from: number; to: number; mode?: string; label?: string }>,
    keywords: string[],
): { from: number; to: number } | null {
    const lowered = keywords.map((k) => k.toLowerCase());
    for (const entry of entries) {
        const hay = `${(entry.mode ?? "").toLowerCase()} ${(entry.label ?? "").toLowerCase()}`;
        if (lowered.some((k) => hay.includes(k))) {
            return entry;
        }
    }
    return null;
}

function controlChannelValue(channel: DMXFixture["channels"][number], on: boolean): number {
    if (
        channel.type === "dimmer" ||
        channel.type === "dimmerFine" ||
        channel.type === "onOff" ||
        channel.type === "lamp"
    ) {
        // Universe toggle should force clear OFF semantics.
        return on ? 255 : 0;
    }
    const props = channel.properties as JSONMap | undefined;
    const entries = parseFixtureEntries(props);
    if (entries.length > 0) {
        const picked = on
            ? pickEntryByKeywords(entries, ["open", "on", "lamp on", "full"])
            : pickEntryByKeywords(entries, ["close", "closed", "off", "blackout", "lamp off"]);
        if (picked) {
            return entryMid(picked.from, picked.to);
        }
        return on ? entryMid(entries[0].from, entries[0].to) : entryMid(entries[entries.length - 1].from, entries[entries.length - 1].to);
    }
    const min = typeof props?.min === "number" ? props.min : 0;
    const max = typeof props?.max === "number" ? props.max : 255;
    return clamp255(on ? max : min);
}

function summarizeCustomPowerHint(channel: DMXFixture["channels"][number]): {score: number; hint: string} | null {
    if (channel.type !== "custom") {
        return null;
    }
    const props = channel.properties as JSONMap | undefined;
    const entries = parseFixtureEntries(props);
    const parts: string[] = [];
    if (typeof props?.label === "string") {
        parts.push(props.label);
    }
    if (typeof props?.name === "string") {
        parts.push(props.name);
    }
    for (const e of entries) {
        if (e.label) {
            parts.push(e.label);
        }
        if (e.mode) {
            parts.push(e.mode);
        }
    }
    const hay = parts.join(" ").toLowerCase();
    if (!hay) {
        return null;
    }
    let score = 0;
    if (hay.includes("dimmer") || hay.includes("intensity") || hay.includes("master")) {
        score += 2;
    }
    if (hay.includes("lamp") || hay.includes("power")) {
        score += 2;
    }
    if (hay.includes("on") || hay.includes("off")) {
        score += 1;
    }
    if (score <= 0) {
        return null;
    }
    return {score, hint: parts.slice(0, 3).join(" | ")};
}

function buildAllFixturesPowerPatch(
    fixtures: DMXFixture[],
    value: number,
): Array<{ address: number; value: number }> {
    const on = value > 0;
    const updates: Array<{ address: number; value: number }> = [];
    let fixturesUsingFallback = 0;
    const fixtureSummaries: Array<{
        id: string;
        base: number;
        matchedTypes: string[];
        matchedAddresses: number[];
        matchedValues: number[];
        customPowerHints: Array<{ address: number; score: number; hint: string }>;
        usedFallback: boolean;
        fallbackAddress?: number;
        allChannelTypes: string[];
        allChannelOffsets: number[];
    }> = [];
    for (const fixture of fixtures) {
        const base = Number.isFinite(fixture.dmxAddress) ? Math.round(fixture.dmxAddress) : 1;
        let matched = 0;
        let matchedHardPower = 0;
        const matchedTypes: string[] = [];
        const matchedAddresses: number[] = [];
        const matchedValues: number[] = [];
        const customPowerHints: Array<{ address: number; score: number; hint: string }> = [];
        let fallbackAddress: number | undefined;
        for (const channel of fixture.channels) {
            const offset = Number.isFinite(channel.channel) ? Math.round(channel.channel) : 1;
            const address = fixtureAddress(base, offset);
            if (address < 1 || address > DMX_UNIVERSE_SLOTS) {
                continue;
            }
            const customHint = summarizeCustomPowerHint(channel);
            if (customHint) {
                customPowerHints.push({address, score: customHint.score, hint: customHint.hint});
            }
            if (
                channel.type === "dimmer" ||
                channel.type === "dimmerFine" ||
                channel.type === "onOff" ||
                channel.type === "lamp" ||
                channel.type === "shutterStrobe"
            ) {
                const controlValue = controlChannelValue(channel, on);
                updates.push({address, value: controlValue});
                matched += 1;
                if (
                    channel.type === "dimmer" ||
                    channel.type === "dimmerFine" ||
                    channel.type === "onOff" ||
                    channel.type === "lamp"
                ) {
                    matchedHardPower += 1;
                }
                matchedTypes.push(channel.type);
                matchedAddresses.push(address);
                matchedValues.push(controlValue);
            }
        }
        // If fixture lacks explicit power channels, also drive non-control channels.
        if (matchedHardPower === 0 && fixture.channels.length > 0) {
            fixturesUsingFallback += 1;
            const allOffsets = fixture.channels
                .map((ch) => (Number.isFinite(ch.channel) ? Math.round(ch.channel) : 1))
                .filter((off) => off >= 1)
                .sort((a, b) => a - b);
            for (const off of allOffsets) {
                const addr = fixtureAddress(base, off);
                if (addr >= 1 && addr <= DMX_UNIVERSE_SLOTS) {
                    const alreadyWritten = updates.some((u) => u.address === addr);
                    if (!alreadyWritten) {
                        updates.push({address: addr, value: on ? 255 : 0});
                    }
                }
            }
            if (allOffsets.length > 0) {
                fallbackAddress = fixtureAddress(base, allOffsets[0]);
            }
        }
        fixtureSummaries.push({
            id: fixture.id,
            base,
            matchedTypes,
            matchedAddresses,
            matchedValues,
            customPowerHints,
            usedFallback: matchedHardPower === 0,
            fallbackAddress,
            allChannelTypes: fixture.channels.map((ch) => ch.type),
            allChannelOffsets: fixture.channels.map((ch) => (Number.isFinite(ch.channel) ? Math.round(ch.channel) : 1)),
        });
    }
    return updates;
}

function resolveForwardChainPush(
    fixtures: DMXFixture[],
    draggedFixtureId: string,
    targetStart: number,
): ReaddressPlan | null {
    const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
    const draggedFixture = fixtureById.get(draggedFixtureId);
    if (!draggedFixture) {
        return null;
    }

    const draggedFootprint = footprint(draggedFixture);
    const clampedStart = Math.max(1, Math.min(DMX_UNIVERSE_SLOTS, Math.round(targetStart) || 1));
    const draggedEnd = clampedStart + draggedFootprint - 1;
    if (draggedEnd > DMX_UNIVERSE_SLOTS) {
        return null;
    }

    const placements = [{id: draggedFixtureId, start: clampedStart, end: draggedEnd}];
    const others = fixtures
        .filter((fixture) => fixture.id !== draggedFixtureId)
        .sort((a, b) => {
            const aStart = universeRange(a)?.start ?? DMX_UNIVERSE_SLOTS + 1;
            const bStart = universeRange(b)?.start ?? DMX_UNIVERSE_SLOTS + 1;
            if (aStart !== bStart) {
                return aStart - bStart;
            }
            return a.id.localeCompare(b.id);
        });

    for (const fixture of others) {
        const fp = footprint(fixture);
        let start = universeRange(fixture)?.start ?? 1;
        while (true) {
            const end = start + fp - 1;
            if (end > DMX_UNIVERSE_SLOTS) {
                return null;
            }
            const overlaps = placements.filter((p) => rangesOverlap(start, end, p.start, p.end));
            if (overlaps.length === 0) {
                placements.push({id: fixture.id, start, end});
                break;
            }
            const blockerEnd = Math.max(...overlaps.map((p) => p.end));
            start = blockerEnd + 1;
        }
    }

    const updates: Array<{ id: string; dmxAddress: number }> = [];
    let shiftedCount = 0;
    for (const placement of placements) {
        const fixture = fixtureById.get(placement.id);
        if (!fixture || fixture.dmxAddress === placement.start) {
            continue;
        }
        updates.push({id: placement.id, dmxAddress: placement.start});
        if (placement.id !== draggedFixtureId) {
            shiftedCount += 1;
        }
    }
    return {updates, shiftedCount};
}

export function DMXUniverseView({
                                    fixtures,
                                    busy,
                                    selectedUSBDeviceId,
                                    usbSerialDevices,
                                    setRoute,
                                    onReaddressFixtures,
                                    dmxLiveStatus,
                                    pullDMXLiveStatus,
                                    startDMXLiveOutput,
                                    stopDMXLiveOutput,
                                    queueDmxLivePatch,
                                    partyState,
                                    partyAudioInputDevices,
                                    pullPartyAudioInputDevices,
                                    setDMXPartyConfig,
                                    startDMXPartyMode,
                                    stopDMXPartyMode,
                                }: DMXUniverseViewProps) {
    const [draggingFixtureId, setDraggingFixtureId] = useState<string | null>(null);
    const [dropChannel, setDropChannel] = useState<number | null>(null);
    const [dropBusy, setDropBusy] = useState(false);
    const usbDevice = usbSerialDevices.find((d) => d.id === selectedUSBDeviceId);
    const subtitle = usbDevice?.name ?? usbDevice?.description ?? "No USB device selected";

    const fixtureById = useMemo(() => new Map(fixtures.map((fixture) => [fixture.id, fixture])), [fixtures]);
    const occupancy = buildSlotOccupancy(fixtures);
    const covered = new Set<number>();
    for (const fx of fixtures) {
        const range = universeRange(fx);
        if (!range) {
            continue;
        }
        for (let s = range.start; s <= range.end; s++) {
            covered.add(s);
        }
    }

    const sortedFixtures = [...fixtures].sort((a, b) => {
        const ra = universeRange(a);
        const rb = universeRange(b);
        const sa = ra?.start ?? 9999;
        const sb = rb?.start ?? 9999;
        if (sa !== sb) {
            return sa - sb;
        }
        return a.id.localeCompare(b.id);
    });
    const liveConnected = dmxLiveStatus?.connected === true;
    const anyLive = liveConnected;

    useEffect(() => {
        void pullDMXLiveStatus();
    }, [pullDMXLiveStatus]);

    const handleToggleAllLive = async () => {
        if (busy || dropBusy) {
            return;
        }
        if (anyLive) {
            const offUpdates = buildAllFixturesPowerPatch(sortedFixtures, 0);
            if (offUpdates.length > 0) {
                queueDmxLivePatch(offUpdates);
            }
            await stopDMXLiveOutput();
            await pullDMXLiveStatus();
            return;
        }
        if (sortedFixtures.length === 0) {
            return;
        }
        await startDMXLiveOutput(sortedFixtures[0].id);
        const updates = buildAllFixturesPowerPatch(sortedFixtures, 255);
        if (updates.length > 0) {
            queueDmxLivePatch(updates);
        }
        await pullDMXLiveStatus();
    };

    const dropPlan = useMemo(() => {
        if (!draggingFixtureId || dropChannel == null) {
            return null;
        }
        return resolveForwardChainPush(fixtures, draggingFixtureId, dropChannel);
    }, [draggingFixtureId, dropChannel, fixtures]);

    const handleDropOnChannel = async (targetChannel: number) => {
        if (!draggingFixtureId || dropBusy) {
            return;
        }
        const plan = resolveForwardChainPush(fixtures, draggingFixtureId, targetChannel);
        if (!plan) {
            await onReaddressFixtures([], "Move rejected: no space left in DMX universe.");
            setDropChannel(null);
            setDraggingFixtureId(null);
            return;
        }
        if (plan.updates.length === 0) {
            setDropChannel(null);
            setDraggingFixtureId(null);
            return;
        }

        const draggedFixture = fixtureById.get(draggingFixtureId);
        const moved = plan.updates.find((update) => update.id === draggingFixtureId);
        const movedTo = moved?.dmxAddress ?? targetChannel;
        const successLabel = `Moved "${draggedFixture?.name ?? "fixture"}" to ${padChannel(movedTo)}${plan.shiftedCount > 0 ? ` and shifted ${plan.shiftedCount} fixture${plan.shiftedCount === 1 ? "" : "s"}` : ""}.`;

        setDropBusy(true);
        try {
            await onReaddressFixtures(plan.updates, successLabel);
        } finally {
            setDropBusy(false);
            setDropChannel(null);
            setDraggingFixtureId(null);
        }
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
            <div className="flex flex-wrap items-start gap-2">
                <div
                    className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-primary px-3 py-2 text-primary-foreground shadow-sm">
                    <span className="text-sm font-semibold leading-none">Universe 1</span>
                    <span className="truncate text-xs opacity-90" title={subtitle}>
            {subtitle}
          </span>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    disabled
                    title="Only one universe supported"
                    aria-label="Add universe (not available)"
                >
                    <PiPlus className="size-4" aria-hidden/>
                </Button>
                <Button
                    type="button"
                    variant={anyLive ? "destructive" : "secondary"}
                    size="sm"
                    className="shrink-0"
                    onClick={() => void handleToggleAllLive()}
                    disabled={busy || dropBusy || sortedFixtures.length === 0}
                >
                    {anyLive ? "All fixtures live: ON" : "All fixtures live: OFF"}
                </Button>
            </div>
            <DMXPartyPanel
                fixtures={sortedFixtures}
                party={partyState}
                busy={busy || dropBusy}
                liveConnected={liveConnected}
                audioInputDevices={partyAudioInputDevices}
                onRefreshAudioDevices={async () => {
                    await pullPartyAudioInputDevices();
                }}
                onUpdateConfig={setDMXPartyConfig}
                onStart={startDMXPartyMode}
                onStop={stopDMXPartyMode}
            />

            <div
                className="touch-pan-scroll min-h-0 flex-1 overflow-auto rounded-lg border bg-card p-3">
                <div
                    className="relative grid w-full min-w-[min(100%,640px)] gap-1"
                    style={{
                        gridTemplateColumns: `repeat(${DMX_UNIVERSE_GRID_COLS}, minmax(0, 1fr))`,
                        gridAutoRows: "minmax(2rem, auto)",
                    }}
                >
                    {Array.from({length: DMX_UNIVERSE_SLOTS}, (_, i) => i + 1).map((ch) => {
                        if (covered.has(ch)) {
                            return null;
                        }
                        const {row, col} = channelIndexToCell(ch);
                        return (
                            <div
                                key={`free-${ch}`}
                                className={cn(
                                    "flex items-center justify-center rounded-md border border-transparent bg-muted text-[10px] font-medium tabular-nums text-muted-foreground sm:text-xs",
                                    draggingFixtureId && dropChannel === ch && (dropPlan ? "ring-2 ring-primary/50" : "ring-2 ring-destructive/50"),
                                )}
                                style={{
                                    gridRow: row + 1,
                                    gridColumn: col + 1,
                                }}
                                onDragOver={(event) => {
                                    if (!draggingFixtureId || dropBusy) {
                                        return;
                                    }
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                    setDropChannel(ch);
                                }}
                                onDrop={(event) => {
                                    if (!draggingFixtureId || dropBusy) {
                                        return;
                                    }
                                    event.preventDefault();
                                    void handleDropOnChannel(ch);
                                }}
                            >
                                {padChannel(ch)}
                            </div>
                        );
                    })}

                    {sortedFixtures.flatMap((fx) => {
                        const range = universeRange(fx);
                        if (!range) {
                            return [];
                        }
                        const conflict = fixtureHasConflict(fx, occupancy);
                        const segments = splitRangeIntoSegments(range.start, range.end);
                        return segments.map((seg, segIdx) => {
                            const segStartCh = seg.row * DMX_UNIVERSE_GRID_COLS + seg.colStart + 1;
                            const showFixtureBase = segIdx === 0;
                            const fixtureLive = liveConnected;
                            return (
                                <button
                                    key={`${fx.id}-${seg.row}-${seg.colStart}-${seg.span}`}
                                    type="button"
                                    draggable={!dropBusy}
                                    className={cn(
                                        "z-10 flex min-h-8 items-center justify-between gap-2 rounded-md border px-1.5 py-1 text-left shadow-sm transition-colors sm:min-h-9",
                                        "bg-primary/10 border-primary/30 hover:bg-primary/15",
                                        "cursor-grab active:cursor-grabbing",
                                        conflict && "border-destructive ring-1 ring-destructive/40",
                                        fixtureLive && "border-emerald-500/70 bg-emerald-500/15",
                                        draggingFixtureId === fx.id && "opacity-70",
                                        draggingFixtureId && dropChannel === segStartCh && (dropPlan ? "ring-2 ring-primary/50" : "ring-2 ring-destructive/50"),
                                    )}
                                    style={{
                                        gridRow: seg.row + 1,
                                        gridColumn: `${seg.colStart + 1} / span ${seg.span}`,
                                    }}
                                    onDragStart={(event) => {
                                        if (dropBusy) {
                                            event.preventDefault();
                                            return;
                                        }
                                        setDraggingFixtureId(fx.id);
                                        setDropChannel(universeRange(fx)?.start ?? fx.dmxAddress);
                                        event.dataTransfer.effectAllowed = "move";
                                        event.dataTransfer.setData("text/plain", fx.id);
                                    }}
                                    onDragEnd={() => {
                                        setDropChannel(null);
                                        setDraggingFixtureId(null);
                                    }}
                                    onDragOver={(event) => {
                                        if (!draggingFixtureId || dropBusy) {
                                            return;
                                        }
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = "move";
                                        setDropChannel(segStartCh);
                                    }}
                                    onDrop={(event) => {
                                        if (!draggingFixtureId || dropBusy) {
                                            return;
                                        }
                                        event.preventDefault();
                                        void handleDropOnChannel(segStartCh);
                                    }}
                                    onDoubleClick={(event) => {
                                        if (draggingFixtureId || dropBusy) {
                                            event.preventDefault();
                                            return;
                                        }
                                        setRoute({kind: "dmxFixture", id: fx.id});
                                    }}
                                    title={`Open ${fx.name}`}
                                >
                                    <span
                                        className="min-w-0 flex-1 truncate text-[10px] font-medium leading-tight text-primary/90 sm:text-xs">
                    <span className="font-semibold tabular-nums text-primary">
                      {showFixtureBase ? padChannel(fx.dmxAddress) : padChannel(segStartCh)}
                    </span>{" "}
                                        {fx.name}
                  </span>
                                    {showFixtureBase ? (
                                        <span
                                            className={cn(
                                                "inline-flex shrink-0 items-center gap-1 text-[10px]",
                                                fixtureLive ? "text-emerald-600" : "text-muted-foreground",
                                            )}
                                        >
                      <span
                          className={cn(
                              "size-2 rounded-full",
                              fixtureLive ? "bg-emerald-500" : "bg-muted-foreground/50",
                          )}
                          aria-hidden
                      />
                                            {fixtureLive ? "Live" : "Idle"}
                                            {conflict && (
                                                <PiWarningCircle className="size-3 shrink-0 text-destructive" aria-hidden/>
                                            )}
                    </span>
                                    ) : conflict ? (
                                        <span
                                            className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-destructive">
                      <PiWarningCircle className="size-3 shrink-0" aria-hidden/>
                      <span className="sr-only">Address overlap</span>
                    </span>
                                    ) : null}
                                </button>
                            );
                        });
                    })}
                </div>
            </div>
        </div>
    );
}
