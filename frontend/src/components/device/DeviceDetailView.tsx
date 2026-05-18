import {type Dispatch, type SetStateAction, useState} from "react";
import {
    PiArrowClockwise,
    PiFire,
    PiIceCream,
    PiPalette,
    PiPencil,
    PiPower,
    PiTrash,
    PiX
} from "react-icons/pi";
import {prettyJSON, readNumber} from "@/lib/json.ts";
import {
    BLACK_LIGHT_FLUORESCENT_RGB,
    CANDLE_LIGHT_RGB,
    CLEAR_BLUE_SKY_RGB,
    COLD_WHITE_RGB,
    DAYLIGHT_WHITE_RGB,
    DIRECT_SUNLIGHT_RGB,
    FROSTY_WHITE_RGB,
    SUPER_WARM_RGB,
    WARM_WHITE_RGB,
    WHITE_RGB
} from "@/lib/wled.ts";
import type {JSONMap, WLEDDevice, WLEDDeviceDetail} from "@/types/controller.ts";
import {EffectPickerModal} from "./EffectPickerModal";
import {PalettePickerModal} from "./PalettePickerModal";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Badge} from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import {Spinner} from "@/components/ui/spinner";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {Slider} from "@/components/ui/slider";
import {HueSlider} from "@/components/ui/hue-slider";

const NAMED_LIGHT_PRESETS: ReadonlyArray<{ name: string; rgb: [number, number, number] }> = [
    {name: "1300K Candle Light", rgb: CANDLE_LIGHT_RGB},
    {name: "2200K Super Warm", rgb: SUPER_WARM_RGB},
    {name: "2700K Warm White", rgb: WARM_WHITE_RGB},
    {name: "4300K Daylight White", rgb: DAYLIGHT_WHITE_RGB},
    {name: "5300K White", rgb: WHITE_RGB},
    {name: "7000K Frosty White", rgb: FROSTY_WHITE_RGB},
    {name: "Cold White", rgb: COLD_WHITE_RGB},
    {name: "Black Light Fluorescent", rgb: BLACK_LIGHT_FLUORESCENT_RGB},
    {name: "Clear Blue Sky", rgb: CLEAR_BLUE_SKY_RGB},
    {name: "Direct Sunlight", rgb: DIRECT_SUNLIGHT_RGB},
];

export type DeviceDetailViewProps = {
    device: WLEDDevice | undefined;
    deviceDetail: WLEDDeviceDetail | null;
    deviceDetailInitializing: boolean;
    deviceDetailReloading: boolean;
    deviceDetailFetchAttempt: number;
    deviceDetailFetchMax: number;
    busy: boolean;
    editingDeviceName: boolean;
    setEditingDeviceName: Dispatch<SetStateAction<boolean>>;
    deviceNameDraft: string;
    setDeviceNameDraft: Dispatch<SetStateAction<string>>;
    selectedSegIdx: number;
    setSelectedSegIdx: Dispatch<SetStateAction<number>>;
    deviceFormFx: number;
    setDeviceFormFx: Dispatch<SetStateAction<number>>;
    deviceFormPal: number;
    setDeviceFormPal: Dispatch<SetStateAction<number>>;
    deviceFormSx: number;
    setDeviceFormSx: Dispatch<SetStateAction<number>>;
    deviceFormIx: number;
    setDeviceFormIx: Dispatch<SetStateAction<number>>;
    deviceFormRgb: [number, number, number];
    setDeviceFormRgb: Dispatch<SetStateAction<[number, number, number]>>;
    deviceFormBri: number;
    setDeviceFormBri: Dispatch<SetStateAction<number>>;
    deviceFormTransition: number;
    setDeviceFormTransition: Dispatch<SetStateAction<number>>;
    onRefreshDevice: (id: string) => void;
    onProvisionDevice: (id: string) => void;
    onIgnoreDevice: (id: string) => void;
    onRemoveDevice: (id: string) => void;
    onSetDeviceState: (id: string, state: JSONMap) => void;
    onRenameDevice: (id: string, name: string) => void;
};

