import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {Card} from "@/components/ui/card";
import {cn} from "@/lib/utils";
import {
    clampTileCol,
    clampTileHeightPx,
    LIVE_LAYOUT_COLUMNS,
    LIVE_LAYOUT_GAP_PX,
    LIVE_LAYOUT_MIN_HEIGHT_PX,
    LIVE_LAYOUT_SUBDIVISIONS,
    liveLayoutColumnsForWidth,
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

function colWidthPercent(w: number, columns: number): string {
    const pct = (w / columns) * 100;
    const gapShare =
        w < columns
            ? ` - ${((columns - w) / columns) * LIVE_LAYOUT_GAP_PX}px`
            : "";
    return `calc(${pct}%${gapShare})`;
}

function leftPercent(col: number, columns: number): string {
    const pct = (col / columns) * 100;
    const gapOffset = col > 0 ? ` + ${col * LIVE_LAYOUT_GAP_PX}px` : "";
    return `calc(${pct}%${gapOffset})`;
}

export function DMXFixtureLiveLayoutGrid({
    editMode,
    tiles,
    onTilesChange,
    renderSlot,
}: DMXFixtureLiveLayoutGridProps) {
    const {t} = useTranslation("dmx");
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [preview, setPreview] = useState<LiveLayoutTile[] | null>(null);
    const [columns, setColumns] = useState(LIVE_LAYOUT_COLUMNS);
    const dragRef = useRef<DragCtx | null>(null);

    const source = preview ?? tiles;
    const placed = useMemo(() => packMasonryTiles(source, columns), [source, columns]);
    const totalHeight = useMemo(() => masonryContainerHeight(placed), [placed]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }
        const updateColumns = (width: number) => {
            const next = liveLayoutColumnsForWidth(width);
            setColumns((prev) => (prev === next ? prev : next));
        };
        updateColumns(container.getBoundingClientRect().width);
        const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width;
            if (typeof width === "number") {
                updateColumns(width);
            }
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

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
            const next = pending.map((tile) => (tile.id === id ? {...tile, ...patch} : tile));
            return packMasonryTiles(next, columns).map(({id: tid, col, w, y, heightPx}) => ({
                id: tid,
                col,
                w,
                y,
                heightPx,
            }));
        },
        [columns],
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
                    const drop = snapMasonryDrop(e.clientX, e.clientY, rect, d.start.w, columns);
                    const next = updateTile(d.pending, d.id, {col: drop.col, y: drop.y});
                    dragRef.current = {...d, pending: next};
                    setPreview(next);
                    return;
                }

                if (d.mode === "resizeW") {
                    const colUnit = rect.width / columns;
                    const deltaCols = Math.round((e.clientX - d.startX) / colUnit);
                    let w: LiveTileWidth = d.start.w + deltaCols;
                    if (w < 1) {
                        w = 1;
                    }
                    if (w > columns) {
                        w = columns;
                    }
                    const col = clampTileCol(d.start.col, w, columns);
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
        [columns, endDrag, onTilesChange, updateTile],
    );

    const startDrag = (id: string, mode: DragMode, e: React.PointerEvent) => {
        if (!editMode) {
            return;
        }
        const tile = tiles.find((x) => x.id === id);
        if (!tile) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const pending = packMasonryTiles(tiles, columns).map(({id: tid, col, w, y, heightPx}) => ({
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
            start: {...tile},
            pending,
        };
        setPreview(pending);
        attachWindowListeners(dragRef.current);
    };

    return (
        <div
            className={cn(
                "relative w-full min-w-0",
                editMode && "rounded-xl border-2 border-dashed border-primary/35 bg-muted/15 p-2",
            )}
        >
            {editMode && (
                <p className="mb-2 text-xs text-muted-foreground">
                    {t("liveControls.layoutHint", {columns})}
                </p>
            )}
            <div
                ref={containerRef}
                className="relative w-full"
                style={{minHeight: totalHeight}}
            >
                {editMode &&
                    Array.from({length: columns}, (_, col) => col)
                        .filter((col) => col % LIVE_LAYOUT_SUBDIVISIONS === 0)
                        .map((col) => (
                            <div
                                key={col}
                                className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-primary/20 first:border-l-0"
                                style={{
                                    left: leftPercent(col, columns),
                                    width: colWidthPercent(1, columns),
                                }}
                                aria-hidden
                            />
                        ))}
                {placed.map((tile) => (
                    <Card
                        key={tile.id}
                        className={cn(
                            "absolute flex min-w-0 flex-col overflow-hidden shadow-sm transition-shadow",
                            editMode && "ring-1 ring-border",
                            editMode && "cursor-grab active:cursor-grabbing",
                        )}
                        style={{
                            left: leftPercent(tile.col, columns),
                            width: colWidthPercent(tile.w, columns),
                            top: tile.y,
                            height: tile.heightPx,
                            minHeight: LIVE_LAYOUT_MIN_HEIGHT_PX,
                        }}
                        onPointerDown={(e) => startDrag(tile.id, "move", e)}
                    >
                        <div
                            className={cn(
                                "flex min-h-0 flex-1 flex-col overflow-y-auto p-2",
                            )}
                        >
                            {renderSlot(tile.id)}
                        </div>
                        {editMode && (
                            <>
                                <button
                                    type="button"
                                    className="absolute bottom-0 left-0 right-0 flex h-2 cursor-ns-resize touch-none items-center justify-center bg-primary/10 hover:bg-primary/25"
                                    aria-label={t("liveControls.resizeHeight", {id: tile.id})}
                                    onPointerDown={(e) => startDrag(tile.id, "resizeH", e)}
                                />
                                <button
                                    type="button"
                                    className="absolute top-0 bottom-2 right-0 flex w-2 cursor-ew-resize touch-none items-center justify-center bg-primary/10 hover:bg-primary/25"
                                    aria-label={t("liveControls.resizeWidth", {id: tile.id})}
                                    onPointerDown={(e) => startDrag(tile.id, "resizeW", e)}
                                />
                            </>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
}
