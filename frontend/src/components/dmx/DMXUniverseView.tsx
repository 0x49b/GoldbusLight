import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {
    channelIndexToCell,
    DMX_UNIVERSE_GRID_COLS,
    DMX_UNIVERSE_SLOTS,
    splitRangeIntoSegments,
    universeRange,
} from "@/lib/dmxUniverseGrid";
import type {DetailRoute, DMXFixture, USBSerialDevice} from "../../types/controller";
import {PiPlus, PiWarningCircle} from "react-icons/pi";

export type DMXUniverseViewProps = {
    fixtures: DMXFixture[];
    selectedUSBDeviceId: string;
    usbSerialDevices: USBSerialDevice[];
    setRoute: (route: DetailRoute) => void;
};

function padChannel(n: number): string {
    return String(Math.max(1, Math.min(DMX_UNIVERSE_SLOTS, n))).padStart(3, "0");
}

function buildSlotOccupancy(fixtures: DMXFixture[]): Map<number, string[]> {
    const map = new Map<number, string[]>();
    for (const fx of fixtures) {
        const range = universeRange(fx);
        if (!range) {
            continue;
        }
        for (let s = range.start; s <= range.end; s++) {
            const list = map.get(s);
            if (list) {
                list.push(fx.id);
            } else {
                map.set(s, [fx.id]);
            }
        }
    }
    return map;
}

function fixtureHasConflict(fx: DMXFixture, occupancy: Map<number, string[]>): boolean {
    const range = universeRange(fx);
    if (!range) {
        return false;
    }
    for (let s = range.start; s <= range.end; s++) {
        const ids = occupancy.get(s);
        if (ids && ids.length > 1) {
            return true;
        }
    }
    return false;
}

export function DMXUniverseView({
                                    fixtures,
                                    selectedUSBDeviceId,
                                    usbSerialDevices,
                                    setRoute,
                                }: DMXUniverseViewProps) {
    const usbDevice = usbSerialDevices.find((d) => d.id === selectedUSBDeviceId);
    const subtitle = usbDevice?.name ?? usbDevice?.description ?? "No USB device selected";

    const occupancy = buildSlotOccupancy(fixtures);
    const covered = new Set<number>();
    for (const fx of fixtures) {
        const range = universeRange(fx);
        if (!range) {
            continue;
        }
        for (let s = range.start; s <= range.end; s++) {
            covered.add(s);
        }
    }

    const sortedFixtures = [...fixtures].sort((a, b) => {
        const ra = universeRange(a);
        const rb = universeRange(b);
        const sa = ra?.start ?? 9999;
        const sb = rb?.start ?? 9999;
        if (sa !== sb) {
            return sa - sb;
        }
        return a.id.localeCompare(b.id);
    });

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
            <div className="flex flex-wrap items-start gap-2">
                <div
                    className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-primary px-3 py-2 text-primary-foreground shadow-sm">
                    <span className="text-sm font-semibold leading-none">Universe 1</span>
                    <span className="truncate text-xs opacity-90" title={subtitle}>
            {subtitle}
          </span>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    disabled
                    title="Only one universe supported"
                    aria-label="Add universe (not available)"
                >
                    <PiPlus className="size-4" aria-hidden/>
                </Button>
            </div>

            <div
                className="touch-pan-scroll min-h-0 flex-1 overflow-auto rounded-lg border bg-card p-3">
                <div
                    className="relative grid w-full min-w-[min(100%,640px)] gap-1"
                    style={{
                        gridTemplateColumns: `repeat(${DMX_UNIVERSE_GRID_COLS}, minmax(0, 1fr))`,
                        gridAutoRows: "minmax(2rem, auto)",
                    }}
                >
                    {Array.from({length: DMX_UNIVERSE_SLOTS}, (_, i) => i + 1).map((ch) => {
                        if (covered.has(ch)) {
                            return null;
                        }
                        const {row, col} = channelIndexToCell(ch);
                        return (
                            <div
                                key={`free-${ch}`}
                                className={cn(
                                    "flex items-center justify-center rounded-md border border-transparent bg-muted text-[10px] font-medium tabular-nums text-muted-foreground sm:text-xs",
                                )}
                                style={{
                                    gridRow: row + 1,
                                    gridColumn: col + 1,
                                }}
                            >
                                {padChannel(ch)}
                            </div>
                        );
                    })}

                    {sortedFixtures.flatMap((fx) => {
                        const range = universeRange(fx);
                        if (!range) {
                            return [];
                        }
                        const conflict = fixtureHasConflict(fx, occupancy);
                        const segments = splitRangeIntoSegments(range.start, range.end);
                        return segments.map((seg, segIdx) => {
                            const segStartCh = seg.row * DMX_UNIVERSE_GRID_COLS + seg.colStart + 1;
                            const showFixtureBase = segIdx === 0;
                            return (
                                <button
                                    key={`${fx.id}-${seg.row}-${seg.colStart}-${seg.span}`}
                                    type="button"
                                    className={cn(
                                        "z-10 flex min-h-8 flex-col items-start justify-start gap-0.5 rounded-md border px-1.5 py-1 text-left shadow-sm transition-colors sm:min-h-9",
                                        "bg-primary/10 border-primary/30 hover:bg-primary/15",
                                        conflict && "border-destructive ring-1 ring-destructive/40",
                                    )}
                                    style={{
                                        gridRow: seg.row + 1,
                                        gridColumn: `${seg.colStart + 1} / span ${seg.span}`,
                                    }}
                                    onClick={() => setRoute({kind: "dmxFixture", id: fx.id})}
                                    title={`Open ${fx.name}`}
                                >
                  <span className="text-[10px] font-semibold tabular-nums text-primary sm:text-xs">
                    {showFixtureBase ? padChannel(fx.dmxAddress) : padChannel(segStartCh)}
                  </span>
                                    <span
                                        className="line-clamp-2 w-full text-[10px] font-medium leading-tight text-primary/90 sm:text-xs">
                    {fx.name}
                  </span>
                                    {conflict && (
                                        <span
                                            className="mt-auto inline-flex items-center gap-0.5 text-[10px] text-destructive">
                      <PiWarningCircle className="size-3 shrink-0" aria-hidden/>
                      <span className="sr-only">Address overlap</span>
                    </span>
                                    )}
                                </button>
                            );
                        });
                    })}
                </div>
            </div>
        </div>
    );
}
