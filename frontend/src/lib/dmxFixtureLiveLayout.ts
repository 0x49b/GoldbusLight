/**
 * Live tab: masonry layout on a fine column grid.
 *
 * The grid is subdivided into {@link LIVE_LAYOUT_SUBDIVISIONS} fine units per "coarse" column
 * (3 coarse columns by default, up to 4 when the container is wide enough). A standard control
 * occupies one coarse column ({@link LIVE_LAYOUT_DEFAULT_WIDTH} fine units), but tiles can be
 * resized down to a single fine unit — so e.g. three narrow vertical faders fit side by side in
 * the width that previously held one control.
 */

import type {DMXFixture} from "../types/controller";
import {channelLiveTileId, readLiveSliderOrientation, resolveLiveWidget} from "./dmxLiveWidget";

/** Fine units per coarse column. A standard tile is this many units wide. */
export const LIVE_LAYOUT_SUBDIVISIONS = 3;
/** Coarse (visual) column counts, before subdivision. */
export const LIVE_LAYOUT_MIN_COARSE_COLUMNS = 3;
export const LIVE_LAYOUT_MAX_COARSE_COLUMNS = 4;
/** Minimum fine column count (also used as fallback when width is unknown). */
export const LIVE_LAYOUT_COLUMNS = LIVE_LAYOUT_MIN_COARSE_COLUMNS * LIVE_LAYOUT_SUBDIVISIONS;
export const LIVE_LAYOUT_MIN_COLUMNS = LIVE_LAYOUT_COLUMNS;
export const LIVE_LAYOUT_MAX_COLUMNS = LIVE_LAYOUT_MAX_COARSE_COLUMNS * LIVE_LAYOUT_SUBDIVISIONS;
/** Default tile width in fine units (one coarse column). */
export const LIVE_LAYOUT_DEFAULT_WIDTH = LIVE_LAYOUT_SUBDIVISIONS;
/** Target minimum width per coarse column before adding another column. */
export const LIVE_LAYOUT_MIN_COLUMN_WIDTH_PX = 260;

/** Responsive fine column count from container width (coarse 3–4, times subdivisions). */
export function liveLayoutColumnsForWidth(widthPx: number): number {
    if (!Number.isFinite(widthPx) || widthPx <= 0) {
        return LIVE_LAYOUT_MIN_COLUMNS;
    }
    const fromWidth = Math.floor(widthPx / LIVE_LAYOUT_MIN_COLUMN_WIDTH_PX);
    const coarse = Math.min(
        LIVE_LAYOUT_MAX_COARSE_COLUMNS,
        Math.max(LIVE_LAYOUT_MIN_COARSE_COLUMNS, fromWidth),
    );
    return coarse * LIVE_LAYOUT_SUBDIVISIONS;
}
export const LIVE_LAYOUT_GAP_PX = 8;
export const LIVE_LAYOUT_MIN_HEIGHT_PX = 72;
export const LIVE_LAYOUT_MAX_HEIGHT_PX = 720;
export const LIVE_LAYOUT_DEFAULT_HEIGHT_PX = 160;
/** Legacy v2: one row unit in pixels when migrating */
export const LIVE_LAYOUT_LEGACY_ROW_PX = 48;

/** Tile width in fine grid units (>= 1, up to the active column count). */
export type LiveTileWidth = number;

export type LiveLayoutTile = {
    id: string;
    /** Start column index (0 .. columnCount - 1) */
    col: number;
    w: LiveTileWidth;
    /** Top offset in px from masonry container origin */
    y: number;
    /** Tile height in px */
    heightPx: number;
};

export type LiveLayoutDocument = {
    version: 2 | 3 | 4;
    tiles: LiveLayoutTile[];
};

export const LIVE_LAYOUT_DOC_VERSION = 4 as const;

export type MasonryPlacedTile = LiveLayoutTile & {
    bottom: number;
};

const LEGACY_GROUP_CHANNELS: Record<string, string[]> = {
    movement: ["pan", "tilt", "dimmer", "movementSpeed", "infinitePan", "infiniteTilt"],
    colorGobo: ["colorWheel", "goboWheel"],
    beam: ["shutterStrobe", "focus", "zoom", "iris", "frost"],
    smoke: ["fog"],
};

export function clampTileHeightPx(h: number): number {
    return Math.round(Math.max(LIVE_LAYOUT_MIN_HEIGHT_PX, Math.min(LIVE_LAYOUT_MAX_HEIGHT_PX, h)));
}

export function clampTileCol(col: number, w: LiveTileWidth, columns = LIVE_LAYOUT_COLUMNS): number {
    const safeColumns = Math.max(LIVE_LAYOUT_COLUMNS, Math.round(columns) || LIVE_LAYOUT_COLUMNS);
    const maxCol = Math.max(0, safeColumns - w);
    return Math.max(0, Math.min(maxCol, Math.round(col)));
}

