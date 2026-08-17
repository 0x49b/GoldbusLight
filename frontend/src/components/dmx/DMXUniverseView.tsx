import {Button} from "@/components/ui/button";
import {DMXEmergencyButton} from "./DMXEmergencyButton";
import {DMXOutputIndicator} from "./DMXOutputIndicator";
import {
    channelIndexToCell,
    DMX_UNIVERSE_SLOTS,
    footprint,
    splitRangeIntoSegments,
    universeRange,
} from "@/lib/dmxUniverseGrid";
import {fixturesForUniverse, normalizeUniverses, resolveUniverseId,} from "@/lib/dmxUniverses";
import {isFixtureSlave, resolveFixtureMaster} from "@/lib/dmxFixtureMasterSlave";
import {cn} from "@/lib/utils";
import type {
    ControllerSettings,
    DetailRoute,
    DMXFixture,
    DMXUniverse,
    USBSerialDevice
} from "@/types/controller";
import {type DragEvent, useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {PiDownloadSimple, PiPlus, PiWarningCircle} from "react-icons/pi";
import type {DMXLiveStatus} from "../../../bindings/goldbus/internal/dmx";
import * as GoldbusLightService from "../../../bindings/goldbus/internal/service/goldbuslightservice";

export type DMXUniverseViewProps = {
    universes: DMXUniverse[];
    selectedUniverseId: string;
    settings: ControllerSettings | null;
    fixtures: DMXFixture[];
    busy: boolean;
    selectedUSBDeviceId: string;
    usbSerialDevices: USBSerialDevice[];
    setRoute: (route: DetailRoute) => void;
    onReaddressFixtures: (updates: Array<{
        id: string;
        dmxAddress: number
    }>, successLabel?: string) => Promise<boolean>;
    onExportPatchList: (universeId: string, locale: string) => Promise<string>;
    dmxLiveStatus: DMXLiveStatus | null;
    pullDMXLiveStatus: () => Promise<void>;
    onEmergency: () => void | Promise<void>;
};

function padChannel(n: number): string {
    return String(Math.max(1, Math.min(DMX_UNIVERSE_SLOTS, n))).padStart(3, "0");
}

function channelValue(frame: number[], ch: number): number {
    const raw = frame[ch - 1];
    if (!Number.isFinite(raw)) {
        return 0;
    }
    return Math.max(0, Math.min(255, Math.round(raw)));
}

const EMPTY_FRAME: number[] = Array.from({length: DMX_UNIVERSE_SLOTS}, () => 0);
const FRAME_POLL_MS = 100;


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
                                    onExportPatchList,
                                    dmxLiveStatus,
                                    pullDMXLiveStatus,
                                    onEmergency,
                                }: Readonly<DMXUniverseViewProps>) {
    const {t, i18n} = useTranslation("dmx");
    const [draggingFixtureId, setDraggingFixtureId] = useState<string | null>(null);
    const [dropChannel, setDropChannel] = useState<number | null>(null);
    const [dropBusy, setDropBusy] = useState(false);
    const [exportBusy, setExportBusy] = useState(false);
    const viewBusy = busy || dropBusy || exportBusy;
    const universes = useMemo(() => normalizeUniverses(universesProp), [universesProp]);
    const activeUniverseId = resolveUniverseId(selectedUniverseId, universes);

    const fixtures = useMemo(
        () => fixturesForUniverse(allFixtures, activeUniverseId, universes),
        [allFixtures, activeUniverseId, universes],
    );

    const [frame, setFrame] = useState<number[]>(EMPTY_FRAME);

    useEffect(() => {
        let cancelled = false;
        const pullFrame = async () => {
            try {
                const next = await GoldbusLightService.GetDMXUniverseFrame(activeUniverseId);
                if (!cancelled && Array.isArray(next) && next.length >= DMX_UNIVERSE_SLOTS) {
                    setFrame(next);
                }
            } catch {
                // Ignore transient poll errors; keep last frame.
            }
        };
        void pullFrame();
        const timer = window.setInterval(() => {
            void pullFrame();
        }, FRAME_POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [activeUniverseId]);

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

    const handleExportPatchList = async () => {
        if (exportBusy) {
            return;
        }
        setExportBusy(true);
        try {
            await onExportPatchList(activeUniverseId, i18n.language);
        } catch {
            // Status/error are reported by the export handler.
        } finally {
            setExportBusy(false);
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
                        onClick={() => void handleExportPatchList()}
                        disabled={viewBusy}
                    >
                        <PiDownloadSimple className="mr-1 size-4"/>
                        {t("universe.exportPatchList")}
                    </Button>
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
                                    "relative flex items-center justify-center rounded-md border border-transparent bg-muted text-[10px] font-medium tabular-nums text-muted-foreground sm:text-xs",
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
                                <span className="leading-none">{channelValue(frame, ch)}</span>
                                <span className="absolute bottom-0 right-0 p-1 leading-none">
                                    {padChannel(ch)}
                                </span>
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
                            return (
                                <button
                                    key={`${fx.id}-${seg.row}-${seg.colStart}-${seg.span}`}
                                    type="button"
                                    draggable={!dropBusy}
                                    className={cn(
                                        "relative z-10 overflow-hidden rounded-md border p-0 text-left shadow-sm transition-colors",
                                        "cursor-grab active:cursor-grabbing",
                                        slaveFixture
                                            ? "border-muted-foreground/40 bg-muted/80 text-muted-foreground hover:bg-muted"
                                            : liveConnected
                                                ? "border-emerald-600 bg-emerald-500/50 text-emerald-950 hover:bg-emerald-500/60 dark:text-emerald-50"
                                                : "border-red-600 bg-red-500/50 text-red-950 hover:bg-red-500/60 dark:text-red-50",
                                        conflict && "ring-1 ring-destructive/50",
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
                                    <div
                                        className="absolute inset-0 grid h-full w-full"
                                        style={{gridTemplateColumns: `repeat(${seg.span}, minmax(0, 1fr))`}}
                                        aria-hidden
                                    >
                                        {Array.from({length: seg.span}, (_, i) => {
                                            const ch = segStartCh + i;
                                            return (
                                                <div
                                                    key={ch}
                                                    className={cn(
                                                        "relative flex items-center justify-center text-[10px] font-medium tabular-nums sm:text-xs",
                                                        showFixtureBase && "pt-3",
                                                    )}
                                                >
                                                    <span className="leading-none">{channelValue(frame, ch)}</span>
                                                    <span className="absolute bottom-0 right-0 p-1 text-[9px] leading-none opacity-80 sm:text-[10px]">
                                                        {padChannel(ch)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {showFixtureBase ? (
                                        <span className="pointer-events-none absolute inset-x-1 top-0.5 z-10 flex min-w-0 items-center gap-1">
                                            <span className="truncate text-[10px] font-semibold leading-tight sm:text-xs">
                                                <span className="tabular-nums">{padChannel(fx.dmxAddress)}</span>
                                                {" "}
                                                {fx.name}
                                            </span>
                                            {conflict ? (
                                                <PiWarningCircle
                                                    className="size-3 shrink-0 text-destructive"
                                                    aria-hidden
                                                />
                                            ) : null}
                                        </span>
                                    ) : conflict ? (
                                        <span className="pointer-events-none absolute left-0.5 top-0.5 z-10 inline-flex items-center">
                                            <PiWarningCircle className="size-3 shrink-0 text-destructive" aria-hidden/>
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
