import { Button } from "@/components/ui/button";
import { DMXEmergencyButton } from "./DMXEmergencyButton";
import { DMXOutputIndicator } from "./DMXOutputIndicator";
import {
    DMX_UNIVERSE_SLOTS,
    channelIndexToCell,
    footprint,
    splitRangeIntoSegments,
    universeRange,
} from "@/lib/dmxUniverseGrid";
import {
    fixturesForUniverse,
    normalizeUniverses,
    resolveUniverseId,
} from "@/lib/dmxUniverses";
import { isFixtureSlave, resolveFixtureMaster } from "@/lib/dmxFixtureMasterSlave";
import { cn } from "@/lib/utils";
import type { ControllerSettings, DMXFixture, DMXUniverse, DetailRoute, USBSerialDevice } from "@/types/controller";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { PiPlus, PiWarningCircle } from "react-icons/pi";
import type { DMXLiveStatus } from "../../../bindings/goldbus/internal/dmx";

export type DMXUniverseViewProps = {
    universes: DMXUniverse[];
    selectedUniverseId: string;
    settings: ControllerSettings | null;
    fixtures: DMXFixture[];
    busy: boolean;
    selectedUSBDeviceId: string;
    usbSerialDevices: USBSerialDevice[];
    setRoute: (route: DetailRoute) => void;
    onReaddressFixtures: (updates: Array<{ id: string; dmxAddress: number }>, successLabel?: string) => Promise<boolean>;
    dmxLiveStatus: DMXLiveStatus | null;
    pullDMXLiveStatus: () => Promise<void>;
    onEmergency: () => void | Promise<void>;
};

function padChannel(n: number): string {
    return String(Math.max(1, Math.min(DMX_UNIVERSE_SLOTS, n))).padStart(3, "0");
}


