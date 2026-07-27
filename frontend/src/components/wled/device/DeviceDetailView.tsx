import {type Dispatch, type SetStateAction, useState} from "react";
import {PiArrowClockwise, PiFire, PiIceCream, PiPalette, PiPencil, PiPower} from "react-icons/pi";
import {prettyJSON, readNumber} from "@/lib/json.ts";
import {
    COLD_WHITE_RGB,
    isColdWhiteRgb,
    isNamedDropdownColorRgb,
    isWarmWhiteRgb,
    NAMED_LIGHT_PRESETS,
    rgbEquals,
    WARM_WHITE_RGB
} from "@/lib/wled.ts";
import type {JSONMap, WLEDDevice, WLEDDeviceDetail} from "@/types/controller.ts";
import {EffectPickerModal} from "./EffectPickerModal.tsx";
import {PalettePickerModal} from "./PalettePickerModal.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Badge} from "@/components/ui/badge.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog.tsx";
import {Spinner} from "@/components/ui/spinner.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible.tsx";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";
import {Slider} from "@/components/ui/slider.tsx";
import {HueSlider} from "@/components/ui/hue-slider.tsx";
import {cn} from "@/lib/utils.ts";
import {useControllerStore} from "@/store/controllerStore.ts";

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
    onCreatePreset: (deviceId: string, name: string) => Promise<void>;
    onApplyPreset: (deviceId: string, presetId: string) => Promise<void>;
    onDeletePreset: (deviceId: string, presetId: string) => Promise<void>;
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
                                     onCreatePreset,
                                     onApplyPreset,
                                     onDeletePreset,
                                 }: Readonly<DeviceDetailViewProps>) {
    const [effectModalOpen, setEffectModalOpen] = useState(false);
    const [paletteModalOpen, setPaletteModalOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<"ignore" | "remove" | null>(null);
    const [presetNameDraft, setPresetNameDraft] = useState("");
    const [presetDialogOpen, setPresetDialogOpen] = useState(false);

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
    const showDebug = useControllerStore.getState().settings?.wled.debug?.showInfo ?? false
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
    const warmWhiteActive = isWarmWhiteRgb(deviceFormRgb);
    const coldWhiteActive = isColdWhiteRgb(deviceFormRgb);
    const namedColorActive = isNamedDropdownColorRgb(deviceFormRgb);

    const fetchingDetail =
        deviceDetailInitializing ||
        deviceDetailReloading ||
        deviceDetailFetchAttempt > 0;
    const fetchStatusLabel = deviceDetailFetchAttempt > 0
        ? `${deviceDetailFetchAttempt}/${deviceDetailFetchMax}`
        : deviceDetailReloading
            ? "Refreshing…"
            : "Loading…";

    return (
        <div className="w-full max-w-none pb-8">
            <div
                className="sticky left-0 right-0 top-[-1rem] z-40 isolate -mx-4 -mt-4 mb-6 space-y-4 bg-background px-4 pb-4 pt-4 shadow-sm md:-mx-6 md:-mt-6 md:top-[-1.5rem] md:px-6"
            >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-3 min-w-0 flex-1 basis-[14rem]">
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
                <div
                    className="flex min-h-8 min-w-0 flex-1 basis-[12rem] items-center justify-center self-center px-2"
                    aria-live="polite"
                >
                    {fetchingDetail ? (
                        <div
                            role="status"
                            className="inline-flex max-w-full items-center gap-2 rounded-md border border-dashed px-3 py-1.5 text-sm text-muted-foreground"
                        >
                            <Spinner className="size-4 shrink-0 text-primary" aria-hidden/>
                            <span className="truncate tabular-nums">{fetchStatusLabel} tries</span>
                        </div>
                    ) : null}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
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
                    <Button size="sm" variant="ghost"
                            onClick={() => setConfirmAction("ignore")}
                            disabled={busy}>
                        Ignore
                    </Button>
                    <Button size="sm" variant="destructive"
                            onClick={() => setConfirmAction("remove")}
                            disabled={busy}>
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
            </div>

            <div className="space-y-6">
            <Card>

                <CardHeader>
                    <CardTitle>Color & Brightness</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="w-full grid grid-cols-3 gap-2">
                        <Button
                            type="button"
                            variant={warmWhiteActive ? "default" : "secondary"}
                            size="sm"
                            className="w-full min-w-0 gap-1"
                            aria-pressed={warmWhiteActive}
                            onClick={() => applySegmentColorPreset(WARM_WHITE_RGB)}
                            disabled={lightControlsLocked}
                        >
                            <PiFire/>
                            Warm white
                        </Button>
                        <Button
                            type="button"
                            variant={coldWhiteActive ? "default" : "secondary"}
                            size="sm"
                            className="w-full min-w-0 gap-1"
                            aria-pressed={coldWhiteActive}
                            onClick={() => applySegmentColorPreset(COLD_WHITE_RGB)}
                            disabled={lightControlsLocked}
                        >
                            <PiIceCream/>
                            Cold white
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant={namedColorActive ? "default" : "secondary"}
                                    size="sm"
                                    className="w-full min-w-0 gap-1"
                                    aria-pressed={namedColorActive}
                                    disabled={lightControlsLocked}
                                >
                                    <PiPalette/>
                                    Color
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-max">
                                {NAMED_LIGHT_PRESETS.map(({name, rgb}) => (
                                    <DropdownMenuItem
                                        key={name}
                                        className={cn(
                                            "flex w-full items-center gap-2 whitespace-nowrap text-left",
                                            rgbEquals(deviceFormRgb, rgb) && "bg-accent font-medium",
                                        )}
                                        disabled={lightControlsLocked}
                                        aria-current={rgbEquals(deviceFormRgb, rgb) ? "true" : undefined}
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

                    <div className="flex flex-wrap items-center gap-4 mt-4">
                        <label className="flex w-full min-w-50 flex-col gap-1">


                            <Label className="text-xs">Color</Label>
                            <HueSlider value={hueValue} disabled={lightControlsLocked}
                                       onChange={(nextHue) => setDeviceFormRgb(hueToRgb(nextHue))}/>

                        </label>
                        <label className="flex w-full min-w-50 flex-col gap-1">
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
                        </label>
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
                    <div className="grid gap-3 md:grid-cols-2 mt-4">
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

            <Card>
                <CardHeader>
                    <CardTitle>
                        Transition
                    </CardTitle>
                </CardHeader>

                <CardContent className="gap-4">
                    <Label className="text-xs">x100 ms</Label>
                    <Input
                        type="number"
                        min={0}
                        max={255}
                        className="h-8"
                        value={deviceFormTransition}
                        onChange={(e) => setDeviceFormTransition(readNumber(e.target.value, 7))}
                        disabled={lightControlsLocked}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                    <CardTitle>Presets</CardTitle>
                    <Button
                        type="button"
                        size="sm"
                        disabled={busy || !d}
                        onClick={() => {
                            setPresetNameDraft("");
                            setPresetDialogOpen(true);
                        }}
                    >
                        Save current
                    </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                    {(d?.presets?.length ?? 0) === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Save the current look as a named preset for use in Scenes.
                        </p>
                    ) : (
                        (d?.presets ?? []).map((preset) => (
                            <div
                                key={preset.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                            >
                                <span className="text-sm font-medium">{preset.name}</span>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        disabled={busy}
                                        onClick={() => {
                                            if (d) {
                                                void onApplyPreset(d.id, preset.id);
                                            }
                                        }}
                                    >
                                        Apply
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        disabled={busy}
                                        onClick={() => {
                                            if (d) {
                                                void onDeletePreset(d.id, preset.id);
                                            }
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

            <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Save preset</DialogTitle>
                        <DialogDescription>
                            Capture this device&apos;s current look as a named preset.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="wled-preset-name">Name</Label>
                        <Input
                            id="wled-preset-name"
                            value={presetNameDraft}
                            onChange={(e) => setPresetNameDraft(e.target.value)}
                            placeholder="Warm lobby"
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => setPresetDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            disabled={busy || !presetNameDraft.trim() || !d}
                            onClick={() => {
                                if (!d || !presetNameDraft.trim()) {
                                    return;
                                }
                                void onCreatePreset(d.id, presetNameDraft.trim()).then(() => {
                                    setPresetDialogOpen(false);
                                    setPresetNameDraft("");
                                });
                            }}
                        >
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>


            {showDebug && (
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
            )}
            </div>
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
