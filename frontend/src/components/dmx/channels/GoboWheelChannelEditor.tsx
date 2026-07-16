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
import {
    type ChannelEditorProps,
    clamp255,
} from "./ChannelBase";

export function GoboWheelChannelEditor({
    ch,
    originalIdx,
    propsMap,
    slots,
    updateChannelAt,
    replaceChannelAt,
    setGoboPickerTarget,
    busy,
}: ChannelEditorProps) {
    return (
        <div className="mt-3 space-y-3">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[140px] text-muted-foreground">Range</TableHead>
                        <TableHead className="text-muted-foreground">Gobo</TableHead>
                        <TableHead className="w-[200px] text-right text-muted-foreground">Speed</TableHead>
                        <TableHead className="w-12" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {slots.map((slot, si) => (
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
                                <div className="flex min-w-0 items-center gap-2">
                                    <button
                                        type="button"
                                        className="relative size-10 shrink-0 overflow-hidden rounded-full border-2 border-border bg-muted shadow-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
                                        title="Choose gobo"
                                        onClick={() => {
                                            if (setGoboPickerTarget) {
                                                setGoboPickerTarget({
                                                    channelIdx: originalIdx,
                                                    slotIdx: si,
                                                });
                                            }
                                        }}
                                    >
                                        {slot.goboImage ? (
                                            <img
                                                src={slot.goboImage}
                                                alt=""
                                                className="size-full object-cover"
                                            />
                                        ) : (
                                            <span className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                                                ∅
                                            </span>
                                        )}
                                    </button>
                                    <Input
                                        className="h-8 min-w-0 flex-1"
                                        value={slot.label}
                                        onChange={(e) => {
                                            const next = [...slots];
                                            next[si] = {
                                                ...slot,
                                                label: e.target.value,
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
                            <TableCell className="text-right align-middle">
                                <div className="flex items-center justify-end gap-1">
                                    <NativeSelect
                                        className="h-8 max-w-[5.5rem] text-xs"
                                        value={slot.direction ?? "none"}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            const next = [...slots];
                                            next[si] = {
                                                ...slot,
                                                direction: v === "none" ? undefined : v,
                                            };
                                            updateChannelAt(originalIdx, {
                                                properties: {
                                                    ...propsMap,
                                                    entries: next,
                                                },
                                            });
                                        }}
                                    >
                                        <NativeSelectOption value="none">—</NativeSelectOption>
                                        <NativeSelectOption value="cw">CW</NativeSelectOption>
                                        <NativeSelectOption value="ccw">CCW</NativeSelectOption>
                                    </NativeSelect>
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
                    ))}
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
                            label: `Slot ${slots.length + 1}`,
                            goboIdentifier: "",
                            goboName: "",
                            goboImage: "",
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
