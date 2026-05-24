import {useCallback, useEffect, useRef, useState} from "react";
import {GripHorizontal} from "lucide-react";
import {Card} from "@/components/ui/card";
import {cn} from "@/lib/utils";
import {
    LIVE_LAYOUT_GRID_COLS,
    LIVE_LAYOUT_GRID_ROWS,
    type LiveLayoutTile,
    resolveTileOverlaps,
    snapPixelToCell,
} from "@/lib/dmxFixtureLiveLayout";

export type DMXFixtureLiveLayoutGridProps = {
    editMode: boolean;
    tiles: LiveLayoutTile[];
    onTilesChange: (next: LiveLayoutTile[]) => void;
    renderSlot: (id: string) => React.ReactNode;
};

type DragMode = "move" | "resize";

type DragCtx = {
    mode: DragMode;
    id: string;
    startX: number;
    startY: number;
    start: LiveLayoutTile;
    /** latest resolved tiles while dragging */
    pending: LiveLayoutTile[];
};

export function DMXFixtureLiveLayoutGrid({
    editMode,
    tiles,
    onTilesChange,
    renderSlot,
}: DMXFixtureLiveLayoutGridProps) {
    const gridRef = useRef<HTMLDivElement | null>(null);
    const [preview, setPreview] = useState<LiveLayoutTile[] | null>(null);
    const dragRef = useRef<DragCtx | null>(null);

    const shown = preview ?? tiles;

    const endDrag = useCallback(() => {
        dragRef.current = null;
        setPreview(null);
    }, []);

    useEffect(() => {
        if (!editMode) {
            endDrag();
        }
    }, [editMode, endDrag]);

    const attachWindowListeners = useCallback(
        (ctx: DragCtx) => {
            const onMove = (e: PointerEvent) => {
                const d = dragRef.current;
                const grid = gridRef.current;
                if (!d || !grid) {
                    return;
                }
                const rect = grid.getBoundingClientRect();
                const cur = snapPixelToCell(e.clientX, e.clientY, rect);
                const startCell = snapPixelToCell(d.startX, d.startY, rect);

                if (d.mode === "move") {
                    const dCol = cur.col - startCell.col;
                    const dRow = cur.row - startCell.row;
                    let nextCol = d.start.col + dCol;
                    let nextRow = d.start.row + dRow;
                    nextCol = Math.max(0, Math.min(LIVE_LAYOUT_GRID_COLS - d.start.w, nextCol));
                    nextRow = Math.max(0, Math.min(LIVE_LAYOUT_GRID_ROWS - 1, nextRow));
                    const next = d.pending.map((t) => (t.id === d.id ? {...t, col: nextCol, row: nextRow} : t));
                    const resolved = resolveTileOverlaps(next);
                    dragRef.current = {...d, pending: resolved};
                    setPreview(resolved);
                    return;
                }

                const cellW = rect.width / LIVE_LAYOUT_GRID_COLS;
                const dx = e.clientX - d.startX;
                const deltaCells = Math.round(dx / cellW);
                let w = (d.start.w + deltaCells) as LiveLayoutTile["w"];
                if (w < 1) {
                    w = 1;
                }
                if (w > 3) {
                    w = 3;
                }
                while (w > 1 && d.start.col + w > LIVE_LAYOUT_GRID_COLS) {
                    w = (w - 1) as LiveLayoutTile["w"];
                }
                const next = d.pending.map((t) => (t.id === d.id ? {...t, w} : t));
                const resolved = resolveTileOverlaps(next);
                dragRef.current = {...d, pending: resolved};
                setPreview(resolved);
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
        [endDrag, onTilesChange],
    );

    const startMove = (id: string, e: React.PointerEvent) => {
        if (!editMode) {
            return;
        }
        const t = tiles.find((x) => x.id === id);
        if (!t) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const base = resolveTileOverlaps(tiles);
        const pending = base.map((x) => ({...x}));
        dragRef.current = {
            mode: "move",
            id,
            startX: e.clientX,
            startY: e.clientY,
            start: {...t},
            pending,
        };
        setPreview(pending);
        attachWindowListeners(dragRef.current);
    };

    const startResize = (id: string, e: React.PointerEvent) => {
        if (!editMode) {
            return;
        }
        const t = tiles.find((x) => x.id === id);
        if (!t) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const base = resolveTileOverlaps(tiles);
        const pending = base.map((x) => ({...x}));
        dragRef.current = {
            mode: "resize",
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
                    Drag the top grip to move a card. Drag the corner grip to change width (1–3 columns). Overlapping
                    cards are pushed to the next free cells.
                </p>
            )}
            <div
                ref={gridRef}
                className="grid w-full gap-2 [aspect-ratio:3/4]"
                style={{
                    gridTemplateColumns: `repeat(${LIVE_LAYOUT_GRID_COLS}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${LIVE_LAYOUT_GRID_ROWS}, minmax(0, 1fr))`,
                }}
            >
                {shown.map((t) => (
                    <Card
                        key={t.id}
                        className={cn(
                            "relative flex min-h-0 min-w-0 flex-col overflow-hidden shadow-sm",
                            editMode && "ring-1 ring-border",
                        )}
                        style={{
                            gridColumn: `${t.col + 1} / span ${t.w}`,
                            gridRow: `${t.row + 1} / span 1`,
                        }}
                    >
                        {editMode && (
                            <button
                                type="button"
                                className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center border-b border-border bg-muted/40 text-muted-foreground hover:bg-muted/70 active:cursor-grabbing"
                                aria-label={`Move ${t.id}`}
                                onPointerDown={(e) => startMove(t.id, e)}
                            >
                                <GripHorizontal className="size-4" aria-hidden/>
                            </button>
                        )}
                        <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto p-2", editMode && "pt-1")}>
                            {renderSlot(t.id)}
                        </div>
                        {editMode && (
                            <button
                                type="button"
                                className="absolute bottom-1 right-1 flex size-6 cursor-se-resize touch-none items-center justify-center rounded border border-border bg-background/90 text-muted-foreground shadow-sm hover:bg-muted"
                                aria-label={`Resize ${t.id}`}
                                onPointerDown={(e) => startResize(t.id, e)}
                            >
                                <span className="text-[10px] font-bold leading-none" aria-hidden>
                                    ⤡
                                </span>
                            </button>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
}