export function DeviceDetailView({
                                     device: d,
                                     deviceDetail: detail,
                                     deviceDetailInitializing,
                                     deviceDetailReloading,
                                     deviceDetailFetchAttempt,
                                     deviceDetailFetchMax,
                                     busy,
                                     editingDeviceName,
                                     setEditingDeviceName,
                                     deviceNameDraft,
                                     setDeviceNameDraft,
                                     selectedSegIdx,
                                     setSelectedSegIdx,
                                     deviceFormFx,
                                     setDeviceFormFx,
                                     deviceFormPal,
                                     setDeviceFormPal,
                                     deviceFormSx,
                                     setDeviceFormSx,
                                     deviceFormIx,
                                     setDeviceFormIx,
                                     deviceFormRgb,
                                     setDeviceFormRgb,
                                     deviceFormBri,
                                     setDeviceFormBri,
                                     deviceFormTransition,
                                     setDeviceFormTransition,
                                     onRefreshDevice,
                                     onProvisionDevice,
                                     onIgnoreDevice,
                                     onRemoveDevice,
                                     onSetDeviceState,
                                     onRenameDevice,
                                 }: DeviceDetailViewProps) {
    const [effectModalOpen, setEffectModalOpen] = useState(false);
    const [paletteModalOpen, setPaletteModalOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<"ignore" | "remove" | null>(null);

    if (!d) {
        return <p className="opacity-70">Device not found.</p>;
    }

    const liveOnline = detail?.online ?? d.online;
    const cachedStateObj = d.lastState as JSONMap | undefined;
    const stateObj = (detail?.state as JSONMap | undefined) ?? cachedStateObj;
    const segList = stateObj && Array.isArray(stateObj.seg) ? (stateObj.seg as unknown[]) : [];
    const segCount = segList.length;
    const last = d.lastState as JSONMap | undefined;
    const powerOn: boolean | undefined =
        stateObj && typeof stateObj.on === "boolean"
            ? stateObj.on
            : last && typeof last.on === "boolean"
                ? last.on
                : undefined;

    const lightControlsLocked = !liveOnline || powerOn === false;
    const powerDisabled = !liveOnline || powerOn === undefined;
    const powerButtonVariant = powerOn === true ? "default" : powerOn === false ? "destructive" : "secondary";
    const hueValue = rgbToHue(deviceFormRgb[0], deviceFormRgb[1], deviceFormRgb[2]);
    const applySegmentColorPreset = (rgb: [number, number, number]) => {
        setDeviceFormRgb(rgb);
        setDeviceFormFx(0);
        onSetDeviceState(d.id, {
            seg: [
                {
                    id: selectedSegIdx,
                    fx: 0,
                    col: [rgb],
                },
            ],
        });
    };

    const brightnessPercent = Math.round((deviceFormBri / 255) * 100) || 0;

    return (
        <div className="space-y-6 w-full max-w-none pb-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-3 min-w-0 flex-1">
                    {editingDeviceName ? (
                        <div className="flex flex-wrap items-end gap-2">
                            <label className="flex-1 min-w-[14rem] max-w-md">

                                <Input
                                    className="h-8 w-full"
                                    value={deviceNameDraft}
                                    onChange={(e) => setDeviceNameDraft(e.target.value)}
                                    disabled={busy}
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                            e.preventDefault();
                                            setEditingDeviceName(false);
                                            setDeviceNameDraft(d.name);
                                        }
                                    }}
                                />
                            </label>
                            <Button
                                type="button"
                                size="sm"
                                className="shrink-0"
                                disabled={busy || !deviceNameDraft.trim() || deviceNameDraft.trim() === d.name}
                                onClick={() => onRenameDevice(d.id, deviceNameDraft.trim())}
                            >
                                Save
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="shrink-0"
                                disabled={busy}
                                onClick={() => {
                                    setEditingDeviceName(false);
                                    setDeviceNameDraft(d.name);
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-semibold truncate min-w-0">{d.name}</h2>
                            <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                className="shrink-0"
                                disabled={busy}
                                onClick={() => {
                                    setDeviceNameDraft(d.name);
                                    setEditingDeviceName(true);
                                }}
                            >
                                <PiPencil/>
                            </Button>
                        </div>
                    )}
                    <p className="text-sm opacity-70 font-mono">
                        {d.address}:{d.port} • {d.id}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                        <Badge variant={liveOnline ? "default" : "secondary"}>
                            {liveOnline ? "Connected" : "Unreachable"}
                        </Badge>
                        {detail?.error && liveOnline === false && (
                            <span className="text-xs opacity-70 max-w-xl">{detail.error}</span>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant={powerButtonVariant as "default" | "destructive" | "secondary"}
                        size="sm"
                        className="whitespace-nowrap inline-flex items-center justify-center gap-2 shrink-0"
                        onClick={() => onSetDeviceState(d.id, {on: powerOn !== true})}
                        disabled={powerDisabled}
                    >
                        <PiPower className="text-lg shrink-0"
                                 aria-hidden/> Power {powerOn === true ? "on" : powerOn === false ? "off" : "unknown"}
                    </Button>
                    <Button size="sm" variant="outline"
                            onClick={() => onRefreshDevice(d.id)}
                            disabled={busy}><PiArrowClockwise/>
                        Reload
                    </Button>
                    <Button size="sm" variant="destructive"
                            onClick={() => setConfirmAction("ignore")}
                            disabled={busy}><PiX/>
                        Ignore
                    </Button>
                    <Button size="sm" variant="destructive"
                            onClick={() => setConfirmAction("remove")}
                            disabled={busy}><PiTrash/>
                        Delete
                    </Button>

                </div>
            </div>
            {confirmAction && (
                <Dialog open onOpenChange={(next) => !next && setConfirmAction(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                {confirmAction === "ignore" ? "Ignore device?" : "Forget device?"}
                            </DialogTitle>
                            <DialogDescription>
                                {confirmAction === "ignore"
                                    ? `Are you sure you want to ignore "${d.name}"?`
                                    : `Are you sure you want to forget "${d.name}"?`}
                            </DialogDescription>
                        </DialogHeader>
                        <p className="text-xs opacity-70">
                            {confirmAction === "ignore"
                                ? "This device will be ignored and hidden from active management."
                                : "This device will be removed from the controller list."}
                        </p>
                        <DialogFooter className="border-0 bg-transparent p-0 m-0 mt-4">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmAction(null)}
                                disabled={busy}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                    if (confirmAction === "ignore") {
                                        onIgnoreDevice(d.id);
                                    } else {
                                        onRemoveDevice(d.id);
                                    }
                                    setConfirmAction(null);
                                }}
                                disabled={busy}
                            >
                                {confirmAction === "ignore" ? "Ignore device" : "Forget device"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {(deviceDetailInitializing || deviceDetailReloading || (!detail?.state && liveOnline)) && (
                <Dialog open>
                    <DialogContent showCloseButton={false} className="max-w-sm">
                        <DialogHeader className="sr-only">
                            <DialogTitle>Device state loading</DialogTitle>
                            <DialogDescription>
                                Loading status and retry information for the selected device.
                            </DialogDescription>
                        </DialogHeader>
                        <p id="device-state-loading-title"
                           className="font-medium flex items-center gap-3">
                            <Spinner className="text-primary" aria-hidden/>
                            {deviceDetailReloading
                                ? "Refreshing device …"
                                : deviceDetailInitializing
                                    ? "Loading device state …"
                                    : "Refreshing device state …"}
                        </p>
                        {deviceDetailFetchAttempt > 0 && (
                            <p className="text-sm text-muted-foreground mt-2">
                                Attempt {deviceDetailFetchAttempt} of {deviceDetailFetchMax}
                            </p>
                        )}
                    </DialogContent>
                </Dialog>
            )}

            {segCount > 1 && (
                <Card className="bg-muted/50">
                    <CardContent className="gap-2 py-4">
                        <div className="w-full max-w-md space-y-2">
                            <Label className="text-xs">Segment</Label>
                            <Select value={String(selectedSegIdx)}
                                    onValueChange={(value) => setSelectedSegIdx(readNumber(value, 0))}
                                    disabled={!liveOnline}>
                                <SelectTrigger className="h-8 w-full"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    {segList.map((raw, i) => {
                                        const s = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as JSONMap) : {};
                                        const sid = readNumber(s.id, i);
                                        const nm = typeof s.name === "string" && s.name.trim() ? s.name : `Segment ${sid}`;
                                        return (
                                            <SelectItem key={i} value={String(i)}>
                                                {nm} (id {sid})
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>

                <CardHeader>
                    <CardTitle>Color & Brightness</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-start gap-4">

                        <div className="flex w-full items-start gap-4">
                            <label className="flex w-1/2 flex-col gap-1">
                                <span className="text-xs opacity-70">Color</span>
                                <HueSlider value={hueValue} disabled={lightControlsLocked}
                                           onChange={(nextHue) => setDeviceFormRgb(hueToRgb(nextHue))}/>
                            </label>

                            <div className="w-1/2 space-y-2">
                                <Label className="text-xs">Brightness ({brightnessPercent}%)</Label>
                                <Slider
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={[brightnessPercent]}
                                    onValueChange={(value) => {
                                        const percentValue = readNumber(value[0], 100);
                                        const briValue = Math.round((percentValue / 100) * 255);
                                        setDeviceFormBri(Math.max(1, briValue));
                                    }}
                                    disabled={lightControlsLocked}
                                />
                            </div>
                        </div>


                        <div className="w-full grid grid-cols-3 gap-2">


                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="w-full min-w-0 gap-1"
                                onClick={() => applySegmentColorPreset(WARM_WHITE_RGB)}
                                disabled={lightControlsLocked}
                            >
                                <PiFire/>
                                Warm white
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="w-full min-w-0 gap-1"
                                onClick={() => applySegmentColorPreset(COLD_WHITE_RGB)}
                                disabled={lightControlsLocked}
                            >
                                <PiIceCream/>
                                Cold white
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="secondary" size="sm"
                                            className="w-full min-w-0 gap-1"
                                            disabled={lightControlsLocked}>
                                        <PiPalette/>
                                        Color
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-max">
                                    {NAMED_LIGHT_PRESETS.map(({name, rgb}) => (
                                        <DropdownMenuItem
                                            key={name}
                                            className="flex w-full items-center gap-2 whitespace-nowrap text-left"
                                            disabled={lightControlsLocked}
                                            onClick={() => {
                                                applySegmentColorPreset(rgb);
                                            }}
                                        >
                                                <span
                                                    className="h-4 w-4 shrink-0 rounded-sm border"
                                                    style={{backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`}}
                                                    aria-hidden
                                                />
                                            <span>{name}</span>
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <div className="min-w-[140px] space-y-2">
                            <Label className="text-xs">Transition (x100 ms)</Label>
                            <Input
                                type="number"
                                min={0}
                                max={255}
                                className="h-8"
                                value={deviceFormTransition}
                                onChange={(e) => setDeviceFormTransition(readNumber(e.target.value, 7))}
                                disabled={lightControlsLocked}
                            />
                        </div>
                    </div>
                </CardContent>


            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>
                        Effect & palette
                    </CardTitle>
                </CardHeader>

                <CardContent className="gap-4">
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label className="text-xs">Effect</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-auto min-h-10 w-full justify-start text-left"
                                disabled={lightControlsLocked}
                                onClick={() => setEffectModalOpen(true)}
                            >
                                <span className="block truncate">
                                    {deviceFormFx}
                                    {detail?.effects?.[deviceFormFx] != null
                                        ? `: ${detail.effects[deviceFormFx]}`
                                        : ""}
                                </span>
                            </Button>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Palette</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-auto min-h-10 w-full justify-start text-left"
                                disabled={lightControlsLocked}
                                onClick={() => setPaletteModalOpen(true)}
                            >
                                <span className="block truncate">
                                    {deviceFormPal}
                                    {detail?.palettes?.[deviceFormPal] != null
                                        ? `: ${detail.palettes[deviceFormPal]}`
                                        : ""}
                                </span>
                            </Button>
                        </div>
                    </div>
                    <EffectPickerModal
                        open={effectModalOpen}
                        onClose={() => setEffectModalOpen(false)}
                        effectNames={detail?.effects}
                        selectedIndex={deviceFormFx}
                        disabled={lightControlsLocked}
                        onPick={(idx) => {
                            setDeviceFormFx(idx);
                            onSetDeviceState(d.id, {
                                seg: [
                                    {
                                        id: selectedSegIdx,
                                        fx: idx,
                                        pal: deviceFormPal,
                                        sx: deviceFormSx,
                                        ix: deviceFormIx,
                                        col: [deviceFormRgb],
                                    },
                                ],
                            });
                        }}
                    />
                    <PalettePickerModal
                        open={paletteModalOpen}
                        onClose={() => setPaletteModalOpen(false)}
                        paletteNames={detail?.palettes}
                        selectedIndex={deviceFormPal}
                        disabled={lightControlsLocked}
                        onPick={(idx) => {
                            setDeviceFormPal(idx);
                            onSetDeviceState(d.id, {
                                seg: [
                                    {
                                        id: selectedSegIdx,
                                        fx: deviceFormFx,
                                        pal: idx,
                                        sx: deviceFormSx,
                                        ix: deviceFormIx,
                                        col: [deviceFormRgb],
                                    },
                                ],
                            });
                        }}
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label className="text-xs">Speed (sx) - {deviceFormSx}</Label>
                            <Slider
                                min={0}
                                max={255}
                                value={[deviceFormSx]}
                                onValueChange={(value) => setDeviceFormSx(readNumber(value[0], 128))}
                                disabled={lightControlsLocked}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Intensity (ix) - {deviceFormIx}</Label>
                            <Slider
                                min={0}
                                max={255}
                                value={[deviceFormIx]}
                                onValueChange={(value) => setDeviceFormIx(readNumber(value[0], 128))}
                                disabled={lightControlsLocked}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Collapsible className="rounded-lg border">
                <CollapsibleTrigger className="w-full px-4 py-3 text-left font-semibold">State &
                    Config</CollapsibleTrigger>
                <CollapsibleContent className="px-4 pb-4 text-sm grid gap-5">


                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="bg-muted/50">
                            <CardContent className="pt-4">
                                <h3 className="text-sm font-semibold mb-2">Device info (GET
                                    /json)</h3>
                                <pre
                                    className="text-xs overflow-auto max-h-64 rounded bg-card p-2 border whitespace-pre-wrap">
              {detail?.info ? prettyJSON(detail.info) : "—"}
            </pre>
                            </CardContent>
                        </Card>
                        <Card className="bg-muted/50">
                            <CardContent className="pt-4">
                                <h3 className="text-sm font-semibold mb-2">Config (GET
                                    /json/cfg)</h3>
                                <pre
                                    className="text-xs overflow-auto max-h-64 rounded bg-card p-2 border whitespace-pre-wrap">
              {detail?.config ? prettyJSON(detail.config) : "—"}
            </pre>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="bg-muted/50">
                        <CardContent className="pt-4">
                            <h3 className="text-sm font-semibold mb-2">Current state (GET /json →
                                state)</h3>
                            <pre
                                className="text-xs overflow-auto max-h-72 rounded bg-card p-2 border whitespace-pre-wrap">
            {detail?.state ? prettyJSON(detail.state) : "—"}
          </pre>
                        </CardContent>
                    </Card>

                    {d.lastState && Object.keys(d.lastState).length > 0 && (
                        <div className="text-xs opacity-60">
                            <span
                                className="font-medium opacity-80">Persisted last state</span> (restored
                            on reconnect):{" "}
                            <code
                                className="break-all">{prettyJSON(d.lastState).slice(0, 200)}…</code>
                        </div>
                    )}

                </CollapsibleContent>
            </Collapsible>
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
