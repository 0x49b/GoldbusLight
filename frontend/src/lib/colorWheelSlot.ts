/** Shared helpers for color-wheel slots (static colors vs rainbow/scroll ranges). */

export type ColorWheelScrollRamp = "fastToSlow" | "slowToFast";

export type ColorWheelSlotLike = {
    from?: number;
    to?: number;
    label?: string;
    mode?: string;
    color?: string;
    direction?: string;
    scrollRamp?: ColorWheelScrollRamp;
};

export function isColorWheelScrollSlot(entry: ColorWheelSlotLike | undefined): boolean {
    if (!entry) {
        return false;
    }
    const label = (entry.label ?? "").toLowerCase();
    const mode = (entry.mode ?? "").toLowerCase();
    return label.includes("rainbow") || mode === "rainbow" || mode === "scroll";
}

/**
 * How DMX changes across the slot's `from`→`to` range:
 * - slowToFast: higher value → faster
 * - fastToSlow: higher value → slower
 */
export function inferScrollRamp(entry: ColorWheelSlotLike): ColorWheelScrollRamp {
    if (entry.scrollRamp === "fastToSlow" || entry.scrollRamp === "slowToFast") {
        return entry.scrollRamp;
    }
    const label = (entry.label ?? "").toLowerCase();
    if (/\bslow\s*to\s*fast\b/.test(label) || /\bslow\s*->\s*fast\b/.test(label)) {
        return "slowToFast";
    }
    if (/\bfast\s*to\s*slow\b/.test(label) || /\bfast\s*->\s*slow\b/.test(label)) {
        return "fastToSlow";
    }
    return "fastToSlow";
}

/** Live slider labels: slow is always on the left, fast on the right. */
export function scrollVelocityLiveLabels(): { left: string; right: string } {
    return {left: "Slow", right: "Fast"};
}

/** DMX values at the slow (left) and fast (right) ends for the live slider. */
export function scrollRangeSlowFastDmx(
    entry: ColorWheelSlotLike,
    ramp: ColorWheelScrollRamp,
): { slow: number; fast: number } {
    const from = entry.from ?? 0;
    const to = entry.to ?? 255;
    if (ramp === "slowToFast") {
        return from <= to ? {slow: from, fast: to} : {slow: to, fast: from};
    }
    return from <= to ? {slow: to, fast: from} : {slow: from, fast: to};
}

function clamp01(n: number): number {
    return Math.max(0, Math.min(1, n));
}

function clamp255(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n)));
}

/** Map live slider 0=slow (left), 1=fast (right) to a DMX byte. */
export function scrollSlotDmxByte(
    entry: ColorWheelSlotLike,
    within01: number,
    ramp: ColorWheelScrollRamp,
): number {
    const {slow, fast} = scrollRangeSlowFastDmx(entry, ramp);
    const t = clamp01(within01);
    return clamp255(slow + t * (fast - slow));
}

/** Inverse of scrollSlotDmxByte for cue recall / live state init. */
export function within01ForScrollEntry(
    entry: ColorWheelSlotLike,
    outputByte: number,
    ramp: ColorWheelScrollRamp,
): number {
    const {slow, fast} = scrollRangeSlowFastDmx(entry, ramp);
    const span = fast - slow;
    if (span === 0) {
        return 0;
    }
    return clamp01((clamp255(outputByte) - slow) / span);
}

/** Default UI position when a scroll slot is first selected (mid-range). */
export function defaultScrollWithin01(): number {
    return 0.5;
}
