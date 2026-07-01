import type {JSONMap} from "../types/controller";
import {readNumber} from "./json";

export const CANDLE_LIGHT_RGB: [number, number, number] = [255, 93, 0];
export const SUPER_WARM_RGB: [number, number, number] = [255, 147, 44];
export const WARM_WHITE_RGB: [number, number, number] = [255, 169, 87];
export const DAYLIGHT_WHITE_RGB: [number, number, number] = [255, 215, 177];
export const WHITE_RGB: [number, number, number] = [255, 233, 217];
export const FROSTY_WHITE_RGB: [number, number, number] = [245, 243, 255];
export const COLD_WHITE_RGB: [number, number, number] = [220, 230, 255];
export const BLACK_LIGHT_FLUORESCENT_RGB: [number, number, number] = [167, 0, 255];
export const CLEAR_BLUE_SKY_RGB: [number, number, number] = [64, 156, 255];
export const DIRECT_SUNLIGHT_RGB: [number, number, number] = [255, 255, 255];

export const NAMED_LIGHT_PRESETS: ReadonlyArray<{ name: string; rgb: [number, number, number] }> = [
    {name: "1300K Candle Light", rgb: CANDLE_LIGHT_RGB},
    {name: "2200K Super Warm", rgb: SUPER_WARM_RGB},
    {name: "2700K Warm White", rgb: WARM_WHITE_RGB},
    {name: "4300K Daylight White", rgb: DAYLIGHT_WHITE_RGB},
    {name: "5300K White", rgb: WHITE_RGB},
    {name: "7000K Frosty White", rgb: FROSTY_WHITE_RGB},
    {name: "Cold White", rgb: COLD_WHITE_RGB},
    {name: "Black Light Fluorescent", rgb: BLACK_LIGHT_FLUORESCENT_RGB},
    {name: "Clear Blue Sky", rgb: CLEAR_BLUE_SKY_RGB},
    {name: "Direct Sunlight", rgb: DIRECT_SUNLIGHT_RGB},
];

export function rgbEquals(
    a: readonly [number, number, number],
    b: readonly [number, number, number],
): boolean {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function isWarmWhiteRgb(rgb: readonly [number, number, number]): boolean {
    return rgbEquals(rgb, WARM_WHITE_RGB);
}

export function isColdWhiteRgb(rgb: readonly [number, number, number]): boolean {
    return rgbEquals(rgb, COLD_WHITE_RGB);
}

export function isNamedDropdownColorRgb(rgb: readonly [number, number, number]): boolean {
    return NAMED_LIGHT_PRESETS.some(
        (preset) => !isWarmWhiteRgb(preset.rgb) && !isColdWhiteRgb(preset.rgb) && rgbEquals(rgb, preset.rgb),
    );
}

export function warmWhiteState(bri: number): JSONMap {
    return {
        on: true,
        bri,
        seg: [{col: [WARM_WHITE_RGB], fx: 0, pal: 0}],
    };
}

export function coldWhiteState(bri: number): JSONMap {
    return {
        on: true,
        bri,
        seg: [{col: [COLD_WHITE_RGB], fx: 0, pal: 0}],
    };
}

export function rgbState(r: number, g: number, b: number, bri: number, on = true): JSONMap {
    return {
        on,
        bri,
        seg: [{col: [[r, g, b]], fx: 0, pal: 0}],
    };
}

export function mainSegIndex(state: JSONMap | undefined): number {
    if (!state) return 0;
    const m = state.mainseg;
    if (typeof m === "number" && Number.isFinite(m)) return m;
    return 0;
}

export function segmentAt(state: JSONMap | undefined, index: number): JSONMap | undefined {
    const segs = state?.seg;
    if (!Array.isArray(segs) || index < 0 || index >= segs.length) return undefined;
    const seg = segs[index];
    return seg && typeof seg === "object" && !Array.isArray(seg) ? (seg as JSONMap) : undefined;
}

export function segmentFx(seg: JSONMap | undefined): number {
    return readNumber(seg?.fx, 0);
}

export function segmentPal(seg: JSONMap | undefined): number {
    return readNumber(seg?.pal, 0);
}

export function segmentSx(seg: JSONMap | undefined): number {
    return readNumber(seg?.sx, 128);
}

export function segmentIx(seg: JSONMap | undefined): number {
    return readNumber(seg?.ix, 128);
}

export function rgbFromSegment(seg: JSONMap | undefined): [number, number, number] {
    const col = seg?.col;
    if (!Array.isArray(col) || col.length === 0) return [...WARM_WHITE_RGB];
    const first = col[0];
    if (Array.isArray(first) && first.length >= 3) {
        return [readNumber(first[0], 255), readNumber(first[1], 160), readNumber(first[2], 0)];
    }
    return [...WARM_WHITE_RGB];
}

export function rgbToHex(r: number, g: number, b: number): string {
    const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
    return `#${[clamp(r), clamp(g), clamp(b)]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("")}`;
}

export function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace(/^#/, "");
    if (h.length !== 6) return [255, 0, 0];
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return [Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0];
}
