import {type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState} from "react";
import {PiFire, PiIceCream, PiMoon, PiPalette, PiSun} from "react-icons/pi";
import * as GreetService from "../../../bindings/changeme/greetservice";
import {readNumber} from "../../lib/json";
import {
    BLACK_LIGHT_FLUORESCENT_RGB,
    CANDLE_LIGHT_RGB,
    CLEAR_BLUE_SKY_RGB,
    COLD_WHITE_RGB,
    DAYLIGHT_WHITE_RGB,
    DIRECT_SUNLIGHT_RGB,
    FROSTY_WHITE_RGB,
    hexToRgb,
    rgbToHex,
    SUPER_WARM_RGB,
    WARM_WHITE_RGB,
    WHITE_RGB
} from "../../lib/wled";
import type {JSONMap, WLEDDevice, WLEDDeviceDetail} from "../../types/controller";
import {EffectPickerModal} from "../device/EffectPickerModal";
import {PalettePickerModal} from "../device/PalettePickerModal";

const NAMED_LIGHT_PRESETS: ReadonlyArray<{ name: string; rgb: [number, number, number] }> = [
    {name: "1300K Candle Light ", rgb: CANDLE_LIGHT_RGB},
    {name: "2200K Super Warm ", rgb: SUPER_WARM_RGB},
    {name: "2700K Warm White ", rgb: WARM_WHITE_RGB},
    {name: "4300K Daylight White ", rgb: DAYLIGHT_WHITE_RGB},
    {name: "5300K White ", rgb: WHITE_RGB},
    {name: "7000K Frosty White ", rgb: FROSTY_WHITE_RGB},
    {name: "Cold White ", rgb: COLD_WHITE_RGB},
    {name: "Black Light Fluorescent ", rgb: BLACK_LIGHT_FLUORESCENT_RGB},
    {name: "Clear Blue Sky ", rgb: CLEAR_BLUE_SKY_RGB},
    {name: "Direct Sunlight ", rgb: DIRECT_SUNLIGHT_RGB},
];