function normalizeTile(t: LiveLayoutTile, columns = LIVE_LAYOUT_COLUMNS): LiveLayoutTile {
    const safeColumns = Math.max(LIVE_LAYOUT_COLUMNS, Math.round(columns) || LIVE_LAYOUT_COLUMNS);
    const w = Math.max(1, Math.min(safeColumns, Math.round(t.w) || 1));
    const maxCol = Math.max(0, safeColumns - w);
    const roundedCol = Math.round(t.col);
    const wrappedCol = roundedCol > maxCol
        ? ((roundedCol % safeColumns) + safeColumns) % safeColumns
        : roundedCol;
    return {
        id: t.id,
        col: clampTileCol(wrappedCol, w, safeColumns),
        w,
        y: Math.max(0, Math.round(t.y)),
        heightPx: clampTileHeightPx(t.heightPx),
    };
}

function tileColEnd(t: LiveLayoutTile): number {
    return t.col + t.w;
}

export function tilesOverlapHorizontally(a: LiveLayoutTile, b: LiveLayoutTile): boolean {
    return a.col < tileColEnd(b) && b.col < tileColEnd(a);
}

/** Pack tiles into masonry positions (respects saved y when non-overlapping). */
export function packMasonryTiles(tiles: LiveLayoutTile[], columns = LIVE_LAYOUT_COLUMNS): MasonryPlacedTile[] {
    const safeColumns = Math.max(LIVE_LAYOUT_COLUMNS, Math.round(columns) || LIVE_LAYOUT_COLUMNS);
    const sorted = [...tiles].map((t) => normalizeTile(t, safeColumns));
    sorted.sort((a, b) => a.y - b.y || a.col - b.col || a.id.localeCompare(b.id));

    const placed: MasonryPlacedTile[] = [];

    const bottomAtCol = (): number[] => {
        const bottoms = Array.from({length: safeColumns}, () => 0);
        for (const p of placed) {
            const endCol = tileColEnd(p);
            const bottom = p.y + p.heightPx + LIVE_LAYOUT_GAP_PX;
            for (let c = p.col; c < endCol && c < safeColumns; c++) {
                bottoms[c] = Math.max(bottoms[c], bottom);
            }
        }
        return bottoms;
    };

    const minYForTile = (t: LiveLayoutTile): number => {
        const bottoms = bottomAtCol();
        let minY = 0;
        for (let c = t.col; c < tileColEnd(t); c++) {
            minY = Math.max(minY, bottoms[c] ?? 0);
        }
        return minY;
    };

    const collides = (t: LiveLayoutTile): boolean => {
        for (const p of placed) {
            if (!tilesOverlapHorizontally(t, p)) {
                continue;
            }
            const aTop = t.y;
            const aBot = t.y + t.heightPx;
            const bTop = p.y;
            const bBot = p.y + p.heightPx;
            if (aTop < bBot + LIVE_LAYOUT_GAP_PX && aBot + LIVE_LAYOUT_GAP_PX > bTop) {
                return true;
            }
        }
        return false;
    };

    for (const t of sorted) {
        let y = Math.max(0, t.y);
        const minY = minYForTile(t);
        if (y < minY || collides({...t, y})) {
            y = minY;
        }
        let candidate = {...t, y};
        let guard = 0;
        while (collides(candidate) && guard < 64) {
            y += LIVE_LAYOUT_GAP_PX;
            candidate = {...t, y};
            guard++;
        }
        placed.push({...candidate, bottom: candidate.y + candidate.heightPx});
    }

    return placed;
}

export function masonryContainerHeight(placed: MasonryPlacedTile[]): number {
    if (placed.length === 0) {
        return LIVE_LAYOUT_DEFAULT_HEIGHT_PX;
    }
    return Math.max(...placed.map((p) => p.bottom)) + LIVE_LAYOUT_GAP_PX;
}

export function liveTileIdsForFixture(fixture: DMXFixture): string[] {
    const ids: string[] = [];
    if (fixture.type === "movingHead" || fixture.type === "smoke") {
        ids.push("preview");
    }
    for (const ch of fixture.channels) {
        if (resolveLiveWidget(ch) !== "hidden") {
            ids.push(channelLiveTileId(ch));
        }
    }
    return ids;
}

