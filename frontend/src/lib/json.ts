import type { JSONMap } from "../types/controller";

export function prettyJSON(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function parseJSONMap(raw: string): JSONMap {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Value must be a JSON object");
  }
  return parsed as JSONMap;
}

export function readNumber(input: unknown, fallback: number): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}
