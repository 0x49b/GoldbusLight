/** Live tab control tiles: grid is 3 columns × 4 rows (1-indexed in CSS; we use 0-based here). */

export const LIVE_LAYOUT_GRID_COLS = 3;
export const LIVE_LAYOUT_GRID_ROWS = 4;

export type LiveTileWidth = 1 | 2 | 3;

export type LiveLayoutTile = {
    id: string;
    /** 0..2 */
    col: number;
    /** 0..3 */
    row: number;
    w: LiveTileWidth;
};

export type LiveLayoutDocument = {
    version: 1;
    tiles: LiveLayoutTile[];
};

export const LIVE_LAYOUT_DOC_VERSION = 1 as const;

export function tileCells(t: LiveLayoutTile): Array<{ row: number; col: number }> {
    const out: Array<{ row: number; col: number }> = [];
    for (let c = 0; c < t.w; c++) {
        out.push({ row: t.row, col: t.col + c });
    }
    return out;
}

export function tilesOverlap(a: LiveLayoutTile, b: LiveLayoutTile): boolean {
    const setA = new Set(tileCells(a).map((x) => `${x.row},${x.col}`));
    for (const x of tileCells(b)) {
        if (setA.has(`${x.row},${x.col}`)) {
            return true;
        }
    }
    return false;
}

export function isTileInBounds(t: LiveLayoutTile): boolean {
    if (t.row < 0 || t.row >= LIVE_LAYOUT_GRID_ROWS || t.col < 0 || t.col >= LIVE_LAYOUT_GRID_COLS) {
        return false;
    }
    if (t.col + t.w > LIVE_LAYOUT_GRID_COLS) {
        return false;
    }
    return true;
}