export function sortTileIdsForPack(ids: string[]): string[] {
    const rank = (id: string): number => {
        if (id === "preview") {
            return 0;
        }
        if (id.startsWith("ch-")) {
            const n = Number(id.slice(3));
            return 10 + (Number.isFinite(n) ? n : 999);
        }
        return 50;
    };
    return [...new Set(ids)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** A `slider` channel rendered as a vertical fader (the default orientation). */
function isVerticalFaderChannel(fixture: DMXFixture | undefined, id: string): boolean {
    if (!fixture || !id.startsWith("ch-")) {
        return false;
    }
    const ch = fixture.channels.find((c) => c.channel === Number(id.slice(3)));
    if (!ch || resolveLiveWidget(ch) !== "slider") {
        return false;
    }
    return readLiveSliderOrientation(ch.properties as Record<string, unknown> | undefined) === "vertical";
}

function defaultWidthForId(id: string, fixture?: DMXFixture): LiveTileWidth {
    if (id === "preview") {
        return LIVE_LAYOUT_COLUMNS;
    }
    // Vertical faders are narrow so several fit side by side in one coarse column.
    if (isVerticalFaderChannel(fixture, id)) {
        return 1;
    }
    return LIVE_LAYOUT_DEFAULT_WIDTH;
}

function defaultHeightPxForId(id: string, fixture?: DMXFixture): number {
    if (id === "preview") {
        return 280;
    }
    if (isVerticalFaderChannel(fixture, id)) {
        return 240;
    }
    if (id.startsWith("ch-") && fixture) {
        const offset = Number(id.slice(3));
        const ch = fixture.channels.find((c) => c.channel === offset);
        if (ch) {
            const w = resolveLiveWidget(ch);
            const vertical =
                readLiveSliderOrientation(ch.properties as Record<string, unknown> | undefined) === "vertical";
            // Vertical fader banks need height for the tall sliders.
            if (vertical && (w === "slotSlider" || w === "buttonSlider")) {
                return 240;
            }
            if (w === "colorWheel" || w === "goboWheel") {
                return 220;
            }
            if (w === "buttons" || w === "shutterModes" || w === "buttonSlider") {
                return 180;
            }
        }
    }
    return LIVE_LAYOUT_DEFAULT_HEIGHT_PX;
}

export function defaultLiveLayoutForIds(activeIds: string[], fixture?: DMXFixture): LiveLayoutTile[] {
    const ids = sortTileIdsForPack(activeIds);
    const drafts: LiveLayoutTile[] = [];

    for (const id of ids) {
        const w = defaultWidthForId(id, fixture);
        drafts.push({
            id,
            col: 0,
            w,
            y: 0,
            heightPx: defaultHeightPxForId(id, fixture),
        });
    }

    return packMasonryTiles(drafts).map(({id, col, w, y, heightPx}) => ({id, col, w, y, heightPx}));
}

function parseTileV3(raw: unknown): LiveLayoutTile | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (!id) {
        return null;
    }
    const col = Number(o.col);
    const w = Number(o.w);
    const y = Number(o.y);
    const heightPx = Number(o.heightPx ?? o.hPx);
    if (!Number.isInteger(col) || !Number.isInteger(w) || w < 1) {
        return null;
    }
    const tile: LiveLayoutTile = {
        id,
        col: Math.max(0, Math.round(col)),
        w: Math.max(1, Math.round(w)),
        y: Number.isFinite(y) ? Math.max(0, y) : 0,
        heightPx: Number.isFinite(heightPx) ? heightPx : LIVE_LAYOUT_DEFAULT_HEIGHT_PX,
    };
    return {
        ...tile,
        heightPx: clampTileHeightPx(tile.heightPx),
    };
}

/** Migrate v2 grid tiles (row, h in quarter units) to v3 masonry. */
function migrateV2Tiles(tiles: LiveLayoutTile[]): LiveLayoutTile[] {
    return tiles.map((t) => {
        const raw = t as LiveLayoutTile & {row?: number; h?: number};
        const row = typeof raw.row === "number" ? raw.row : 0;
        const hUnits = typeof raw.h === "number" ? raw.h : 4;
        return normalizeTile({
            id: t.id,
            col: t.col,
            w: t.w,
            y: row * LIVE_LAYOUT_LEGACY_ROW_PX,
            heightPx: hUnits * LIVE_LAYOUT_LEGACY_ROW_PX,
        });
    });
}

function migrateLegacyTileIds(
    tiles: LiveLayoutTile[],
    fixture: DMXFixture | undefined,
    activeIds: string[],
): LiveLayoutTile[] {
    if (!fixture) {
        return tiles.filter((t) => activeIds.includes(t.id));
    }
    const out: LiveLayoutTile[] = [];
    const used = new Set<string>();

    for (const t of tiles) {
        if (activeIds.includes(t.id)) {
            out.push(normalizeTile(t));
            used.add(t.id);
            continue;
        }
        const types = LEGACY_GROUP_CHANNELS[t.id];
        if (!types) {
            if (t.id.startsWith("custom-")) {
                const off = Number(t.id.slice("custom-".length));
                const newId = `ch-${off}`;
                if (activeIds.includes(newId) && !used.has(newId)) {
                    out.push(normalizeTile({...t, id: newId}));
                    used.add(newId);
                }
            }
            continue;
        }
        for (const ch of fixture.channels) {
            if (!types.includes(ch.type)) {
                continue;
            }
            const newId = channelLiveTileId(ch);
            if (!activeIds.includes(newId) || used.has(newId)) {
                continue;
            }
            out.push(normalizeTile({...t, id: newId}));
            used.add(newId);
        }
    }
    return out;
}

export function parseLiveLayoutDocument(raw: string): LiveLayoutDocument | null {
    try {
        const j = JSON.parse(raw) as unknown;
        if (!j || typeof j !== "object") {
            return null;
        }
        const version = (j as {version?: unknown}).version;
        const tilesRaw = (j as {tiles?: unknown}).tiles;
        if (!Array.isArray(tilesRaw)) {
            return null;
        }

        if (version === 3 || version === 4) {
            const tiles: LiveLayoutTile[] = [];
            for (const x of tilesRaw) {
                const t = parseTileV3(x);
                if (t) {
                    tiles.push(t);
                }
            }
            return {version, tiles};
        }

        // v1/v2: col, row, w, h
        const legacy: LiveLayoutTile[] = [];
        for (const x of tilesRaw) {
            if (!x || typeof x !== "object") {
                continue;
            }
            const o = x as Record<string, unknown>;
            const id = typeof o.id === "string" ? o.id.trim() : "";
            if (!id) {
                continue;
            }
            const col = Number(o.col);
            const row = Number(o.row);
            const w = Number(o.w);
            const hRaw = Number(o.h);
            if (!Number.isInteger(col) || !Number.isInteger(row) || (w !== 1 && w !== 2 && w !== 3)) {
                continue;
            }
            const hUnits = Number.isInteger(hRaw) && hRaw >= 1 ? hRaw : 4;
            const ver1Row = version === 1 ? row * 4 : row;
            legacy.push(
                normalizeTile({
                    id,
                    col,
                    w: w as LiveTileWidth,
                    y: ver1Row * LIVE_LAYOUT_LEGACY_ROW_PX,
                    heightPx: hUnits * LIVE_LAYOUT_LEGACY_ROW_PX,
                }),
            );
        }
        return {version: 3, tiles: legacy};
    } catch {
        return null;
    }
}

export function serializeLiveLayoutDocument(doc: LiveLayoutDocument): string {
    const tiles = doc.tiles.map((t) => normalizeTile(t));
    return JSON.stringify({version: LIVE_LAYOUT_DOC_VERSION, tiles});
}

export function mergeLiveLayoutWithActiveIds(
    saved: LiveLayoutDocument | null,
    activeIds: string[],
    fixture?: DMXFixture,
): LiveLayoutTile[] {
    const ids = sortTileIdsForPack(activeIds);
    const defaults = defaultLiveLayoutForIds(ids, fixture);
    const byId = new Map(defaults.map((t) => [t.id, t]));

    if (saved) {
        let savedTiles = saved.tiles;
        if (saved.version < 3) {
            savedTiles = migrateV2Tiles(savedTiles);
        }
        // v1–v3 used coarse columns (1 unit = 1 visual column); scale up to fine units.
        if (saved.version < 4) {
            savedTiles = savedTiles.map((t) => ({
                ...t,
                col: t.col * LIVE_LAYOUT_SUBDIVISIONS,
                w: t.w * LIVE_LAYOUT_SUBDIVISIONS,
            }));
        }
        savedTiles = savedTiles.map((t) => normalizeTile(t));
        savedTiles = migrateLegacyTileIds(savedTiles, fixture, ids);
        for (const t of savedTiles) {
            if (!ids.includes(t.id)) {
                continue;
            }
            byId.set(t.id, t);
        }
    }

    const merged = ids.map((id) => byId.get(id)).filter((t): t is LiveLayoutTile => Boolean(t));
    return packMasonryTiles(merged).map(({id, col, w, y, heightPx}) => ({id, col, w, y, heightPx}));
}

/** Snap pointer position to column index and y within container. */
export function snapMasonryDrop(
    clientX: number,
    clientY: number,
    containerRect: DOMRect,
    tileW: LiveTileWidth,
    columns = LIVE_LAYOUT_COLUMNS,
): {col: number; y: number} {
    const safeColumns = Math.max(LIVE_LAYOUT_COLUMNS, Math.round(columns) || LIVE_LAYOUT_COLUMNS);
    const colWidth = (containerRect.width - LIVE_LAYOUT_GAP_PX * (safeColumns - 1)) / safeColumns;
    const relX = clientX - containerRect.left;
    const relY = clientY - containerRect.top;
    let col = Math.floor(relX / (colWidth + LIVE_LAYOUT_GAP_PX));
    col = clampTileCol(col, tileW, safeColumns);
    const y = Math.max(0, Math.round(relY));
    return {col, y};
}
