import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {GripHorizontal} from "lucide-react";
import {Card} from "@/components/ui/card";
import {cn} from "@/lib/utils";
import {
    clampTileCol,
    clampTileHeightPx,
    LIVE_LAYOUT_COLUMNS,
    LIVE_LAYOUT_GAP_PX,
    LIVE_LAYOUT_MIN_HEIGHT_PX,
    masonryContainerHeight,
    packMasonryTiles,
    snapMasonryDrop,
    type LiveLayoutTile,
    type LiveTileWidth,
} from "@/lib/dmxFixtureLiveLayout";

export type DMXFixtureLiveLayoutGridProps = {
    editMode: boolean;
    tiles: LiveLayoutTile[];
    onTilesChange: (next: LiveLayoutTile[]) => void;
    renderSlot: (id: string) => React.ReactNode;
};

type DragMode = "move" | "resizeW" | "resizeH";

type DragCtx = {
    mode: DragMode;
    id: string;
    startX: number;
    startY: number;
    start: LiveLayoutTile;
    pending: LiveLayoutTile[];
};

function colWidthPercent(w: number): string {
    const pct = (w / LIVE_LAYOUT_COLUMNS) * 100;
    const gapShare =
        w < LIVE_LAYOUT_COLUMNS
            ? ` - ${((LIVE_LAYOUT_COLUMNS - w) / LIVE_LAYOUT_COLUMNS) * LIVE_LAYOUT_GAP_PX}px`
            : "";
    return `calc(${pct}%${gapShare})`;
}

function leftPercent(col: number): string {
    const pct = (col / LIVE_LAYOUT_COLUMNS) * 100;
    const gapOffset = col > 0 ? ` + ${col * LIVE_LAYOUT_GAP_PX}px` : "";
    return `calc(${pct}%${gapOffset})`;
}