/** Canonical ordering for default placement and conflict resolution priority (earlier = more fixed). */
export function sortTileIdsForPack(ids: string[]): string[] {
    const rank = (id: string): number => {
        if (id === "preview") {
            return 0;
        }
        if (id === "smoke") {
            return 1;
        }
        if (id === "movement") {
            return 2;
        }
        if (id === "colorGobo") {
            return 3;
        }
        if (id === "beam") {
            return 4;
        }
        if (id === "custom-all") {
            return 5;
        }
        if (id.startsWith("custom-")) {
            return 10 + parseInt(id.slice("custom-".length), 10) || 0;
        }
        return 50;
    };
    return [...new Set(ids)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function defaultWidthForId(id: string): LiveTileWidth {
    if (id === "preview") {
        return 3;
    }
    if (id === "movement" || id === "beam" || id === "colorGobo" || id === "smoke" || id === "custom-all") {
        return 2;
    }
    return 1;
}

/** Greedy first-fit default layout (no overlaps). */
export function defaultLiveLayoutForIds(activeIds: string[]): LiveLayoutTile[] {
    const ids = sortTileIdsForPack(activeIds);
    const placed: LiveLayoutTile[] = [];

    const occupied = (): Set<string> => {
        const s = new Set<string>();
        for (const p of placed) {
            for (const cell of tileCells(p)) {
                s.add(`${cell.row},${cell.col}`);
            }
        }
        return s;
    };

    const fitsAt = (row: number, col: number, w: LiveTileWidth, occ: Set<string>): boolean => {
        if (col + w > LIVE_LAYOUT_GRID_COLS || row >= LIVE_LAYOUT_GRID_ROWS) {
            return false;
        }
        for (let dc = 0; dc < w; dc++) {
            if (occ.has(`${row},${col + dc}`)) {
                return false;
            }
        }
        return true;
    };

    for (const id of ids) {
        let w = defaultWidthForId(id);
        let placedOne = false;
        while (w >= 1) {
            const occ = occupied();
            let found: { row: number; col: number } | null = null;
            for (let row = 0; row < LIVE_LAYOUT_GRID_ROWS && !found; row++) {
                for (let col = 0; col < LIVE_LAYOUT_GRID_COLS && !found; col++) {
                    if (fitsAt(row, col, w as LiveTileWidth, occ)) {
                        found = { row, col };
                    }
                }
            }
            if (found) {
                placed.push({ id, row: found.row, col: found.col, w: w as LiveTileWidth });
                placedOne = true;
                break;
            }
            w = (w - 1) as LiveTileWidth;
        }
        if (!placedOne) {
            // Last resort: 1×1 top-left free
            const occ = occupied();
            outer: for (let row = 0; row < LIVE_LAYOUT_GRID_ROWS; row++) {
                for (let col = 0; col < LIVE_LAYOUT_GRID_COLS; col++) {
                    if (fitsAt(row, col, 1, occ)) {
                        placed.push({ id, row, col, w: 1 });
                        break outer;
                    }
                }
            }
        }
    }
    return placed;
}

function parseTile(raw: unknown): LiveLayoutTile | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (!id) {
        return null;
    }
    const col = Number(o.col);
    const row = Number(o.row);
    const w = Number(o.w);
    if (!Number.isInteger(col) || !Number.isInteger(row) || (w !== 1 && w !== 2 && w !== 3)) {
        return null;
    }
    const t: LiveLayoutTile = { id, col, row, w: w as LiveTileWidth };
    return isTileInBounds(t) ? t : null;
}

export function parseLiveLayoutDocument(raw: string): LiveLayoutDocument | null {
    try {
        const j = JSON.parse(raw) as unknown;
        if (!j || typeof j !== "object") {
            return null;
        }
        const tilesRaw = (j as { tiles?: unknown }).tiles;
        if (!Array.isArray(tilesRaw)) {
            return null;
        }
        const tiles: LiveLayoutTile[] = [];
        for (const x of tilesRaw) {
            const t = parseTile(x);
            if (t) {
                tiles.push(t);
            }
        }
        return { version: 1, tiles };
    } catch {
        return null;
    }
}

export function serializeLiveLayoutDocument(doc: LiveLayoutDocument): string {
    return JSON.stringify({ version: 1, tiles: doc.tiles });
}

/** Merge saved positions with current active ids; drop unknown ids; add missing with defaults; resolve overlaps. */
export function mergeLiveLayoutWithActiveIds(saved: LiveLayoutDocument | null, activeIds: string[]): LiveLayoutTile[] {
    const ids = sortTileIdsForPack(activeIds);
    const defaults = defaultLiveLayoutForIds(ids);
    const byId = new Map(defaults.map((t) => [t.id, t]));
    if (saved) {
        for (const t of saved.tiles) {
            if (!ids.includes(t.id) || !isTileInBounds(t)) {
                continue;
            }
            byId.set(t.id, { ...t });
        }
    }
    let tiles = ids.map((id) => byId.get(id)).filter((t): t is LiveLayoutTile => Boolean(t));
    tiles = resolveTileOverlaps(tiles);
    return tiles;
}

/**
 * Push overlapping tiles (later in sortTileIdsForPack order move first) until no overlap.
 */
export function resolveTileOverlaps(tiles: LiveLayoutTile[]): LiveLayoutTile[] {
    const order = sortTileIdsForPack(tiles.map((t) => t.id));
    const priority = (id: string) => order.indexOf(id);

    let next = tiles.map((t) => ({ ...t }));
    for (let iter = 0; iter < 64; iter++) {
        let changed = false;
        outer: for (let i = 0; i < next.length; i++) {
            for (let j = 0; j < next.length; j++) {
                if (i === j) {
                    continue;
                }
                if (!tilesOverlap(next[i], next[j])) {
                    continue;
                }
                const moveIdx = priority(next[i].id) > priority(next[j].id) ? i : j;
                const victim = next[moveIdx];
                const others = next.filter((_, k) => k !== moveIdx);
                const bumped = bumpTileAway(victim, others);
                if (bumped.row !== victim.row || bumped.col !== victim.col || bumped.w !== victim.w) {
                    next[moveIdx] = bumped;
                    changed = true;
                    break outer;
                }
            }
        }
        if (!changed) {
            break;
        }
    }
    return next;
}

function bumpTileAway(tile: LiveLayoutTile, others: LiveLayoutTile[]): LiveLayoutTile {
    const occ = (): Set<string> => {
        const s = new Set<string>();
        for (const p of others) {
            for (const c of tileCells(p)) {
                s.add(`${c.row},${c.col}`);
            }
        }
        return s;
    };

    const fits = (cand: LiveLayoutTile): boolean => {
        if (!isTileInBounds(cand)) {
            return false;
        }
        const o = occ();
        for (const cell of tileCells(cand)) {
            if (o.has(`${cell.row},${cell.col}`)) {
                return false;
            }
        }
        return true;
    };

    for (let row = 0; row < LIVE_LAYOUT_GRID_ROWS; row++) {
        for (let col = 0; col < LIVE_LAYOUT_GRID_COLS; col++) {
            for (const w of [tile.w, 2, 1] as LiveTileWidth[]) {
                const cand = { ...tile, row, col, w };
                if (fits(cand)) {
                    return cand;
                }
            }
        }
    }
    return { ...tile, w: 1, col: 0, row: 0 };
}

export function snapPixelToCell(
    clientX: number,
    clientY: number,
    gridRect: DOMRect,
): { col: number; row: number } {
    const relX = clientX - gridRect.left;
    const relY = clientY - gridRect.top;
    const cw = gridRect.width / LIVE_LAYOUT_GRID_COLS;
    const rh = gridRect.height / LIVE_LAYOUT_GRID_ROWS;
    const col = Math.max(0, Math.min(LIVE_LAYOUT_GRID_COLS - 1, Math.floor(relX / cw)));
    const row = Math.max(0, Math.min(LIVE_LAYOUT_GRID_ROWS - 1, Math.floor(relY / rh)));
    return { col, row };
}
