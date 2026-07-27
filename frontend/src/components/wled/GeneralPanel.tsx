import {type Dispatch, type SetStateAction, useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {PiFire, PiIceCream, PiMoon, PiPalette, PiSun} from "react-icons/pi";
import * as GoldbusLightService from "../../../bindings/goldbus/internal/service/goldbuslightservice.ts";
import {readNumber} from "@/lib/json.ts";
import {
    isColdWhiteRgb,
    isNamedDropdownColorRgb,
    isWarmWhiteRgb,
    NAMED_LIGHT_PRESETS,
    rgbEquals,
} from "@/lib/wled.ts";
import type {JSONMap, WLEDDevice, WLEDDeviceDetail} from "@/types/controller.ts";
import {EffectPickerModal} from "@/components/wled/device/EffectPickerModal.tsx";
import {PalettePickerModal} from "@/components/wled/device/PalettePickerModal.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Slider} from "@/components/ui/slider.tsx";
import {HueSlider} from "@/components/ui/hue-slider.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx";
import {Label} from "@/components/ui/label.tsx";
import {cn} from "@/lib/utils.ts";

export type PresetsPanelProps = {
    devices: WLEDDevice[];
    presetBri: number;
    setPresetBri: Dispatch<SetStateAction<number>>;
    presetRgb: [number, number, number];
    setPresetRgb: Dispatch<SetStateAction<[number, number, number]>>;
    onSetGlobalState: (state: JSONMap, label: string, options?: { skipSnapshotReload?: boolean }) => void;
    onToggleOneDevice: (deviceId: string) => void;
    applyWarmWhitePreset: () => void;
    applyColdWhitePreset: () => void;
    applyNamedColorPreset: (label: string, rgb: [number, number, number]) => void;
    generalFx: number;
    setGeneralFx: Dispatch<SetStateAction<number>>;
    generalPal: number;
    setGeneralPal: Dispatch<SetStateAction<number>>;
    generalSx: number;
    setGeneralSx: Dispatch<SetStateAction<number>>;
    generalIx: number;
    setGeneralIx: Dispatch<SetStateAction<number>>;
};

export function GeneralPanel({
                                 devices,
                                 presetBri,
                                 setPresetBri,
                                 presetRgb,
                                 setPresetRgb,
                                 onSetGlobalState,
                                 onToggleOneDevice,
                                 applyWarmWhitePreset,
                                 applyColdWhitePreset,
                                 applyNamedColorPreset,
                                 generalFx,
                                 setGeneralFx,
                                 generalPal,
                                 setGeneralPal,
                                 generalSx,
                                 setGeneralSx,
                                 generalIx,
                                 setGeneralIx,
                             }: PresetsPanelProps) {
    const {t} = useTranslation("wled");
    const [effectModalOpen, setEffectModalOpen] = useState(false);
    const [paletteModalOpen, setPaletteModalOpen] = useState(false);
    const [effectNames, setEffectNames] = useState<string[]>([]);
    const [paletteNames, setPaletteNames] = useState<string[]>([]);
    const activeDevices = useMemo(() => devices.filter((d) => !d.ignored), [devices]);
    const allOff = useMemo(() => {
        const known: boolean[] = [];
        for (const d of activeDevices) {
            const last = d.lastState as JSONMap | undefined;
            if (last && typeof last.on === "boolean") known.push(last.on);
        }
        return known.length > 0 && known.every((on) => !on);
    }, [activeDevices]);
    const firstOnlineDevice = useMemo(() => activeDevices.find((d) => d.online), [activeDevices]);

    useEffect(() => {
        if (!firstOnlineDevice) {
            setEffectNames([]);
            setPaletteNames([]);
            return;
        }
        void (async () => {
            try {
                const detail = (await GoldbusLightService.GetDeviceDetail(firstOnlineDevice.id)) as WLEDDeviceDetail;
                setEffectNames(Array.isArray(detail.effects) ? detail.effects : []);
                setPaletteNames(Array.isArray(detail.palettes) ? detail.palettes : []);
            } catch {
                setEffectNames([]);
                setPaletteNames([]);
            }
        })();
    }, [firstOnlineDevice?.id]);
    const hueValue = rgbToHue(presetRgb[0], presetRgb[1], presetRgb[2]);
    const controlsDisabled = activeDevices.length === 0;
    const brightnessPercent = Math.round((presetBri / 255) * 100) || 0;
    const warmWhiteActive = isWarmWhiteRgb(presetRgb);
    const coldWhiteActive = isColdWhiteRgb(presetRgb);
    const namedColorActive = isNamedDropdownColorRgb(presetRgb);


    return (
        <div className="space-y-6 w-full max-w-none">
            <Card>

                <CardHeader>
                    <CardTitle>{t("general.colorBrightness")}</CardTitle>
                </CardHeader>

                <CardContent className="gap-4">
                    <div className="flex w-full min-w-0 gap-2">
                        <Button
                            type="button"
                            variant={allOff ? "destructive" : "default"}
                            size="sm"
                            className="min-w-0 flex-1 gap-1 px-2 sm:px-4"
                            onClick={() =>
                                allOff
                                    ? onSetGlobalState({on: true, seg: [{fx: 0, pal: 0}]}, t("general.allOnLabel"))
                                    : onSetGlobalState({
                                        on: false,
                                        seg: [{fx: 0, pal: 0}]
                                    }, t("general.allOffLabel"))
                            }
                            disabled={controlsDisabled}
                        >
                            {allOff ? <PiMoon/> : <PiSun/>}
                            {allOff ? t("general.allOff") : t("general.allOn")}
                        </Button>
                        <Button
                            type="button"
                            variant={warmWhiteActive ? "default" : "secondary"}
                            size="sm"
                            className="min-w-0 flex-1 gap-1 px-2 sm:px-4"
                            aria-pressed={warmWhiteActive}
                            onClick={applyWarmWhitePreset}
                        >
                            <PiFire/>
                            {t("general.warmWhite")}
                        </Button>
                        <Button
                            type="button"
                            variant={coldWhiteActive ? "default" : "secondary"}
                            size="sm"
                            className="min-w-0 flex-1 gap-1 px-2 sm:px-4"
                            aria-pressed={coldWhiteActive}
                            onClick={applyColdWhitePreset}
                        >
                            <PiIceCream/>
                            {t("general.coldWhite")}
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant={namedColorActive ? "default" : "secondary"}
                                    size="sm"
                                    className="min-w-0 flex-1 gap-1 px-2 sm:px-4"
                                    aria-pressed={namedColorActive}
                                >
                                    <PiPalette/>
                                    {t("general.color")}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-max">
                                {NAMED_LIGHT_PRESETS.map(({name, rgb}) => (
                                    <DropdownMenuItem
                                        key={name}
                                        className={cn(
                                            "flex w-full items-center gap-2 whitespace-nowrap text-left",
                                            rgbEquals(presetRgb, rgb) && "bg-accent font-medium",
                                        )}
                                        disabled={controlsDisabled}
                                        aria-current={rgbEquals(presetRgb, rgb) ? "true" : undefined}
                                        onClick={() => {
                                            applyNamedColorPreset(name, rgb);
                                        }}
                                    >
                                            <span
                                                className="h-4 w-4 shrink-0 rounded-sm border"
                                                style={{
                                                    backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
                                                }}
                                                aria-hidden
                                            />
                                        <span>{name}</span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>


                    <div className="flex flex-wrap items-center gap-4 mt-4">
                        <label className="flex w-full min-w-50 flex-col gap-1">
                            <span className="text-xs opacity-70">{t("general.color")}</span>
                            <HueSlider
                                value={hueValue}
                                onChange={(nextHue) => setPresetRgb(hueToRgb(nextHue))}
                                disabled={controlsDisabled}
                            />
                        </label>

                        <label className="flex w-full min-w-50 flex-col gap-1">
                            <span
                                className="text-xs opacity-70">{t("general.brightness", {percent: brightnessPercent})}</span>
                            <Slider
                                min={1}
                                max={255}
                                value={[presetBri]}
                                onValueChange={(value) => setPresetBri(readNumber(value[0], 200))}
                                disabled={controlsDisabled}
                            />
                        </label>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>{t("general.effectPalette")}</CardTitle>
                </CardHeader>
                <CardContent className="gap-4">
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label className="text-xs">{t("general.effect")}</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-auto min-h-10 w-full justify-start text-left"
                                disabled={controlsDisabled}
                                onClick={() => setEffectModalOpen(true)}
                            >
                                <span className="block truncate">
                                    {generalFx}
                                    {effectNames[generalFx] != null ? `: ${effectNames[generalFx]}` : ""}
                                </span>
                            </Button>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">{t("general.palette")}</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-auto min-h-10 w-full justify-start text-left"
                                disabled={controlsDisabled}
                                onClick={() => setPaletteModalOpen(true)}
                            >
                                <span className="block truncate">
                                    {generalPal}
                                    {paletteNames[generalPal] != null ? `: ${paletteNames[generalPal]}` : ""}
                                </span>
                            </Button>
                        </div>
                    </div>

                    <EffectPickerModal
                        open={effectModalOpen}
                        onClose={() => setEffectModalOpen(false)}
                        effectNames={effectNames}
                        selectedIndex={generalFx}
                        disabled={controlsDisabled}
                        onPick={(idx) => {
                            setGeneralFx(idx);
                        }}
                    />

                    <PalettePickerModal
                        open={paletteModalOpen}
                        onClose={() => setPaletteModalOpen(false)}
                        paletteNames={paletteNames}
                        selectedIndex={generalPal}
                        disabled={controlsDisabled}
                        onPick={(idx) => {
                            setGeneralPal(idx);
                        }}
                    />
                    <div className="grid gap-3 md:grid-cols-2 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs">{t("general.speed", {value: generalSx})}</Label>
                            <Slider
                                min={0}
                                max={255}
                                value={[generalSx]}
                                onValueChange={(value) => setGeneralSx(readNumber(value[0], 128))}
                                disabled={controlsDisabled}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">{t("general.intensity", {value: generalIx})}</Label>
                            <Slider
                                min={0}
                                max={255}
                                value={[generalIx]}
                                onValueChange={(value) => setGeneralIx(readNumber(value[0], 128))}
                                disabled={controlsDisabled}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function hueToRgb(hue: number): [number, number, number] {
    const h = ((hue % 360) + 360) % 360;
    const c = 1;
    const x = 1 - Math.abs(((h / 60) % 2) - 1);
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) {
        r = c;
        g = x;
        b = 0;
    } else if (h < 120) {
        r = x;
        g = c;
        b = 0;
    } else if (h < 180) {
        r = 0;
        g = c;
        b = x;
    } else if (h < 240) {
        r = 0;
        g = x;
        b = c;
    } else if (h < 300) {
        r = x;
        g = 0;
        b = c;
    } else {
        r = c;
        g = 0;
        b = x;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHue(r: number, g: number, b: number): number {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    if (delta === 0) {
        return 0;
    }
    let hue = 0;
    if (max === rn) {
        hue = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
        hue = 60 * (((bn - rn) / delta) + 2);
    } else {
        hue = 60 * (((rn - gn) / delta) + 4);
    }
    if (hue < 0) {
        hue += 360;
    }
    return Math.round(hue);
}
