import type { JSONMap } from "../types/controller";
import { readNumber } from "./json";

/** WLED warm white example: POST /json/state with seg col [[255,160,0]] */
export const WARM_WHITE_RGB: [number, number, number] = [255, 160, 0];

/** Cool / daylight white for preset strips */
export const COLD_WHITE_RGB: [number, number, number] = [220, 235, 255];

export function warmWhiteState(bri: number): JSONMap {
  return {
    on: true,
    bri,
    seg: [{ col: [WARM_WHITE_RGB] }],
  };
}

export function coldWhiteState(bri: number): JSONMap {
  return {
    on: true,
    bri,
    seg: [{ col: [COLD_WHITE_RGB] }],
  };
}

export function rgbState(r: number, g: number, b: number, bri: number, on = true): JSONMap {
  return {
    on,
    bri,
    seg: [{ col: [[r, g, b]] }],
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
