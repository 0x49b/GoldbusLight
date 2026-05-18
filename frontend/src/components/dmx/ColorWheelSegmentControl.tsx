import {useId} from "react";
import {cn} from "@/lib/utils";

export type ColorWheelSegmentEntry = {
    label?: string;
    mode?: string;
    color?: string;
};

type ColorWheelSegmentControlProps = {
    entries: ColorWheelSegmentEntry[];
    value: number;
    onChange: (idx: number) => void;
    disabled: boolean;
};

function fallbackWheelColor(idx: number, count: number): string {
    const hue = Math.round((idx / Math.max(1, count)) * 360);
    return `hsl(${hue} 90% 58%)`;
}

function isRainbowEntry(entry: ColorWheelSegmentEntry): boolean {
    const colorText = typeof entry.color === "string" ? entry.color.toLowerCase() : "";
    const labelText = typeof entry.label === "string" ? entry.label.toLowerCase() : "";
    return colorText.includes("rainbow") || labelText.includes("rainbow");
}

function rainbowDirectionLabel(entry: ColorWheelSegmentEntry): "CW" | "CCW" | "RBW" {
    const modeText = typeof entry.mode === "string" ? entry.mode.toLowerCase() : "";
    const labelText = typeof entry.label === "string" ? entry.label.toLowerCase() : "";
    const hay = `${modeText} ${labelText}`;
    if (hay.includes("ccw") || hay.includes("counter")) {
        return "CCW";
    }
    if (hay.includes("cw") || hay.includes("clockwise")) {
        return "CW";
    }
    return "RBW";
}

function wheelSegmentColor(entry: ColorWheelSegmentEntry, idx: number, count: number, rainbowGradientId: string): string {
    const raw = typeof entry.color === "string" ? entry.color.trim() : "";
    if (isRainbowEntry(entry)) {
        return `url(#${rainbowGradientId})`;
    }
    return raw || fallbackWheelColor(idx, count);
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
    const rad = (angleDeg * Math.PI) / 180;
    return {x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r};
}

function donutSegmentPath(
    cx: number,
    cy: number,
    outerR: number,
    innerR: number,
    startDeg: number,
    endDeg: number,
): string {
    const outerStart = polarPoint(cx, cy, outerR, startDeg);
    const outerEnd = polarPoint(cx, cy, outerR, endDeg);
    const innerEnd = polarPoint(cx, cy, innerR, endDeg);
    const innerStart = polarPoint(cx, cy, innerR, startDeg);
    const span = (endDeg - startDeg + 360) % 360;
    const largeArc = span > 180 ? 1 : 0;
    return [
        `M ${outerStart.x} ${outerStart.y}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
        `L ${innerEnd.x} ${innerEnd.y}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
        "Z",
    ].join(" ");
}

export function ColorWheelSegmentControl({
                                             entries,
                                             value,
                                             onChange,
                                             disabled,
                                         }: ColorWheelSegmentControlProps) {
    const count = entries.length;
    const gradIdRaw = useId();
    const rainbowGradientId = `wheelRainbowGradient-${gradIdRaw.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    if (count <= 0) {
        return null;
    }
    const clamped = Math.max(0, Math.min(count - 1, value));
    const seg = 360 / count;
    const cx = 50;
    const cy = 50;
    const outerR = 47;
    const innerR = 18;
    const labelR = (outerR + innerR) / 2;
    const rbwLabelR = outerR - 5;
    const gapDeg = 0;
    const selectedCenterDeg = -90 + clamped * seg;
    const selectedStartDeg = selectedCenterDeg - seg / 2 + gapDeg / 2;
    const selectedEndDeg = selectedCenterDeg + seg / 2 - gapDeg / 2;
    const selectedPath = donutSegmentPath(cx, cy, outerR, innerR, selectedStartDeg, selectedEndDeg);

    return (
        <div className={cn("relative w-fit", disabled && "opacity-60")}>
            <svg
                viewBox="0 0 100 100"
                className={cn("size-44 rounded-full border border-border bg-muted shadow-sm", !disabled && "cursor-pointer")}
                role="img"
                aria-label="Color wheel segment picker"
            >
                <defs>
                    <linearGradient id={rainbowGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#ff0048"/>
                        <stop offset="20%" stopColor="#ff7a00"/>
                        <stop offset="40%" stopColor="#ffe600"/>
                        <stop offset="60%" stopColor="#3cff00"/>
                        <stop offset="80%" stopColor="#00a3ff"/>
                        <stop offset="100%" stopColor="#a000ff"/>
                    </linearGradient>
                </defs>
                {entries.map((entry, idx) => {
                    const centerDeg = -90 + idx * seg;
                    const startDeg = centerDeg - seg / 2 + gapDeg / 2;
                    const endDeg = centerDeg + seg / 2 - gapDeg / 2;
                    const labelPoint = polarPoint(cx, cy, labelR, centerDeg);
                    const rbwPoint = polarPoint(cx, cy, rbwLabelR, centerDeg);
                    const path = donutSegmentPath(cx, cy, outerR, innerR, startDeg, endDeg);
                    return (
                        <g key={`seg-${idx}`}>
                            <path
                                d={path}
                                fill={wheelSegmentColor(entry, idx, count, rainbowGradientId)}
                                className={cn(!disabled && "transition-opacity hover:opacity-90")}
                                onClick={() => {
                                    if (!disabled) {
                                        onChange(idx);
                                    }
                                }}
                            />
                            <text
                                x={labelPoint.x}
                                y={labelPoint.y}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize="6.5"
                                fontWeight="700"
                                fill="white"
                                stroke="rgba(0,0,0,0.65)"
                                strokeWidth="0.9"
                                paintOrder="stroke fill"
                                style={{pointerEvents: "none", userSelect: "none"}}
                            >
                                {idx + 1}
                            </text>
                            {isRainbowEntry(entry) && (
                                <text
                                    x={rbwPoint.x}
                                    y={rbwPoint.y}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fontSize="4.1"
                                    fontWeight="800"
                                    fill="white"
                                    stroke="rgba(0,0,0,0.85)"
                                    strokeWidth="0.85"
                                    paintOrder="stroke fill"
                                    style={{pointerEvents: "none", userSelect: "none"}}
                                >
                                    {rainbowDirectionLabel(entry)}
                                </text>
                            )}
                        </g>
                    );
                })}
                <path
                    d={selectedPath}
                    fill="none"
                    stroke="#111111"
                    strokeWidth="2.2"
                    strokeLinejoin="round"
                    style={{pointerEvents: "none"}}
                    aria-hidden
                />
            </svg>
            <span className="sr-only">Color wheel segment picker</span>
        </div>
    );
}
