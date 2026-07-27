import { PiPlus, PiTrash } from "react-icons/pi";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { effectiveEntryLiveSlotKind } from "@/lib/dmxLiveWidget";
import { cn } from "@/lib/utils";
import {
    type ChannelEditorProps,
    EntryLiveSlotKindSelect,
} from "./ChannelBase";

export function DefaultChannelEditor({
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
    return (
        <div className="mt-3 space-y-2">
            {showSlotKindEditor && (
                <p className="text-xs text-muted-foreground">
                    {t("channelEditor.switchSliderHint")}
                </p>
            )}
            {slots.map((slot, si) => (
                <div
                    key={si}
                    className={cn(
                        "grid gap-2 rounded-md border bg-background p-2",
                        showSlotKindEditor
                            ? "sm:grid-cols-[88px_88px_1fr_108px_auto]"
                            : "sm:grid-cols-[88px_88px_1fr_auto]"
                    )}
                >
                    <div className="grid gap-1">
                        <Label className="text-xs">{t("channelEditor.from")}</Label>
                        <Input
                            type="number"
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
                    </div>
                    <div className="grid gap-1">
                        <Label className="text-xs">{t("channelEditor.to")}</Label>
                        <Input
                            type="number"
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
                    <div className="grid gap-1">
                        <Label className="text-xs">{t("channelEditor.label")}</Label>
                        <Input
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
                    {showSlotKindEditor ? (
                        <div className="grid gap-1">
                            <Label className="text-xs">{t("channelEditor.columnLiveSlot")}</Label>
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
                        </div>
                    ) : null}
                    <div className="flex items-end justify-end">
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
                    </div>
                </div>
            ))}
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
                            label: t("channelEditor.slotDefault", {index: slots.length + 1}),
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
                {t("channelEditor.addSlot")}
            </Button>
        </div>
    );
}