export function DMXFixtureLiveLayoutGrid({
    editMode,
    tiles,
    onTilesChange,
    renderSlot,
}: DMXFixtureLiveLayoutGridProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [preview, setPreview] = useState<LiveLayoutTile[] | null>(null);
    const dragRef = useRef<DragCtx | null>(null);

    const source = preview ?? tiles;
    const placed = useMemo(() => packMasonryTiles(source), [source]);
    const totalHeight = useMemo(() => masonryContainerHeight(placed), [placed]);

    const endDrag = useCallback(() => {
        dragRef.current = null;
        setPreview(null);
    }, []);

    useEffect(() => {
        if (!editMode) {
            endDrag();
        }
    }, [editMode, endDrag]);

    const updateTile = useCallback(
        (pending: LiveLayoutTile[], id: string, patch: Partial<LiveLayoutTile>) => {
            const next = pending.map((t) => (t.id === id ? {...t, ...patch} : t));
            return packMasonryTiles(next).map(({id: tid, col, w, y, heightPx}) => ({
                id: tid,
                col,
                w,
                y,
                heightPx,
            }));
        },
        [],
    );

    const attachWindowListeners = useCallback(
        (ctx: DragCtx) => {
            const onMove = (e: PointerEvent) => {
                const d = dragRef.current;
                const container = containerRef.current;
                if (!d || !container) {
                    return;
                }
                const rect = container.getBoundingClientRect();

                if (d.mode === "move") {
                    const drop = snapMasonryDrop(e.clientX, e.clientY, rect, d.start.w);
                    const next = updateTile(d.pending, d.id, {col: drop.col, y: drop.y});
                    dragRef.current = {...d, pending: next};
                    setPreview(next);
                    return;
                }

                if (d.mode === "resizeW") {
                    const colUnit = rect.width / LIVE_LAYOUT_COLUMNS;
                    const deltaCols = Math.round((e.clientX - d.startX) / colUnit);
                    let w = (d.start.w + deltaCols) as LiveTileWidth;
                    if (w < 1) {
                        w = 1;
                    }
                    if (w > 3) {
                        w = 3;
                    }
                    const col = clampTileCol(d.start.col, w);
                    const next = updateTile(d.pending, d.id, {w, col});
                    dragRef.current = {...d, pending: next};
                    setPreview(next);
                    return;
                }

                const dy = e.clientY - d.startY;
                const heightPx = clampTileHeightPx(d.start.heightPx + dy);
                const next = updateTile(d.pending, d.id, {heightPx});
                dragRef.current = {...d, pending: next};
                setPreview(next);
            };

            const onUp = () => {
                const d = dragRef.current;
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("pointercancel", onUp);
                if (d) {
                    onTilesChange(d.pending);
                }
                endDrag();
            };

            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            window.addEventListener("pointercancel", onUp);
        },
        [endDrag, onTilesChange, updateTile],
    );

    const startDrag = (id: string, mode: DragMode, e: React.PointerEvent) => {
        if (!editMode) {
            return;
        }
        const t = tiles.find((x) => x.id === id);
        if (!t) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const pending = packMasonryTiles(tiles).map(({id: tid, col, w, y, heightPx}) => ({
            id: tid,
            col,
            w,
            y,
            heightPx,
        }));
        dragRef.current = {
            mode,
            id,
            startX: e.clientX,
            startY: e.clientY,
            start: {...t},
            pending,
        };
        setPreview(pending);
        attachWindowListeners(dragRef.current);
    };

    return (
        <div
            className={cn(
                "relative w-full max-w-5xl",
                editMode && "rounded-xl border-2 border-dashed border-primary/35 bg-muted/15 p-2",
            )}
        >
            {editMode && (
                <p className="mb-2 text-xs text-muted-foreground">
                    Masonry layout (3 columns): drag the top grip to move; drag bottom-right for width, bottom edge
                    for height (pixels).
                </p>
            )}
            <div
                ref={containerRef}
                className="relative w-full"
                style={{minHeight: totalHeight}}
            >
                {editMode &&
                    Array.from({length: LIVE_LAYOUT_COLUMNS}, (_, col) => (
                        <div
                            key={col}
                            className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-primary/20 first:border-l-0"
                            style={{
                                left: leftPercent(col),
                                width: colWidthPercent(1),
                            }}
                            aria-hidden
                        />
                    ))}
                {placed.map((t) => (
                    <Card
                        key={t.id}
                        className={cn(
                            "absolute flex min-w-0 flex-col overflow-hidden shadow-sm transition-shadow",
                            editMode && "ring-1 ring-border",
                        )}
                        style={{
                            left: leftPercent(t.col),
                            width: colWidthPercent(t.w),
                            top: t.y,
                            height: t.heightPx,
                            minHeight: LIVE_LAYOUT_MIN_HEIGHT_PX,
                        }}
                    >
                        {editMode && (
                            <button
                                type="button"
                                className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center border-b border-border bg-muted/40 text-muted-foreground hover:bg-muted/70 active:cursor-grabbing"
                                aria-label={`Move ${t.id}`}
                                onPointerDown={(e) => startDrag(t.id, "move", e)}
                            >
                                <GripHorizontal className="size-4" aria-hidden/>
                            </button>
                        )}
                        <div
                            className={cn(
                                "flex min-h-0 flex-1 flex-col overflow-y-auto p-2",
                                editMode && "pt-1",
                            )}
                        >
                            {renderSlot(t.id)}
                        </div>
                        {editMode && (
                            <>
                                <button
                                    type="button"
                                    className="absolute bottom-0 left-0 right-0 flex h-2 cursor-ns-resize touch-none items-center justify-center bg-primary/10 hover:bg-primary/25"
                                    aria-label={`Resize height ${t.id}`}
                                    onPointerDown={(e) => startDrag(t.id, "resizeH", e)}
                                />
                                <button
                                    type="button"
                                    className="absolute top-7 bottom-2 right-0 flex w-2 cursor-ew-resize touch-none items-center justify-center bg-primary/10 hover:bg-primary/25"
                                    aria-label={`Resize width ${t.id}`}
                                    onPointerDown={(e) => startDrag(t.id, "resizeW", e)}
                                />
                            </>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
}
