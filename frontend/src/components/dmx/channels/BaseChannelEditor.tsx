import { EyeOff } from "lucide-react";
import { PiTrash } from "react-icons/pi";
import type { DMXChannel, DMXChannelType, JSONMap } from "@/types/controller.ts";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { readCustomPartyInclude } from "@/lib/dmxPartyInclude";
import { readChannelInvert } from "@/lib/dmxLiveMap";
import {
    isInvertiblePanTiltChannel,
    liveWidgetHiddenBadgeLabel,
    liveWidgetHiddenSource,
    resolveLiveWidget,
} from "@/lib/dmxLiveWidget";
import { cn } from "@/lib/utils";

import {
    parseEntries,
    usesSlots,
    defaultPropsForType,
    MOTION_TABLE_TYPES,
} from "./ChannelBase";

import { CustomChannelEditor } from "./CustomChannelEditor";
import { ColorWheelChannelEditor } from "./ColorWheelChannelEditor";
import { GoboWheelChannelEditor } from "./GoboWheelChannelEditor";
import { ShutterStrobeChannelEditor } from "./ShutterStrobeChannelEditor";
import { MotionChannelEditor } from "./MotionChannelEditor";
import { DefaultChannelEditor } from "./DefaultChannelEditor";

export const DMX_CHANNEL_TYPES: DMXChannelType[] = [
    "colorComponent",
    "colorTemperature",
    "colorTemperatureFine",
    "colorWheel",
    "command",
    "custom",
    "dimmer",
    "dimmerFine",
    "fog",
    "focus",
    "focusFine",
    "frost",
    "frostFine",
    "goboIndexing",
    "goboIndexingFine",
    "goboRotation",
    "goboRotationFine",
    "goboShake",
    "goboWheel",
    "greenSaturation",
    "greenSaturationFine",
    "infinitePan",
    "infiniteTilt",
    "iris",
    "irisFine",
    "lamp",
    "movementSpeed",
    "onOff",
    "operatingMode",
    "pan",
    "panFine",
    "prism",
    "prismIndexing",
    "prismIndexingFine",
    "prismRotation",
    "shutterStrobe",
    "tilt",
    "tiltFine",
    "timer",
    "xfadeToColor",
    "xfadeToColorFine",
    "zoom",
    "zoomFine",
];

interface BaseChannelEditorProps {
    ch: DMXChannel;
    originalIdx: number;
    slotBudget: number;
    isDuplicateOffset: boolean;
    busy: boolean;
    channelsLength: number;
    updateChannelAt: (originalIdx: number, patch: Partial<DMXChannel>) => void;
    replaceChannelAt: (originalIdx: number, next: DMXChannel) => void;
    removeChannelAt: (originalIdx: number) => void;
    setGoboPickerTarget?: (target: { channelIdx: number; slotIdx: number } | null) => void;
}