export type PresetsPanelProps = {
    devices: WLEDDevice[];
    busy: boolean;
    presetBri: number;
    setPresetBri: Dispatch<SetStateAction<number>>;
    presetRgb: [number, number, number];
    setPresetRgb: Dispatch<SetStateAction<[number, number, number]>>;
    onSetGlobalState: (state: JSONMap, label: string, options?: { background?: boolean }) => void;
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
                                 busy,
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
    const namedColorDropdownRef = useRef<HTMLDetailsElement>(null);
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
                const detail = (await GreetService.GetDeviceDetail(firstOnlineDevice.id)) as WLEDDeviceDetail;
                setEffectNames(Array.isArray(detail.effects) ? detail.effects : []);
                setPaletteNames(Array.isArray(detail.palettes) ? detail.palettes : []);
            } catch {
                setEffectNames([]);
                setPaletteNames([]);
            }
        })();
    }, [firstOnlineDevice?.id]);

    const applyGlobalEffectPalette = (next: { fx?: number; pal?: number; sx?: number; ix?: number }) => {
        const fx = next.fx ?? generalFx;
        const pal = next.pal ?? generalPal;
        const sx = next.sx ?? generalSx;
        const ix = next.ix ?? generalIx;
        onSetGlobalState(
            {
                seg: [{fx, pal, sx, ix}],
            },
            "Effect/palette (all)",
        );
    };

    return (
        <div className="space-y-6 w-full max-w-none">
            <div>
                <h2 className="text-xl font-semibold">General</h2>
            </div>
            <div className="card bg-base-100 card-bordered border-gray-500">
                <div className="card-body gap-4">
                    <p className="text-sm opacity-70 mt-1">
                        Control all WLED devices together. Default scene is warm white.
                    </p>
                    <div className="flex w-full min-w-0 gap-2">
                        <button
                            type="button"
                            className={`btn btn-active min-w-0 flex-1 gap-1 px-2 sm:px-4 ${allOff ? "btn-error" : "btn-success"}`}
                            onClick={() =>
                                allOff
                                    ? onSetGlobalState({on: true, seg: [{fx: 0, pal: 0}]}, "All on")
                                    : onSetGlobalState({on: false, seg: [{fx: 0, pal: 0}]}, "All off")
                            }
                            disabled={busy || activeDevices.length === 0}
                        >
                            {allOff ? <PiMoon/> : <PiSun/>}
                            {allOff ? "All off" : "All on"}
                        </button>
                        <button
                            type="button"
                            className="btn btn-active min-w-0 flex-1 gap-1 px-2 sm:px-4"
                            onClick={applyWarmWhitePreset}
                            disabled={busy}
                        >
                            <PiFire/>
                            Warm white
                        </button>
                        <button
                            type="button"
                            className="btn btn-active min-w-0 flex-1 gap-1 px-2 sm:px-4"
                            onClick={applyColdWhitePreset}
                            disabled={busy}
                        >
                            <PiIceCream/>
                            Cold white
                        </button>
                        <details
                            ref={namedColorDropdownRef}
                            className={`dropdown dropdown-end flex min-w-0 flex-1 ${busy ? "pointer-events-none opacity-50" : ""}`}
                        >
                            <summary
                                className="btn btn-active m-0 flex min-h-0 w-full min-w-0 list-none gap-1 px-2 sm:px-4 [&::-webkit-details-marker]:hidden"
                            >
                                <PiPalette/>
                                Color
                            </summary>
                            <ul
                                className="menu dropdown-content rounded-box z-50 w-max bg-base-100 p-2 shadow-sm"
                            >
                                {NAMED_LIGHT_PRESETS.map(({name, rgb}) => (
                                    <li key={name}>
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 whitespace-nowrap text-left active:bg-base-200"
                                            disabled={busy}
                                            onClick={() => {
                                                applyNamedColorPreset(name, rgb);
                                                const root = namedColorDropdownRef.current;
                                                if (root) root.open = false;
                                            }}
                                        >
                                            <span
                                                className="h-4 w-4 shrink-0 rounded-sm border border-base-300"
                                                style={{
                                                    backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
                                                }}
                                                aria-hidden
                                            />
                                            <span>{name}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    </div>

                    <h3 className="font-medium">Color (all devices)</h3>
                    <div className="flex flex-wrap items-center gap-4">
                        <label className="flex flex-col gap-1">
                            <span className="text-xs opacity-70">Color wheel</span>
                            <input
                                type="color"
                                className="h-12 w-24 cursor-pointer rounded border border-base-300 bg-base-100"
                                value={rgbToHex(presetRgb[0], presetRgb[1], presetRgb[2])}
                                onChange={(e) => setPresetRgb(hexToRgb(e.target.value))}
                                disabled={busy}
                            />
                        </label>
                        <label className="form-control flex-1 min-w-[200px]">
                            <span className="label-text text-xs">Brightness (bri)</span>
                            <input
                                type="range"
                                min={1}
                                max={255}
                                className="range range-primary range-sm"
                                value={presetBri}
                                onChange={(e) => setPresetBri(readNumber(e.target.value, 200))}
                                disabled={busy}
                            />
                        </label>
                        <span className="badge badge-neutral shrink-0">{presetBri}</span>
                    </div>
                </div>
            </div>
            <div className="card bg-base-100 card-bordered border-gray-500">
                <div className="card-body gap-4">
                    <h3 className="font-medium">Effect & palette (all devices)</h3>
                    <p className="text-xs opacity-60">
                        Apply the same effect and palette to all connected devices.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="form-control">
                            <span className="label-text text-xs">Effect</span>
                            <button
                                type="button"
                                className="btn btn-sm h-auto min-h-10 w-full text-left"
                                disabled={busy || activeDevices.length === 0}
                                onClick={() => setEffectModalOpen(true)}
                            >
                                <span className="block truncate">
                                    {generalFx}
                                    {effectNames[generalFx] != null ? `: ${effectNames[generalFx]}` : ""}
                                </span>
                            </button>
                        </label>
                        <label className="form-control">
                            <span className="label-text text-xs">Palette</span>
                            <button
                                type="button"
                                className="btn btn-sm h-auto min-h-10 w-full text-left"
                                disabled={busy || activeDevices.length === 0}
                                onClick={() => setPaletteModalOpen(true)}
                            >
                                <span className="block truncate">
                                    {generalPal}
                                    {paletteNames[generalPal] != null ? `: ${paletteNames[generalPal]}` : ""}
                                </span>
                            </button>
                        </label>
                    </div>
                    <EffectPickerModal
                        open={effectModalOpen}
                        onClose={() => setEffectModalOpen(false)}
                        effectNames={effectNames}
                        selectedIndex={generalFx}
                        disabled={busy || activeDevices.length === 0}
                        onPick={(idx) => {
                            setGeneralFx(idx);
                            applyGlobalEffectPalette({fx: idx});
                        }}
                    />
                    <PalettePickerModal
                        open={paletteModalOpen}
                        onClose={() => setPaletteModalOpen(false)}
                        paletteNames={paletteNames}
                        selectedIndex={generalPal}
                        disabled={busy || activeDevices.length === 0}
                        onPick={(idx) => {
                            setGeneralPal(idx);
                            applyGlobalEffectPalette({pal: idx});
                        }}
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="form-control">
                            <span className="label-text text-xs">Speed (sx) — {generalSx}</span>
                            <input
                                type="range"
                                min={0}
                                max={255}
                                className="range range-sm"
                                value={generalSx}
                                onChange={(e) => {
                                    const next = readNumber(e.target.value, 128);
                                    setGeneralSx(next);
                                    applyGlobalEffectPalette({sx: next});
                                }}
                                disabled={busy || activeDevices.length === 0}
                            />
                        </label>
                        <label className="form-control">
                            <span className="label-text text-xs">Intensity (ix) — {generalIx}</span>
                            <input
                                type="range"
                                min={0}
                                max={255}
                                className="range range-sm"
                                value={generalIx}
                                onChange={(e) => {
                                    const next = readNumber(e.target.value, 128);
                                    setGeneralIx(next);
                                    applyGlobalEffectPalette({ix: next});
                                }}
                                disabled={busy || activeDevices.length === 0}
                            />
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
