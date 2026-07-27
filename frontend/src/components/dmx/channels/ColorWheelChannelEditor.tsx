import { RotateCw, RotateCcw } from "lucide-react";
import { PiPlus, PiTrash } from "react-icons/pi";
import { type ColorWheelScrollRamp, isColorWheelScrollSlot } from "@/lib/colorWheelSlot";
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
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
    type ChannelEditorProps,
    slotColorToPickerValue,
    RAINBOW_SWATCH_CONIC,
    isRainbowModeExplicit,
} from "./ChannelBase";
import { useTranslation } from "react-i18next";

function isRainbowColorSlot(slot: { label: string; mode?: string }): boolean {
    return isColorWheelScrollSlot(slot);
}

export function ColorWheelChannelEditor({
    ch,
    originalIdx,
    propsMap,
    slots,
    updateChannelAt,
    replaceChannelAt,
    busy,
}: ChannelEditorProps) {
    const { t } = useTranslation("dmx");
    return (
        <div className="mt-3 space-y-2">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[140px] text-muted-foreground">{t("channelEditor.columnRange")}</TableHead>
                        <TableHead className="text-muted-foreground">{t("channelEditor.columnColor")}</TableHead>
                        <TableHead className="w-[200px] text-right text-muted-foreground">{t("channelEditor.columnSpeed")}</TableHead>
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
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <button
                                                type="button"
                                                className="relative size-8 shrink-0 overflow-hidden rounded-full border-2 border-border shadow-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
                                                title="Pick color"
                                            >
                                                {isRainbowColorSlot(slot) ? (
                                                    <span
                                                        aria-hidden
                                                        className="absolute inset-0 rounded-full"
                                                        style={{
                                                            background: RAINBOW_SWATCH_CONIC,
                                                        }}
                                                    />
                                                ) : (
                                                    <span
                                                        aria-hidden
                                                        className="absolute inset-0 rounded-full"
                                                        style={{
                                                            backgroundColor: slotColorToPickerValue(slot.color),
                                                        }}
                                                    />
                                                )}
                                                {slot.direction === "cw" ? (
                                                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                                        <RotateCw
                                                            className="size-3.5 text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]"
                                                            strokeWidth={2.5}
                                                            aria-hidden
                                                        />
                                                    </span>
                                                ) : slot.direction === "ccw" ? (
                                                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                                        <RotateCcw
                                                            className="size-3.5 text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]"
                                                            strokeWidth={2.5}
                                                            aria-hidden
                                                        />
                                                    </span>
                                                ) : null}
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64">
                                            <div className="grid gap-2">
                                                <Label className="text-xs">{t("channelEditor.color")}</Label>
                                                <Button
                                                    type="button"
                                                    variant={isRainbowModeExplicit(slot) ? "secondary" : "outline"}
                                                    className="h-auto min-h-10 w-full justify-start gap-2 py-2"
                                                    onClick={() => {
                                                        const next = [...slots];
                                                        next[si] = {
                                                            ...slot,
                                                            mode: "scroll",
                                                            scrollRamp: slot.scrollRamp ?? "fastToSlow",
                                                            direction: slot.direction ?? "cw",
                                                        };
                                                        updateChannelAt(originalIdx, {
                                                            properties: {
                                                                ...propsMap,
                                                                entries: next,
                                                            },
                                                        });
                                                    }}
                                                >
                                                    <span
                                                        aria-hidden
                                                        className="size-6 shrink-0 rounded-full border border-border shadow-inner"
                                                        style={{
                                                            background: RAINBOW_SWATCH_CONIC,
                                                        }}
                                                    />
                                                    <span className="text-left text-sm font-medium leading-tight">
                                                        {t("channelEditor.rainbow")}
                                                    </span>
                                                </Button>
                                                <input
                                                    type="color"
                                                    className="h-10 w-full cursor-pointer rounded border bg-background disabled:cursor-not-allowed disabled:opacity-50"
                                                    disabled={isRainbowModeExplicit(slot)}
                                                    value={slotColorToPickerValue(slot.color)}
                                                    onChange={(e) => {
                                                        const next = [...slots];
                                                        const wasRainbow =
                                                            slot.mode === "rainbow" || slot.mode === "scroll";
                                                        next[si] = {
                                                            ...slot,
                                                            color: e.target.value,
                                                            ...(wasRainbow ? { mode: undefined } : {}),
                                                        };
                                                        updateChannelAt(originalIdx, {
                                                            properties: {
                                                                ...propsMap,
                                                                entries: next,
                                                            },
                                                        });
                                                    }}
                                                />
                                                <Input
                                                    className="font-mono text-xs"
                                                    placeholder="#rrggbb"
                                                    disabled={isRainbowModeExplicit(slot)}
                                                    value={slot.color ?? ""}
                                                    onChange={(e) => {
                                                        const next = [...slots];
                                                        const wasRainbow =
                                                            slot.mode === "rainbow" || slot.mode === "scroll";
                                                        next[si] = {
                                                            ...slot,
                                                            color: e.target.value,
                                                            ...(wasRainbow ? { mode: undefined } : {}),
                                                        };
                                                        updateChannelAt(originalIdx, {
                                                            properties: {
                                                                ...propsMap,
                                                                entries: next,
                                                            },
                                                        });
                                                    }}
                                                />
                                                {isRainbowModeExplicit(slot) ? (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 text-xs"
                                                        onClick={() => {
                                                            const next = [...slots];
                                                            next[si] = {
                                                                ...slot,
                                                                mode: undefined,
                                                            };
                                                            updateChannelAt(originalIdx, {
                                                                properties: {
                                                                    ...propsMap,
                                                                    entries: next,
                                                                },
                                                            });
                                                        }}
                                                        title="Clears rainbow mode so you can edit hex again"
                                                    >
                                                        {t("channelEditor.solidColor")}
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
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
                                <div className="flex flex-wrap items-center justify-end gap-1">
                                    <NativeSelect
                                        className="h-8 max-w-[5.5rem] text-xs"
                                        value={
                                            isRainbowColorSlot(slot)
                                                ? slot.direction ?? "cw"
                                                : slot.direction ?? "none"
                                        }
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            const next = [...slots];
                                            next[si] = {
                                                ...slot,
                                                direction:
                                                    !isRainbowColorSlot(slot) && v === "none" ? undefined : v,
                                            };
                                            updateChannelAt(originalIdx, {
                                                properties: {
                                                    ...propsMap,
                                                    entries: next,
                                                },
                                            });
                                        }}
                                    >
                                        {!isRainbowColorSlot(slot) ? (
                                            <NativeSelectOption value="none">{t("channelEditor.noneDash")}</NativeSelectOption>
                                        ) : null}
                                        <NativeSelectOption value="cw">{t("channelEditor.cw")}</NativeSelectOption>
                                        <NativeSelectOption value="ccw">{t("channelEditor.ccw")}</NativeSelectOption>
                                    </NativeSelect>
                                    {isRainbowColorSlot(slot) ? (
                                        <NativeSelect
                                            className="h-8 max-w-[7.5rem] text-xs"
                                            value={slot.scrollRamp ?? "fastToSlow"}
                                            title="Velocity ramp within this DMX range"
                                            onChange={(e) => {
                                                const v = e.target.value as ColorWheelScrollRamp;
                                                const next = [...slots];
                                                next[si] = {
                                                    ...slot,
                                                    scrollRamp: v,
                                                };
                                                updateChannelAt(originalIdx, {
                                                    properties: {
                                                        ...propsMap,
                                                        entries: next,
                                                    },
                                                });
                                            }}
                                        >
                                            <NativeSelectOption value="fastToSlow">{t("channelEditor.fastToSlow")}</NativeSelectOption>
                                            <NativeSelectOption value="slowToFast">{t("channelEditor.slowToFast")}</NativeSelectOption>
                                        </NativeSelect>
                                    ) : null}
                                </div>
                            </TableCell>
                            <TableCell className="text-right align-middle">
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    title={t("channelEditor.removeSlot")}
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
                            color: "#888888",
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
