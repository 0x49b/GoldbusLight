import {useMemo, type Dispatch, type SetStateAction} from "react";
import {PiFire, PiMoon, PiSun} from "react-icons/pi";
import {readNumber} from "../../lib/json";
import {hexToRgb, rgbToHex} from "../../lib/wled";
import type {JSONMap, WLEDDevice} from "../../types/controller";


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
                             }: PresetsPanelProps) {
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
                    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                            type="button"
                            className={`btn btn-active w-full ${allOff ? "btn-error" : "btn-success"}`}
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
                        <button className="btn btn-active w-full" onClick={applyWarmWhitePreset}
                                disabled={busy}>
                            <PiFire/>
                            Warm white
                        </button>
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
