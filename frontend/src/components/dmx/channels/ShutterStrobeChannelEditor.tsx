import { ArrowUpRight, Minus, Zap, Triangle } from "lucide-react";
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
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import {
    type ChannelEditorProps,
    clamp255,
    getShutterModeOptions,
    EntryLiveSlotKindSelect,
} from "./ChannelBase";

function shutterSelectValue(mode: string | undefined): string {
    const m = mode ?? "";
    return getShutterModeOptions().some((o) => o.value === m) ? m : "open";
}

function ShutterStateGlyph({ mode }: { mode?: string }) {
    const m = (mode ?? "").toLowerCase();
    if (m === "closed") {
        return <div className="size-6 shrink-0 rounded-full bg-foreground" aria-hidden />;
    }
    if (m === "open") {
        return (
            <div
                className="size-6 shrink-0 rounded-full border-2 border-foreground bg-background"
                aria-hidden
            />
        );
    }
    if (m === "strobe" || m === "randomstrobe") {
        return <Zap className="size-6 shrink-0 text-foreground" strokeWidth={2.25} aria-hidden />;
    }
    if (m === "pulse") {
        return (
            <Triangle
                className="size-6 shrink-0 fill-foreground text-foreground"
                strokeWidth={1.5}
                aria-hidden
            />
        );
    }
    return (
        <div
            className="size-6 shrink-0 rounded-full border border-dashed border-muted-foreground"
            aria-hidden
        />
    );
}

export function ShutterStrobeChannelEditor({
    ch,
    originalIdx,
    propsMap,
    slots,
    updateChannelAt,
    replaceChannelAt,
    showSlotKindEditor,
    busy,
}: ChannelEditorProps) {
    const { t } = useTranslation("dmx");
    const shutterModeOptions = getShutterModeOptions();
    return (
        <div className="mt-3 space-y-2">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[140px] text-muted-foreground">{t("channelEditor.range")}</TableHead>
                        <TableHead className="text-muted-foreground">{t("channelEditor.state")}</TableHead>
                        <TableHead className="w-[200px] text-right text-muted-foreground">{t("channelEditor.speed")}</TableHead>
                        {showSlotKindEditor ? (
                            <TableHead className="w-[108px] text-muted-foreground">{t("channelEditor.liveSlot")}</TableHead>
                        ) : null}
                        <TableHead className="w-12" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {slots.map((slot, si) => {
                        const sm = (slot.mode ?? "").toLowerCase();
                        const speedExtra =
                            sm === "strobe" || sm === "randomstrobe" ? (
                                <span
                                    className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary"
                                    title={t("channelEditor.speedRamp")}
                                    aria-hidden
                                >
                                    <ArrowUpRight className="size-4" strokeWidth={2.5} />
                                </span>
                            ) : sm === "pulse" ? (
                                <span
                                    className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary"
                                    title={t("channelEditor.pulseWidth")}
                                    aria-hidden
                                >
                                    <Minus className="size-4" strokeWidth={2.5} />
                                </span>
                            ) : null;
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
                                    <div className="flex min-w-0 items-center gap-2">
                                        <ShutterStateGlyph mode={slot.mode} />
                                        <NativeSelect
                                            className="h-8 min-w-0 flex-1 text-sm"
                                            value={shutterSelectValue(slot.mode)}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                const cue = shutterModeOptions.find((o) => o.value === v);
                                                const next = [...slots];
                                                next[si] = {
                                                    ...slot,
                                                    mode: v,
                                                    label: cue?.label ?? slot.label,
                                                };
                                                updateChannelAt(originalIdx, {
                                                    properties: {
                                                        ...propsMap,
                                                        entries: next,
                                                    },
                                                });
                                            }}
                                        >
                                            {shutterModeOptions.map((o) => (
                                                <NativeSelectOption key={o.value} value={o.value}>
                                                    {o.label}
                                                </NativeSelectOption>
                                            ))}
                                        </NativeSelect>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right align-middle">
                                    <div className="flex items-center justify-end gap-1">
                                        {speedExtra}
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
                            label: i18n.t("dmx:channelBase.shutterMode.open"),
                            mode: "open",
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
                {t("channelEditor.addProperty")}
            </Button>
        </div>
    );
}
