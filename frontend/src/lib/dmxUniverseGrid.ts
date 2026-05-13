import type {DMXFixture} from "../types/controller";

export const DMX_UNIVERSE_SLOTS = 512;
export const DMX_UNIVERSE_GRID_COLS = 24;

export type UniverseRange = {
    start: number;
    end: number;
};

/** One horizontal segment within a single grid row (0-based row/col). */
export type GridSegment = {
    row: number;
    colStart: number;
    span: number;
};

export function footprint(fixture: DMXFixture): number {
    if (!fixture.channels.length) {
        return 1;
    }
    let maxOff = 1;
    for (const ch of fixture.channels) {
        const off = Number.isFinite(ch.channel) ? Math.round(ch.channel) : 1;
        if (off > maxOff) {
            maxOff = off;
        }
    }
    return Math.max(1, maxOff);
}

export function universeRange(fixture: DMXFixture): UniverseRange | null {
    const base = Number.isFinite(fixture.dmxAddress) ? Math.round(fixture.dmxAddress) : 1;
    const start = Math.max(1, Math.min(DMX_UNIVERSE_SLOTS, base));
    const fp = footprint(fixture);
    const end = Math.min(DMX_UNIVERSE_SLOTS, start + fp - 1);
    if (start > DMX_UNIVERSE_SLOTS) {
        return null;
    }
    return {start, end};
}

/** Universe channel index 1–512 → row-major cell (0-based). */
export function channelIndexToCell(
    channelIndex: number,
    cols: number = DMX_UNIVERSE_GRID_COLS,
): { row: number; col: number } {
    const idx = Math.max(0, Math.min(DMX_UNIVERSE_SLOTS - 1, channelIndex - 1));
    return {
        row: Math.floor(idx / cols),
        col: idx % cols,
    };
}

/**
 * Split inclusive universe range [start, end] into rectangular row segments for CSS grid placement.
 */
export function splitRangeIntoSegments(
    start: number,
    end: number,
    cols: number = DMX_UNIVERSE_GRID_COLS,
): GridSegment[] {
    const s = Math.max(1, Math.min(DMX_UNIVERSE_SLOTS, start));
    const e = Math.max(s, Math.min(DMX_UNIVERSE_SLOTS, end));
    const out: GridSegment[] = [];
    let cursor = s;
    while (cursor <= e) {
        const row = Math.floor((cursor - 1) / cols);
        const rowLast = Math.min((row + 1) * cols, DMX_UNIVERSE_SLOTS);
        const segmentEnd = Math.min(e, rowLast);
        const colStart = (cursor - 1) % cols;
        const span = segmentEnd - cursor + 1;
        out.push({row, colStart, span});
        cursor = segmentEnd + 1;
    }
    return out;
}