/** Match the grabbed element's rendered size so the browser does not scale the drag ghost. */
function attachUniverseFixtureDragImage(event: DragEvent<HTMLButtonElement>) {
    const source = event.currentTarget;
    const rect = source.getBoundingClientRect();
    const clone = source.cloneNode(true) as HTMLButtonElement;
    clone.type = "button";
    clone.style.position = "fixed";
    clone.style.left = "0";
    clone.style.top = "0";
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.margin = "0";
    clone.style.boxSizing = "border-box";
    clone.style.transform = "none";
    clone.style.opacity = "0.45";
    clone.style.pointerEvents = "none";
    clone.style.zIndex = "10000";
    clone.setAttribute("aria-hidden", "true");
    document.body.appendChild(clone);
    event.dataTransfer.setDragImage(clone, event.nativeEvent.offsetX, event.nativeEvent.offsetY);
    window.setTimeout(() => clone.remove(), 0);
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

type DropTargetRange = {
    start: number;
    end: number;
};

function dropTargetRange(
    fixtureById: Map<string, DMXFixture>,
    draggingFixtureId: string | null,
    dropChannel: number | null,
): DropTargetRange | null {
    if (!draggingFixtureId || dropChannel == null) {
        return null;
    }
    const draggedFixture = fixtureById.get(draggingFixtureId);
    if (!draggedFixture) {
        return null;
    }
    const start = Math.max(1, Math.min(DMX_UNIVERSE_SLOTS, Math.round(dropChannel) || 1));
    return {start, end: start + footprint(draggedFixture) - 1};
}

function channelInDropTargetRange(channel: number, range: DropTargetRange | null): boolean {
    return range != null && channel >= range.start && channel <= range.end;
}

function segmentOverlapsDropTargetRange(segStartCh: number, span: number, range: DropTargetRange | null): boolean {
    if (!range) {
        return false;
    }
    const segEndCh = segStartCh + span - 1;
    return segStartCh <= range.end && range.start <= segEndCh;
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
                                    universes: universesProp,
                                    selectedUniverseId,
                                    fixtures: allFixtures,
                                    busy,
                                    setRoute,
                                    onReaddressFixtures,
                                    dmxLiveStatus,
                                    pullDMXLiveStatus,
                                    onEmergency,
                                }: DMXUniverseViewProps) {
    const {t} = useTranslation("dmx");
    const [draggingFixtureId, setDraggingFixtureId] = useState<string | null>(null);
    const [dropChannel, setDropChannel] = useState<number | null>(null);
    const [dropBusy, setDropBusy] = useState(false);
    const viewBusy = busy || dropBusy;
    const universes = useMemo(() => normalizeUniverses(universesProp), [universesProp]);
    const activeUniverseId = resolveUniverseId(selectedUniverseId, universes);

    const fixtures = useMemo(
        () => fixturesForUniverse(allFixtures, activeUniverseId, universes),
        [allFixtures, activeUniverseId, universes],
    );

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

    useEffect(() => {
        void pullDMXLiveStatus();
    }, [pullDMXLiveStatus]);

    const dropPlan = useMemo(() => {
        if (!draggingFixtureId || dropChannel == null) {
            return null;
        }
        return resolveForwardChainPush(fixtures, draggingFixtureId, dropChannel);
    }, [draggingFixtureId, dropChannel, fixtures]);

    const dropPreviewRange = useMemo(
        () => dropTargetRange(fixtureById, draggingFixtureId, dropChannel),
        [fixtureById, draggingFixtureId, dropChannel],
    );

    const handleDropOnChannel = async (targetChannel: number) => {
        if (!draggingFixtureId || dropBusy) {
            return;
        }
        const plan = resolveForwardChainPush(fixtures, draggingFixtureId, targetChannel);
        if (!plan) {
            await onReaddressFixtures([], t("universe.moveRejectedNoSpace"));
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
        const draggedName = draggedFixture?.name ?? t("universe.fixtureFallback");
        const successLabel =
            plan.shiftedCount > 0
                ? t("universe.movedShifted", {
                      count: plan.shiftedCount,
                      name: draggedName,
                      address: padChannel(movedTo),
                  })
                : t("universe.movedNoShift", {
                      name: draggedName,
                      address: padChannel(movedTo),
                  });

        setDropBusy(true);
        try {
            await onReaddressFixtures(plan.updates, successLabel);
        } finally {
            setDropBusy(false);
            setDropChannel(null);
            setDraggingFixtureId(null);
        }
    };

    const gridContainerRef = useRef<HTMLDivElement>(null);
    const [gridCols, setGridCols] = useState(26);

    useEffect(() => {
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                const {width} = entry.contentRect;
                const newCols = Math.max(1, Math.floor((width + 4) / (46 + 4)));
                setGridCols(newCols);
            }
        });
        const el = gridContainerRef.current;
        if (el) {
            observer.observe(el);
        }
        return () => {
            if (el) {
                observer.unobserve(el);
            }
        };
    }, []);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
            
            <div className="flex flex-wrap w-full items-start gap-2">
                <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRoute({kind: "dmxAddFixture"})}
                        disabled={viewBusy}
                    >
                        <PiPlus className="mr-1 size-4"/>
                        {t("universe.addFixture")}
                    </Button>
                    <DMXEmergencyButton busy={viewBusy} onEmergency={onEmergency}/>
                    <DMXOutputIndicator connected={liveConnected}/>
                </div>
            </div>
            
            <div
                ref={gridContainerRef}
                className="touch-pan-scroll min-h-0 flex-1 overflow-auto rounded-lg border bg-card p-3">
                <div
                    className="relative grid w-full min-w-[min(100%,640px)] gap-1"
                    style={{
                        gridTemplateColumns: `repeat(${gridCols}, 46px)`,
                        gridAutoRows: "46px",
                    }}
                >
                    {Array.from({length: DMX_UNIVERSE_SLOTS}, (_, i) => i + 1).map((ch) => {
                        if (covered.has(ch)) {
                            return null;
                        }
                        const {row, col} = channelIndexToCell(ch, gridCols);
                        return (
                            <div
                                key={`free-${ch}`}
                                className={cn(
                                    "flex items-center justify-center rounded-md border border-transparent bg-muted text-[10px] font-medium tabular-nums text-muted-foreground sm:text-xs",
                                    draggingFixtureId && channelInDropTargetRange(ch, dropPreviewRange) && (dropPlan ? "ring-2 ring-primary/50" : "ring-2 ring-destructive/50"),
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
                        const segments = splitRangeIntoSegments(range.start, range.end, gridCols);
                        const slaveFixture = isFixtureSlave(fx);
                        const masterFixture = slaveFixture ? resolveFixtureMaster(fx, fixtures) : undefined;
                        return segments.map((seg, segIdx) => {
                            const segStartCh = seg.row * gridCols + seg.colStart + 1;
                            const showFixtureBase = segIdx === 0;
                            const fixtureLive = liveConnected;
                            return (
                                <button
                                    key={`${fx.id}-${seg.row}-${seg.colStart}-${seg.span}`}
                                    type="button"
                                    draggable={!dropBusy}
                                    className={cn(
                                        "z-10 flex min-h-8 items-center justify-between gap-2 rounded-md border px-1.5 py-1 text-left shadow-sm transition-colors sm:min-h-9",
                                        slaveFixture
                                            ? "border-muted-foreground/30 bg-muted/30 hover:bg-muted/40"
                                            : "bg-primary/10 border-primary/30 hover:bg-primary/15",
                                        "cursor-grab active:cursor-grabbing",
                                        conflict && "border-destructive ring-1 ring-destructive/40",
                                        fixtureLive && !slaveFixture && "border-emerald-500/70 bg-emerald-500/15",
                                        draggingFixtureId === fx.id && "opacity-40",
                                        draggingFixtureId && segmentOverlapsDropTargetRange(segStartCh, seg.span, dropPreviewRange) && (dropPlan ? "ring-2 ring-primary/50" : "ring-2 ring-destructive/50"),
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
                                        attachUniverseFixtureDragImage(event);
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
                                    title={
                                        slaveFixture
                                            ? t("universe.slaveOfMaster", {
                                                  master: masterFixture?.name ?? t("universe.slaveOfFallback"),
                                                  name: fx.name,
                                              })
                                            : t("universe.openFixture", {name: fx.name})
                                    }
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
                                                slaveFixture
                                                    ? "text-muted-foreground"
                                                    : fixtureLive
                                                    ? "text-emerald-600"
                                                    : "text-muted-foreground",
                                            )}
                                        >
                      <span
                          className={cn(
                              "size-2 rounded-full",
                              slaveFixture
                                  ? "bg-muted-foreground/50"
                                  : fixtureLive
                                  ? "bg-emerald-500"
                                  : "bg-muted-foreground/50",
                          )}
                          aria-hidden
                      />
                                            {slaveFixture ? t("universe.slave") : fixtureLive ? t("universe.live") : t("universe.idle")}
                                            {conflict && (
                                                <PiWarningCircle className="size-3 shrink-0 text-destructive" aria-hidden/>
                                            )}
                    </span>
                                    ) : conflict ? (
                                        <span
                                            className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-destructive">
                      <PiWarningCircle className="size-3 shrink-0" aria-hidden/>
                      <span className="sr-only">{t("universe.addressOverlap")}</span>
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
