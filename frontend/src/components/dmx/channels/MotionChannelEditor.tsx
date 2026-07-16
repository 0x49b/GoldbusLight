import { type ReactNode } from "react";
import { ArrowDownRight, RotateCw, RotateCcw } from "lucide-react";
import { PiPlus, PiTrash } from "react-icons/pi";
import {
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { effectiveEntryLiveSlotKind } from "@/lib/dmxLiveWidget";
import {
    type ChannelEditorProps,
    clamp255,
    MOTION_STATE_OPTIONS,
    motionStateCueId,
    EntryLiveSlotKindSelect,
} from "./ChannelBase";

export function MotionChannelEditor({
    ch,
    originalIdx,
    propsMap,
    slots,
    updateChannelAt,
    replaceChannelAt,
    showSlotKindEditor,
    busy,
}: ChannelEditorProps) {
    return (
        <div className="mt-3 space-y-2">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[140px] text-muted-foreground">Range</TableHead>
                        <TableHead className="text-muted-foreground">State</TableHead>
                        <TableHead className="w-[200px] text-right text-muted-foreground">Speed</TableHead>
                        {showSlotKindEditor ? (
                            <TableHead className="w-[108px] text-muted-foreground">Live slot</TableHead>
                        ) : null}
                        <TableHead className="w-12" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {slots.map((slot, si) => {
                        const m = (slot.mode ?? "").toLowerCase();
                        const d = (slot.direction ?? "").toLowerCase();
                        let speedChip: ReactNode = null;
                        if (m === "vector") {
                            speedChip = (
                                <span
                                    className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary"
                                    title="Vector"
                                    aria-hidden
                                >
                                    <ArrowDownRight className="size-4" strokeWidth={2.5} />
                                </span>
                            );
                        } else if ((m === "slow" || m === "fast") && d === "cw") {
                            speedChip = (
                                <span
                                    className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary"
                                    title="Clockwise"
                                    aria-hidden
                                >
                                    <RotateCw className="size-4" strokeWidth={2.5} />
                                </span>
                            );
                        } else if ((m === "slow" || m === "fast") && d === "ccw") {
                            speedChip = (
                                <span
                                    className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary"
                                    title="Counter-clockwise"
                                    aria-hidden
                                >
                                    <RotateCcw className="size-4" strokeWidth={2.5} />
                                </span>
                            );
                        }
                        return (
                            <TableRow key={si}>
                                <TableCell className="align-middle">
                                    <div className="flex items-center gap-1">
                                        <Input
                                            type="number"
                                            className="h-8 w-14 px-1"
                                            min={0}
                                            max={255}
                                            value={slot.from}
                                            onChange={(e) => {
                                                const v = Math.round(Number(e.target.value) || 0);
                                                const next = [...slots];
                                                next[si] = {
                                                    ...slot,
                                                    from: Math.max(0, Math.min(255, v)),
                                                };
                                                updateChannelAt(originalIdx, {
                                                    properties: {
                                                        ...propsMap,
                                                        entries: next,
                                                    },
                                                });
                                            }}
                                        />
                                        <span className="text-muted-foreground">–</span>
                                        <Input
                                            type="number"
                                            className="h-8 w-14 px-1"
                                            min={0}
                                            max={255}
                                            value={slot.to}
                                            onChange={(e) => {
                                                const v = Math.round(Number(e.target.value) || 0);
                                                const next = [...slots];
                                                next[si] = {
                                                    ...slot,
                                                    to: Math.max(0, Math.min(255, v)),
                                                };
                                                updateChannelAt(originalIdx, {
                                                    properties: {
                                                        ...propsMap,
                                                        entries: next,
                                                    },
                                                });
                                            }}
                                        />
                                    </div>
                                </TableCell>
                                <TableCell className="align-middle">
                                    <NativeSelect
                                        className="h-8 w-full min-w-0 text-sm"
                                        value={motionStateCueId(slot)}
                                        onChange={(e) => {
                                            const id = e.target.value;
                                            const opt = MOTION_STATE_OPTIONS.find((o) => o.id === id);
                                            if (!opt) {
                                                return;
                                            }
                                            const next = [...slots];
                                            next[si] = {
                                                ...slot,
                                                label: opt.label,
                                                mode: opt.mode,
                                                direction: opt.direction,
                                            };
                                            updateChannelAt(originalIdx, {
                                                properties: {
                                                    ...propsMap,
                                                    entries: next,
                                                },
                                            });
                                        }}
                                    >
                                        {MOTION_STATE_OPTIONS.map((o) => (
                                            <NativeSelectOption key={o.id} value={o.id}>
                                                {o.label}
                                            </NativeSelectOption>
                                        ))}
                                    </NativeSelect>
                                </TableCell>
                                <TableCell className="text-right align-middle">
                                    <div className="flex items-center justify-end gap-1">
                                        {speedChip}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon-sm"
                                            className="size-8"
                                            onClick={() => {
                                                const next = [...slots];
                                                const base = slot.numeric ?? 0;
                                                next[si] = {
                                                    ...slot,
                                                    numeric: clamp255(base - 1),
                                                };
                                                updateChannelAt(originalIdx, {
                                                    properties: {
                                                        ...propsMap,
                                                        entries: next,
                                                    },
                                                });
                                            }}
                                        >
                                            −
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon-sm"
                                            className="size-8"
                                            onClick={() => {
                                                const next = [...slots];
                                                const base = slot.numeric ?? 0;
                                                next[si] = {
                                                    ...slot,
                                                    numeric: clamp255(base + 1),
                                                };
                                                updateChannelAt(originalIdx, {
                                                    properties: {
                                                        ...propsMap,
                                                        entries: next,
                                                    },
                                                });
                                            }}
                                        >
                                            +
                                        </Button>
                                    </div>
                                </TableCell>
                                {showSlotKindEditor ? (
                                    <TableCell className="align-middle">
                                        <EntryLiveSlotKindSelect
                                            value={effectiveEntryLiveSlotKind(slot, slot.liveSlotKind, si)}
                                            disabled={busy}
                                            onChange={(kind) => {
                                                const next = [...slots];
                                                next[si] = {
                                                    ...slot,
                                                    liveSlotKind: kind,
                                                };
                                                updateChannelAt(originalIdx, {
                                                    properties: {
                                                        ...propsMap,
                                                        entries: next,
                                                    },
                                                });
                                            }}
                                        />
                                    </TableCell>
                                ) : null}
                                <TableCell className="text-right align-middle">
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        title="Remove slot"
                                        onClick={() => {
                                            const next = slots.filter((_, j) => j !== si);
                                            if (next.length === 0) {
                                                replaceChannelAt(originalIdx, {
                                                    ...ch,
                                                    properties: {
                                                        min: 1,
                                                        max: 255,
                                                    },
                                                });
                                                return;
                                            }
                                            updateChannelAt(originalIdx, {
                                                properties: {
                                                    ...propsMap,
                                                    entries: next,
                                                },
                                            });
                                        }}
                                    >
                                        <PiTrash className="size-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
            <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                    const last = slots[slots.length - 1];
                    const start = last ? Math.min(255, last.to + 1) : 0;
                    const next = [
                        ...slots,
                        {
                            from: start,
                            to: Math.min(255, start + 15),
                            label: "Slow CW",
                            mode: "slow",
                            direction: "cw",
                            numeric: 0,
                        },
                    ];
                    updateChannelAt(originalIdx, {
                        properties: {
                            ...propsMap,
                            entries: next,
                        },
                    });
                }}
            >
                <PiPlus className="mr-1 inline size-4" aria-hidden />
                Add property
            </Button>
        </div>
    );
}
