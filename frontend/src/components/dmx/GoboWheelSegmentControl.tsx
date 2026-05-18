import {cn} from "@/lib/utils";

export type GoboWheelSegmentEntry = {
    label?: string;
    goboImage?: string;
};

type GoboWheelSegmentControlProps = {
    entries: GoboWheelSegmentEntry[];
    value: number;
    onChange: (idx: number) => void;
    disabled: boolean;
};

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

export function GoboWheelSegmentControl({
                                            entries,
                                            value,
                                            onChange,
                                            disabled,
                                        }: GoboWheelSegmentControlProps) {
    const count = entries.length;
    if (count <= 0) {
        return null;
    }
    const clamped = Math.max(0, Math.min(count - 1, value));
    const seg = 360 / count;
    const cx = 50;
    const cy = 50;
    const outerR = 47;
    const innerR = 18;
    const markerR = (outerR + innerR) / 2;
    const gapDeg = 0;
    const selectedCenterDeg = -90 + clamped * seg;
    const selectedStartDeg = selectedCenterDeg - seg / 2 + gapDeg / 2;
    const selectedEndDeg = selectedCenterDeg + seg / 2 - gapDeg / 2;
    const selectedPath = donutSegmentPath(cx, cy, outerR, innerR, selectedStartDeg, selectedEndDeg);

    return (
        <div className={cn("relative w-fit", disabled && "opacity-60")}>
            <svg
                viewBox="0 0 100 100"
                className={cn("size-44 rounded-full border border-border bg-white shadow-sm", !disabled && "cursor-pointer")}
                role="img"
                aria-label="Gobo wheel segment picker"
            >
                {entries.map((entry, idx) => {
                    const centerDeg = -90 + idx * seg;
                    const startDeg = centerDeg - seg / 2 + gapDeg / 2;
                    const endDeg = centerDeg + seg / 2 - gapDeg / 2;
                    const p = donutSegmentPath(cx, cy, outerR, innerR, startDeg, endDeg);
                    const markerPoint = polarPoint(cx, cy, markerR, centerDeg);
                    const fillShade = idx % 2 === 0 ? "#ffffff" : "#f7f8fa";
                    const hasPreview = typeof entry.goboImage === "string" && entry.goboImage.trim().length > 0;
                    return (
                        <g key={`gobo-seg-${idx}`}>
                            <path
                                d={p}
                                fill={fillShade}
                                stroke="#d7dbe0"
                                strokeWidth={0.5}
                                className={cn(!disabled && "transition-opacity hover:opacity-90")}
                                onClick={() => {
                                    if (!disabled) {
                                        onChange(idx);
                                    }
                                }}
                            />
                            {hasPreview ? (
                                <g style={{pointerEvents: "none"}}>
                                    <rect
                                        x={markerPoint.x - 7.5}
                                        y={markerPoint.y - 7.5}
                                        width={15}
                                        height={15}
                                        rx={2}
                                        fill="rgba(255,255,255,0.95)"
                                        stroke="rgba(0,0,0,0.55)"
                                        strokeWidth={0.8}
                                    />
                                    <image
                                        href={entry.goboImage}
                                        x={markerPoint.x - 7}
                                        y={markerPoint.y - 7}
                                        width={14}
                                        height={14}
                                        preserveAspectRatio="xMidYMid meet"
                                    />
                                </g>
                            ) : (
                                <text
                                    x={markerPoint.x}
                                    y={markerPoint.y}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fontSize="8"
                                    fontWeight="700"
                                    fill="#1f2937"
                                    style={{pointerEvents: "none", userSelect: "none"}}
                                >
                                    {idx + 1}
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
            <span className="sr-only">Gobo wheel segment picker</span>
        </div>
    );
}
