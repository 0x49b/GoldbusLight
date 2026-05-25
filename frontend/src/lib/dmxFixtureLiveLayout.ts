/** Live tab: 3-column masonry layout with free pixel heights (no row grid). */

import type {DMXFixture} from "../types/controller";
import {channelLiveTileId, resolveLiveWidget} from "./dmxLiveWidget";

export const LIVE_LAYOUT_COLUMNS = 3;
export const LIVE_LAYOUT_GAP_PX = 8;
export const LIVE_LAYOUT_MIN_HEIGHT_PX = 72;
export const LIVE_LAYOUT_MAX_HEIGHT_PX = 720;
export const LIVE_LAYOUT_DEFAULT_HEIGHT_PX = 160;
/** Legacy v2: one row unit in pixels when migrating */
export const LIVE_LAYOUT_LEGACY_ROW_PX = 48;

export type LiveTileWidth = 1 | 2 | 3;

export type LiveLayoutTile = {
    id: string;
    /** Start column 0..2 */
    col: number;
    w: LiveTileWidth;
    /** Top offset in px from masonry container origin */
    y: number;
    /** Tile height in px */
    heightPx: number;
};

export type LiveLayoutDocument = {
    version: 2 | 3;
    tiles: LiveLayoutTile[];
};

export const LIVE_LAYOUT_DOC_VERSION = 3 as const;

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

export function clampTileCol(col: number, w: LiveTileWidth): number {
    const maxCol = LIVE_LAYOUT_COLUMNS - w;
    return Math.max(0, Math.min(maxCol, Math.round(col)));
}

function normalizeTile(t: LiveLayoutTile): LiveLayoutTile {
    const w = (t.w === 2 || t.w === 3 ? t.w : 1) as LiveTileWidth;
    return {
        id: t.id,
        col: clampTileCol(t.col, w),
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
export function packMasonryTiles(tiles: LiveLayoutTile[]): MasonryPlacedTile[] {
    const sorted = [...tiles].map((t) => normalizeTile(t));
    sorted.sort((a, b) => a.y - b.y || a.col - b.col || a.id.localeCompare(b.id));

    const placed: MasonryPlacedTile[] = [];

    const bottomAtCol = (): number[] => {
        const bottoms = [0, 0, 0];
        for (const p of placed) {
            const endCol = tileColEnd(p);
            const bottom = p.y + p.heightPx + LIVE_LAYOUT_GAP_PX;
            for (let c = p.col; c < endCol && c < LIVE_LAYOUT_COLUMNS; c++) {
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

function defaultWidthForId(id: string): LiveTileWidth {
    if (id === "preview") {
        return 3;
    }
    return 1;
}

function defaultHeightPxForId(id: string, fixture?: DMXFixture): number {
    if (id === "preview") {
        return 280;
    }
    if (id.startsWith("ch-") && fixture) {
        const offset = Number(id.slice(3));
        const ch = fixture.channels.find((c) => c.channel === offset);
        if (ch) {
            const w = resolveLiveWidget(ch);
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
        const w = defaultWidthForId(id);
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
    if (!Number.isInteger(col) || (w !== 1 && w !== 2 && w !== 3)) {
        return null;
    }
    const tile: LiveLayoutTile = {
        id,
        col,
        w: w as LiveTileWidth,
        y: Number.isFinite(y) ? Math.max(0, y) : 0,
        heightPx: Number.isFinite(heightPx) ? heightPx : LIVE_LAYOUT_DEFAULT_HEIGHT_PX,
    };
    const n = normalizeTile(tile);
    if (n.col + n.w > LIVE_LAYOUT_COLUMNS) {
        return null;
    }
    return n;
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

        if (version === 3) {
            const tiles: LiveLayoutTile[] = [];
            for (const x of tilesRaw) {
                const t = parseTileV3(x);
                if (t) {
                    tiles.push(t);
                }
            }
            return {version: 3, tiles};
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
    return JSON.stringify({version: 3, tiles});
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
        let savedTiles = saved.tiles.map((t) => normalizeTile(t));
        if (saved.version < 3) {
            savedTiles = migrateV2Tiles(savedTiles);
        }
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
): {col: number; y: number} {
    const colWidth = (containerRect.width - LIVE_LAYOUT_GAP_PX * (LIVE_LAYOUT_COLUMNS - 1)) / LIVE_LAYOUT_COLUMNS;
    const relX = clientX - containerRect.left;
    const relY = clientY - containerRect.top;
    let col = Math.floor(relX / (colWidth + LIVE_LAYOUT_GAP_PX));
    col = clampTileCol(col, tileW);
    const y = Math.max(0, Math.round(relY));
    return {col, y};
}