export function BaseChannelEditor({
    ch,
    originalIdx,
    slotBudget,
    isDuplicateOffset,
    busy,
    channelsLength,
    updateChannelAt,
    replaceChannelAt,
    removeChannelAt,
    setGoboPickerTarget,
}: BaseChannelEditorProps) {
    const propsMap = (ch.properties ?? {}) as JSONMap;
    const slots = parseEntries(propsMap);
    const slotMode = usesSlots(propsMap);
    const resolvedLiveWidget = resolveLiveWidget(ch);
    const liveHiddenSource = liveWidgetHiddenSource(ch);
    const showSlotKindEditor = resolvedLiveWidget === "buttonSlider" && slotMode && slots.length > 0;
    const minV = typeof propsMap.min === "number" ? propsMap.min : Number(propsMap.min) || 0;
    const maxV = typeof propsMap.max === "number" ? propsMap.max : Number(propsMap.max) || 255;

    const childProps = {
        ch,
        originalIdx,
        propsMap,
        slots,
        slotMode,
        showSlotKindEditor,
        updateChannelAt,
        replaceChannelAt,
        busy,
        setGoboPickerTarget,
    };

    return (
        <div
            className={cn(
                "rounded-lg border bg-muted/20 p-3 shadow-sm",
                liveHiddenSource && "border-amber-500/35 bg-amber-500/[0.04] dark:bg-amber-500/[0.06]",
                isDuplicateOffset && "border-destructive/40 bg-destructive/[0.04]"
            )}
        >
            <div className="flex flex-wrap items-end gap-2">
                {isDuplicateOffset ? (
                    <Badge variant="outline" className="mb-5 border-destructive/50 text-[10px] text-destructive">
                        Duplicate offset
                    </Badge>
                ) : null}
                {liveHiddenSource ? (
                    <Badge
                        variant="outline"
                        className="mb-5 gap-1 border-amber-600/45 bg-amber-500/10 text-[10px] text-amber-900 dark:text-amber-200"
                        title="This channel has no tile on the live tab"
                    >
                        <EyeOff className="size-3 shrink-0" aria-hidden />
                        {liveWidgetHiddenBadgeLabel(liveHiddenSource)}
                    </Badge>
                ) : null}
                <div className="grid w-[88px] shrink-0 gap-1">
                    <Label className="text-xs">Offset</Label>
                    <Input
                        type="number"
                        min={1}
                        max={slotBudget}
                        value={ch.channel}
                        onChange={(e) => {
                            const v = Math.round(Number(e.target.value) || 1);
                            replaceChannelAt(originalIdx, {
                                ...ch,
                                channel: Math.max(1, Math.min(slotBudget, v)),
                            });
                        }}
                    />
                </div>
                <div className="grid w-[108px] shrink-0 gap-1">
                    <Label className="text-xs">Default</Label>
                    <Input
                        type="number"
                        min={0}
                        max={255}
                        value={ch.defaultValue ?? ""}
                        onChange={(e) => {
                            const raw = e.target.value.trim();
                            const nextDefault =
                                raw === "" ? undefined : Math.max(0, Math.min(255, Math.round(Number(raw) || 0)));
                            updateChannelAt(originalIdx, { defaultValue: nextDefault });
                        }}
                        onBlur={(e) => {
                            if (!e.target.value.trim()) {
                                updateChannelAt(originalIdx, { defaultValue: undefined });
                            }
                        }}
                        placeholder="0-255"
                    />
                </div>
                <div className="min-w-0 flex-1 basis-[200px] grid gap-1">
                    <Label className="text-xs">Function</Label>
                    <NativeSelect
                        value={ch.type}
                        onChange={(e) => {
                            const nextType = e.target.value as DMXChannelType;
                            replaceChannelAt(originalIdx, {
                                channel: ch.channel,
                                type: nextType,
                                defaultValue: ch.defaultValue,
                                properties: defaultPropsForType(nextType),
                            });
                        }}
                    >
                        {DMX_CHANNEL_TYPES.map((t) => (
                            <NativeSelectOption key={t} value={t}>
                                {t}
                            </NativeSelectOption>
                        ))}
                    </NativeSelect>
                </div>
                <ButtonGroup className="ml-auto shrink-0">
                    <Button
                        type="button"
                        size="sm"
                        variant={!slotMode ? "secondary" : "outline"}
                        onClick={() => {
                            replaceChannelAt(originalIdx, {
                                ...ch,
                                properties: { min: minV, max: maxV },
                            });
                        }}
                    >
                        Linear range
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant={slotMode ? "secondary" : "outline"}
                        onClick={() => {
                            const nextEntries =
                                slots.length > 0
                                    ? slots
                                    : [
                                          {
                                              from: 0,
                                              to: 255,
                                              label: "Slot 1",
                                          },
                                      ];
                            replaceChannelAt(originalIdx, {
                                ...ch,
                                properties: {
                                    entries: nextEntries.map((s) => ({ ...s })),
                                },
                            });
                        }}
                    >
                        Discrete slots
                    </Button>
                </ButtonGroup>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-destructive hover:text-destructive"
                    title="Remove channel"
                    onClick={() => removeChannelAt(originalIdx)}
                    disabled={busy || channelsLength <= 1}
                >
                    <PiTrash className="size-4" />
                </Button>
            </div>

            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                    checked={readCustomPartyInclude(propsMap)}
                    onCheckedChange={(checked) => {
                        updateChannelAt(originalIdx, {
                            properties: {
                                ...propsMap,
                                partyInclude: checked === true,
                            },
                        });
                    }}
                    disabled={busy}
                />
                <span>Include in party mode</span>
            </label>

            {isInvertiblePanTiltChannel(ch) && !slotMode ? (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                        checked={readChannelInvert(propsMap)}
                        onCheckedChange={(checked) => {
                            const nextProps = { ...propsMap };
                            if (checked === true) {
                                nextProps.invert = true;
                            } else {
                                delete nextProps.invert;
                            }
                            updateChannelAt(originalIdx, { properties: nextProps });
                        }}
                        disabled={busy}
                    />
                    <span>Invert axis</span>
                    <span className="text-[10px] text-muted-foreground">
                        (reverses DMX direction for this channel)
                    </span>
                </label>
            ) : null}

            {/* Sub-editors based on channel type */}
            {ch.type === "custom" ? (
                <CustomChannelEditor {...childProps} />
            ) : ch.type === "colorWheel" ? (
                <ColorWheelChannelEditor {...childProps} />
            ) : ch.type === "goboWheel" ? (
                <GoboWheelChannelEditor {...childProps} />
            ) : ch.type === "shutterStrobe" ? (
                <ShutterStrobeChannelEditor {...childProps} />
            ) : MOTION_TABLE_TYPES.has(ch.type) ? (
                <MotionChannelEditor {...childProps} />
            ) : slotMode ? (
                <DefaultChannelEditor {...childProps} />
            ) : !slotMode ? (
                !(maxV === 255 && (minV === 0 || minV === 1)) ? (
                    <div className="mt-3 max-w-md">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-1">
                                <Label className="text-xs">Min DMX</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={255}
                                    value={minV}
                                    onChange={(e) => {
                                        const v = Math.round(Number(e.target.value) || 0);
                                        updateChannelAt(originalIdx, {
                                            properties: {
                                                ...propsMap,
                                                min: Math.max(0, Math.min(255, v)),
                                                max: maxV,
                                            },
                                        });
                                    }}
                                />
                            </div>
                            <div className="grid gap-1">
                                <Label className="text-xs">Max DMX</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={255}
                                    value={maxV}
                                    onChange={(e) => {
                                        const v = Math.round(Number(e.target.value) || 255);
                                        updateChannelAt(originalIdx, {
                                            properties: {
                                                ...propsMap,
                                                min: minV,
                                                max: Math.max(0, Math.min(255, v)),
                                            },
                                        });
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                ) : null
            ) : null}
            <Separator className="my-3" />
        </div>
    );
}
