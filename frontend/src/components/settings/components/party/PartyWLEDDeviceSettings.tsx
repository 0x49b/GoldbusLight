import {useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import * as GoldbusLightService from "../../../../../bindings/goldbus/internal/service/goldbuslightservice.ts";
import {Button} from "@/components/ui/button.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Slider} from "@/components/ui/slider.tsx";
import {EffectPickerModal} from "@/components/wled/device/EffectPickerModal.tsx";
import {PalettePickerModal} from "@/components/wled/device/PalettePickerModal.tsx";
import type {
    DMXPartyConfig,
    DMXPartyWLEDDeviceSettings,
    WLEDDevice,
    WLEDDeviceDetail,
} from "@/types/controller.ts";

type DeviceCatalog = {
    effects: string[];
    palettes: string[];
};

type PartyWLEDDeviceSettingsProps = {
    devices: WLEDDevice[];
    includedIds: string[];
    settings: DMXPartyConfig["wledDeviceSettings"];
    disabled?: boolean;
    onChange: (next: Record<string, DMXPartyWLEDDeviceSettings>) => void;
};

const DEFAULT_SX = 128;
const DEFAULT_IX = 128;

function clampByte(v: number, fallback: number): number {
    if (!Number.isFinite(v)) {
        return fallback;
    }
    return Math.max(0, Math.min(255, Math.round(v)));
}

function settingsForDevice(
    all: DMXPartyConfig["wledDeviceSettings"],
    deviceId: string,
): DMXPartyWLEDDeviceSettings {
    const current = all?.[deviceId];
    return {
        fx: Math.max(0, Math.round(current?.fx ?? 0)),
        pal: Math.max(0, Math.round(current?.pal ?? 0)),
        sx: clampByte(current?.sx ?? DEFAULT_SX, DEFAULT_SX),
        ix: clampByte(current?.ix ?? DEFAULT_IX, DEFAULT_IX),
    };
}

/** Formats as `id:name` when a name is known, otherwise just the id. */
function formatIndexName(index: number, names: string[] | undefined): string {
    const name = names?.[index];
    if (name == null || name === "") {
        return String(index);
    }
    return `${index}:${name}`;
}

function catalogFromDetail(detail: WLEDDeviceDetail): DeviceCatalog {
    return {
        effects: Array.isArray(detail.effects) ? detail.effects.map(String) : [],
        palettes: Array.isArray(detail.palettes) ? detail.palettes.map(String) : [],
    };
}

export function PartyWLEDDeviceSettings({
    devices,
    includedIds,
    settings,
    disabled,
    onChange,
}: PartyWLEDDeviceSettingsProps) {
    const {t} = useTranslation("party");
    const {t: tw} = useTranslation("wled");
    const [catalogByDevice, setCatalogByDevice] = useState<Record<string, DeviceCatalog>>({});
    const [sharedCatalog, setSharedCatalog] = useState<DeviceCatalog | null>(null);
    const loadedIdsRef = useRef(new Set<string>());
    const [pickerDeviceId, setPickerDeviceId] = useState<string | null>(null);
    const [effectModalOpen, setEffectModalOpen] = useState(false);
    const [paletteModalOpen, setPaletteModalOpen] = useState(false);
    const [sxDraft, setSxDraft] = useState<Record<string, number>>({});
    const [ixDraft, setIxDraft] = useState<Record<string, number>>({});

    const includedDevices = useMemo(() => {
        const byId = new Map(devices.map((device) => [device.id, device]));
        return includedIds
            .map((id) => byId.get(id))
            .filter((device): device is WLEDDevice => device != null);
    }, [devices, includedIds]);

    const includedKey = includedDevices.map((device) => device.id).join("\0");

    const applyCatalog = (deviceId: string, catalog: DeviceCatalog) => {
        setCatalogByDevice((prev) => ({...prev, [deviceId]: catalog}));
        if (catalog.effects.length > 0 || catalog.palettes.length > 0) {
            setSharedCatalog((prev) => prev ?? catalog);
        }
    };

    const loadCatalog = async (deviceId: string): Promise<DeviceCatalog | undefined> => {
        try {
            const detail = (await GoldbusLightService.GetDeviceDetail(deviceId)) as WLEDDeviceDetail;
            const catalog = catalogFromDetail(detail);
            loadedIdsRef.current.add(deviceId);
            applyCatalog(deviceId, catalog);
            return catalog;
        } catch {
            return catalogByDevice[deviceId] ?? sharedCatalog ?? undefined;
        }
    };

    useEffect(() => {
        const ids = includedKey ? includedKey.split("\0") : [];
        void (async () => {
            for (const id of ids) {
                if (!id || loadedIdsRef.current.has(id)) {
                    continue;
                }
                loadedIdsRef.current.add(id);
                try {
                    const detail = (await GoldbusLightService.GetDeviceDetail(id)) as WLEDDeviceDetail;
                    applyCatalog(id, catalogFromDetail(detail));
                } catch {
                    loadedIdsRef.current.delete(id);
                }
            }
        })();
    }, [includedKey]);

    useEffect(() => {
        if (sharedCatalog != null) {
            return;
        }
        const online = devices.find((device) => device.online && !device.ignored);
        if (!online) {
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const detail = (await GoldbusLightService.GetDeviceDetail(online.id)) as WLEDDeviceDetail;
                if (cancelled) {
                    return;
                }
                const catalog = catalogFromDetail(detail);
                if (catalog.effects.length > 0 || catalog.palettes.length > 0) {
                    setSharedCatalog(catalog);
                }
            } catch {
                /* ignore */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [devices, sharedCatalog]);

    if (includedDevices.length === 0) {
        return null;
    }

    const namesFor = (deviceId: string): DeviceCatalog => {
        return catalogByDevice[deviceId] ?? sharedCatalog ?? {effects: [], palettes: []};
    };

    const updateDevice = (deviceId: string, patch: Partial<DMXPartyWLEDDeviceSettings>) => {
        const current = settingsForDevice(settings, deviceId);
        const next: DMXPartyWLEDDeviceSettings = {
            fx: patch.fx ?? current.fx,
            pal: patch.pal ?? current.pal,
            sx: patch.sx ?? sxDraft[deviceId] ?? current.sx,
            ix: patch.ix ?? ixDraft[deviceId] ?? current.ix,
        };
        onChange({
            ...(settings ?? {}),
            [deviceId]: next,
        });
    };

    const commitSx = (deviceId: string, raw: number) => {
        const next = clampByte(raw, DEFAULT_SX);
        setSxDraft((prev) => ({...prev, [deviceId]: next}));
        updateDevice(deviceId, {sx: next});
    };

    const commitIx = (deviceId: string, raw: number) => {
        const next = clampByte(raw, DEFAULT_IX);
        setIxDraft((prev) => ({...prev, [deviceId]: next}));
        updateDevice(deviceId, {ix: next});
    };

    const openEffectPicker = (deviceId: string) => {
        setPickerDeviceId(deviceId);
        setEffectModalOpen(true);
        void loadCatalog(deviceId);
    };

    const openPalettePicker = (deviceId: string) => {
        setPickerDeviceId(deviceId);
        setPaletteModalOpen(true);
        void loadCatalog(deviceId);
    };

    const pickerSettings = pickerDeviceId ? settingsForDevice(settings, pickerDeviceId) : {
        fx: 0,
        pal: 0,
        sx: DEFAULT_SX,
        ix: DEFAULT_IX,
    };
    const pickerNames = pickerDeviceId ? namesFor(pickerDeviceId) : {effects: [], palettes: []};

    return (
        <div className="space-y-2">
            <div>
                <div className="text-xs font-medium text-muted-foreground">{t("wled.deviceSettings")}</div>
                <p className="text-xs text-muted-foreground">{t("wled.deviceSettingsHint")}</p>
            </div>
            <div className="space-y-2">
                {includedDevices.map((device) => {
                    const current = settingsForDevice(settings, device.id);
                    const names = namesFor(device.id);
                    const sx = sxDraft[device.id] ?? current.sx;
                    const ix = ixDraft[device.id] ?? current.ix;
                    return (
                        <div
                            key={device.id}
                            className="space-y-3 rounded-md border bg-muted/20 p-3"
                        >
                            <div className="text-sm font-medium">
                                {device.name || device.host || device.id}
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label className="text-xs">{tw("device.effect")}</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-auto min-h-10 w-full justify-start text-left"
                                        disabled={disabled}
                                        onClick={() => openEffectPicker(device.id)}
                                    >
                                        <span className="block truncate">
                                            {formatIndexName(current.fx, names.effects)}
                                        </span>
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">{tw("device.palette")}</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-auto min-h-10 w-full justify-start text-left"
                                        disabled={disabled}
                                        onClick={() => openPalettePicker(device.id)}
                                    >
                                        <span className="block truncate">
                                            {formatIndexName(current.pal, names.palettes)}
                                        </span>
                                    </Button>
                                </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label className="text-xs">{tw("device.speed", {value: sx})}</Label>
                                    <Slider
                                        min={0}
                                        max={255}
                                        value={[sx]}
                                        disabled={disabled}
                                        onValueChange={(value) => {
                                            setSxDraft((prev) => ({
                                                ...prev,
                                                [device.id]: clampByte(value[0] ?? DEFAULT_SX, DEFAULT_SX),
                                            }));
                                        }}
                                        onValueCommit={(value) => {
                                            commitSx(device.id, value[0] ?? DEFAULT_SX);
                                        }}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">{tw("device.intensity", {value: ix})}</Label>
                                    <Slider
                                        min={0}
                                        max={255}
                                        value={[ix]}
                                        disabled={disabled}
                                        onValueChange={(value) => {
                                            setIxDraft((prev) => ({
                                                ...prev,
                                                [device.id]: clampByte(value[0] ?? DEFAULT_IX, DEFAULT_IX),
                                            }));
                                        }}
                                        onValueCommit={(value) => {
                                            commitIx(device.id, value[0] ?? DEFAULT_IX);
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <EffectPickerModal
                open={effectModalOpen}
                onClose={() => {
                    setEffectModalOpen(false);
                    setPickerDeviceId(null);
                }}
                effectNames={pickerNames.effects.length > 0 ? pickerNames.effects : undefined}
                selectedIndex={pickerSettings.fx}
                disabled={disabled}
                onPick={(idx) => {
                    if (!pickerDeviceId) {
                        return;
                    }
                    updateDevice(pickerDeviceId, {fx: idx});
                }}
            />
            <PalettePickerModal
                open={paletteModalOpen}
                onClose={() => {
                    setPaletteModalOpen(false);
                    setPickerDeviceId(null);
                }}
                paletteNames={pickerNames.palettes.length > 0 ? pickerNames.palettes : undefined}
                selectedIndex={pickerSettings.pal}
                disabled={disabled}
                onPick={(idx) => {
                    if (!pickerDeviceId) {
                        return;
                    }
                    updateDevice(pickerDeviceId, {pal: idx});
                }}
            />
        </div>
    );
}
