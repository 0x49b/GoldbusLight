import {useMemo, useRef, type Dispatch, type SetStateAction} from "react";
import {PiFire, PiIceCream, PiMoon, PiPalette, PiSun} from "react-icons/pi";
import {readNumber} from "../../lib/json";
import {hexToRgb, rgbToHex} from "../../lib/wled";
import type {JSONMap, WLEDDevice} from "../../types/controller";

const NAMED_LIGHT_PRESETS: ReadonlyArray<{ name: string; rgb: [number, number, number] }> = [
    {name: "Candle", rgb: [255, 147, 41]},
    {name: "40W Tungsten", rgb: [255, 197, 143]},
    {name: "100W Tungsten", rgb: [255, 214, 170]},
    {name: "Halogen", rgb: [255, 241, 224]},
    {name: "Carbon Arc", rgb: [255, 250, 244]},
    {name: "High Noon Sun", rgb: [255, 255, 251]},
    {name: "Direct Sunlight", rgb: [255, 255, 255]},
    {name: "Overcast Sky", rgb: [201, 226, 255]},
    {name: "Clear Blue Sky", rgb: [64, 156, 255]},
    {name: "Warm Fluorescent", rgb: [255, 244, 229]},
    {name: "Standard Fluorescent", rgb: [244, 255, 250]},
    {name: "Cool White Fluorescent", rgb: [212, 235, 255]},
    {name: "Full Spectrum Fluorescent", rgb: [255, 244, 242]},
    {name: "Grow Light Fluorescent", rgb: [255, 239, 247]},
    {name: "Black Light Fluorescent", rgb: [167, 0, 255]},
    {name: "Mercury Vapor", rgb: [216, 247, 255]},
    {name: "Sodium Vapor", rgb: [255, 209, 178]},
    {name: "Metal Halide", rgb: [242, 252, 255]},
    {name: "High Pressure Sodium", rgb: [255, 183, 76]},
];

export type PresetsPanelProps = {
    devices: WLEDDevice[];
    busy: boolean;
    presetBri: number;
    setPresetBri: Dispatch<SetStateAction<number>>;
    presetRgb: [number, number, number];
    setPresetRgb: Dispatch<SetStateAction<[number, number, number]>>;
    onSetGlobalState: (state: JSONMap, label: string) => void;
    onToggleOneDevice: (deviceId: string) => void;
    applyWarmWhitePreset: () => void;
    applyColdWhitePreset: () => void;
    applyNamedColorPreset: (label: string, rgb: [number, number, number]) => void;
};

export function PresetsPanel({
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
                             }: PresetsPanelProps) {
    const namedColorDropdownRef = useRef<HTMLDetailsElement>(null);
    const activeDevices = useMemo(() => devices.filter((d) => !d.ignored), [devices]);
    const allOff = useMemo(() => {
        const known: boolean[] = [];
        for (const d of activeDevices) {
            const last = d.lastState as JSONMap | undefined;
            if (last && typeof last.on === "boolean") known.push(last.on);
        }
        return known.length > 0 && known.every((on) => !on);
    }, [activeDevices]);

    return (
        <div className="space-y-6 w-full max-w-none">
            <div>
                <h2 className="text-xl font-semibold">Presets</h2>
            </div>
            <div className="card bg-base-100">
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
                                    ? onSetGlobalState({on: true}, "All on")
                                    : onSetGlobalState({on: false}, "All off")
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
        </div>
    );
}
