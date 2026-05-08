import {type Dispatch, type SetStateAction, useEffect, useRef, useState} from "react";
import {prettyJSON, readNumber} from "../../lib/json";
import type {JSONMap, WLEDDevice, WLEDDeviceDetail} from "../../types/controller";
import {
    PiArrowClockwise,
    PiFire,
    PiIceCream,
    PiPalette,
    PiPower,
    PiTrash,
    PiX,
    PiPencil
} from "react-icons/pi";
import {EffectPickerModal} from "./EffectPickerModal";
import {PalettePickerModal} from "./PalettePickerModal";
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
} from "../../lib/wled";

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
    const huePendingRef = useRef<number | null>(null);
    const hueRafRef = useRef<number | null>(null);
    const colorPresetDropdownRef = useRef<HTMLDetailsElement>(null);

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
    const powerButtonVariant =
        powerOn === true
            ? "btn-success"
            : powerOn === false
                ? "btn-error"
                : "btn-ghost";
    const hueValue = rgbToHue(deviceFormRgb[0], deviceFormRgb[1], deviceFormRgb[2]);
    const applySegmentColorPreset = (rgb: [number, number, number]) => {
        setDeviceFormRgb(rgb);
        onSetDeviceState(d.id, {
            seg: [
                {
                    id: selectedSegIdx,
                    col: [rgb],
                },
            ],
        });
    };

    useEffect(() => {
        return () => {
            if (hueRafRef.current !== null) {
                window.cancelAnimationFrame(hueRafRef.current);
                hueRafRef.current = null;
            }
        };
    }, []);

    return (
        <div className="space-y-6 w-full max-w-none pb-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-3 min-w-0 flex-1">
                    {editingDeviceName ? (
                        <div className="flex flex-wrap items-end gap-2">
                            <label className="form-control flex-1 min-w-[14rem] max-w-md">

                                <input
                                    className="input input-bordered input-sm w-full"
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
                            <button
                                type="button"
                                className="btn btn-sm btn-primary shrink-0"
                                disabled={busy || !deviceNameDraft.trim() || deviceNameDraft.trim() === d.name}
                                onClick={() => onRenameDevice(d.id, deviceNameDraft.trim())}
                            >
                                Save
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost shrink-0"
                                disabled={busy}
                                onClick={() => {
                                    setEditingDeviceName(false);
                                    setDeviceNameDraft(d.name);
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-semibold truncate min-w-0">{d.name}</h2>
                            <button
                                type="button"
                                className="btn btn-xs btn-outline shrink-0"
                                disabled={busy}
                                onClick={() => {
                                    setDeviceNameDraft(d.name);
                                    setEditingDeviceName(true);
                                }}
                            >
                                <PiPencil/>
                            </button>
                        </div>
                    )}
                    <p className="text-sm opacity-70 font-mono">
                        {d.address}:{d.port} • {d.id}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
            <span className={`badge ${liveOnline ? "badge-success" : "badge-ghost"}`}>
              {liveOnline ? "Connected" : "Unreachable"}
            </span>
                        {detail?.error && liveOnline === false && (
                            <span className="text-xs opacity-70 max-w-xl">{detail.error}</span>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={`btn btn-sm whitespace-nowrap inline-flex items-center justify-center gap-2 shrink-0 ${
                            powerButtonVariant
                        }`}
                        onClick={() => onSetDeviceState(d.id, {on: powerOn !== true})}
                        disabled={powerDisabled}
                    >
                        <PiPower className="text-lg shrink-0" aria-hidden/>
                    </button>

                    <div className="tooltip tooltip-bottom" data-tip="reload">
                        <button className="btn btn-sm" onClick={() => onRefreshDevice(d.id)}
                                disabled={busy}>
                            <PiArrowClockwise/>
                        </button>
                    </div>
                    <div className="tooltip tooltip-bottom" data-tip="ignore">
                        <button className="btn btn-sm btn-error btn-outline"
                                onClick={() => setConfirmAction("ignore")} disabled={busy}>
                            <PiX/>
                        </button>
                    </div>
                    <div className="tooltip tooltip-bottom" data-tip="forget">
                        <button className="btn btn-sm btn-error btn-outline"
                                onClick={() => setConfirmAction("remove")} disabled={busy}>
                            <PiTrash/>
                        </button>
                    </div>
                </div>
            </div>
            {confirmAction && (
                <div className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg">
                            {confirmAction === "ignore" ? "Ignore device?" : "Forget device?"}
                        </h3>
                        <p className="py-3 text-sm opacity-80">
                            {confirmAction === "ignore"
                                ? `Are you sure you want to ignore "${d.name}"?`
                                : `Are you sure you want to forget "${d.name}"?`}
                        </p>
                        <p className="text-xs opacity-70">
                            {confirmAction === "ignore"
                                ? "This device will be ignored and hidden from active management."
                                : "This device will be removed from the controller list."}
                        </p>
                        <div className="modal-action">
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setConfirmAction(null)}
                                disabled={busy}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-error btn-sm"
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
                            </button>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="modal-backdrop"
                        onClick={() => setConfirmAction(null)}
                        disabled={busy}
                        aria-label="Close confirmation dialog"
                    />
                </div>
            )}

            {(deviceDetailInitializing || deviceDetailReloading || (!detail?.state && liveOnline)) && (
                <div className="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="device-state-loading-title">
                    <div className="modal-box flex items-center gap-3">
                        <span className="loading loading-spinner loading-md text-primary" aria-hidden />
                        <p id="device-state-loading-title" className="font-medium">
                            Refreshing device state ...
                        </p>
                    </div>
                    <div className="modal-backdrop" />
                </div>
            )}

            {segCount > 1 && (
                <div className="card bg-base-200 shadow-sm">
                    <div className="card-body gap-2 py-4">
                        <label className="form-control w-full max-w-md">
                            <span className="label-text text-xs">Segment</span>
                            <select
                                className="select select-bordered select-sm"
                                value={selectedSegIdx}
                                onChange={(e) => setSelectedSegIdx(readNumber(e.target.value, 0))}
                                disabled={!liveOnline}
                            >
                                {segList.map((raw, i) => {
                                    const s = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as JSONMap) : {};
                                    const sid = readNumber(s.id, i);
                                    const nm = typeof s.name === "string" && s.name.trim() ? s.name : `Segment ${sid}`;
                                    return (
                                        <option key={i} value={i}>
                                            {nm} (id {sid})
                                        </option>
                                    );
                                })}
                            </select>
                        </label>
                    </div>
                </div>
            )}

            {/*<div className="card bg-base-100 card-bordered border-gray-500">
                <div className="card-body gap-3">
                    <h3 className="font-medium">Power</h3>
                    <div className="flex flex-wrap gap-2 items-center">
                        <button
                            type="button"
                            className={`btn btn-sm min-w-[11rem] whitespace-nowrap inline-flex items-center justify-center gap-2 shrink-0 ${
                                powerOn === true
                                    ? "btn-success"
                                    : powerOn === false
                                        ? "btn-error"
                                        : "btn-ghost"
                            }`}
                            onClick={() => onSetDeviceState(d.id, {on: powerOn !== true})}
                            disabled={busy || !liveOnline || powerOn === undefined}
                        >
                            <PiPower className="text-lg shrink-0" aria-hidden/>
                            {powerOn === true ? "On" : powerOn === false ? "Off" : "…"}
                        </button>
                    </div>
                </div>
            </div>*/}



            <div className="card bg-base-100 card-bordered border-gray-500">
                <div className="card-body gap-4">
                    <h3 className="font-medium">Color & brightness</h3>
                    <p className="text-xs opacity-60">
                        Changes apply automatically (debounced). Same fields as the WLED web UI:
                        primary color for segment {selectedSegIdx}, global brightness and
                        transition.
                    </p>
                    <div className="flex flex-wrap items-start gap-4">
                        <div className="flex flex-col gap-3">
                            <label className="flex flex-col gap-1">
                                <span className="text-xs opacity-70">Hue</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={360}
                                    step={1}
                                    className="hue-slider w-56"
                                    style={{background: "linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)"}}
                                    value={hueValue}
                                    onChange={(e) => {
                                        const nextHue = readNumber(e.target.value, 0);
                                        huePendingRef.current = nextHue;
                                        if (hueRafRef.current !== null) {
                                            return;
                                        }
                                        hueRafRef.current = window.requestAnimationFrame(() => {
                                            hueRafRef.current = null;
                                            const pendingHue = huePendingRef.current;
                                            if (pendingHue === null) {
                                                return;
                                            }
                                            huePendingRef.current = null;
                                            const nextRgb = hueToRgb(pendingHue);
                                            setDeviceFormRgb(nextRgb);
                                        });
                                    }}
                                    disabled={lightControlsLocked}
                                />
                            </label>
                            <div className="flex flex-wrap items-end gap-2">
                            <label className="form-control">
                                <span className="label-text text-xs">R</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={255}
                                    className="input input-bordered input-sm w-20"
                                    value={deviceFormRgb[0]}
                                    onChange={(e) => setDeviceFormRgb([readNumber(e.target.value, 0), deviceFormRgb[1], deviceFormRgb[2]])}
                                    disabled={lightControlsLocked}
                                />
                            </label>
                            <label className="form-control">
                                <span className="label-text text-xs">G</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={255}
                                    className="input input-bordered input-sm w-20"
                                    value={deviceFormRgb[1]}
                                    onChange={(e) => setDeviceFormRgb([deviceFormRgb[0], readNumber(e.target.value, 0), deviceFormRgb[2]])}
                                    disabled={lightControlsLocked}
                                />
                            </label>
                            <label className="form-control">
                                <span className="label-text text-xs">B</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={255}
                                    className="input input-bordered input-sm w-20"
                                    value={deviceFormRgb[2]}
                                    onChange={(e) => setDeviceFormRgb([deviceFormRgb[0], deviceFormRgb[1], readNumber(e.target.value, 0)])}
                                    disabled={lightControlsLocked}
                                />
                            </label>
                            </div>
                        </div>
                        <label className="form-control flex-1 min-w-[200px]">
                            <span className="label-text text-xs">Brightness (bri)</span>
                            <input
                                type="range"
                                min={1}
                                max={255}
                                className="range range-primary range-sm"
                                value={deviceFormBri}
                                onChange={(e) => setDeviceFormBri(readNumber(e.target.value, 180))}
                                disabled={lightControlsLocked}
                            />
                        </label>
                        <span className="badge badge-neutral shrink-0">{deviceFormBri}</span>
                        <div className="w-full grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                className="btn btn-sm btn-active w-full min-w-0 gap-1"
                                onClick={() => applySegmentColorPreset(WARM_WHITE_RGB)}
                                disabled={lightControlsLocked}
                            >
                                <PiFire/>
                                Warm white
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-active w-full min-w-0 gap-1"
                                onClick={() => applySegmentColorPreset(COLD_WHITE_RGB)}
                                disabled={lightControlsLocked}
                            >
                                <PiIceCream/>
                                Cold white
                            </button>
                            <details
                                ref={colorPresetDropdownRef}
                                className={`dropdown dropdown-end min-w-0 w-full ${lightControlsLocked ? "pointer-events-none opacity-50" : ""}`}
                            >
                                <summary className="btn btn-sm btn-active m-0 w-full min-w-0 list-none gap-1 [&::-webkit-details-marker]:hidden">
                                    <PiPalette/>
                                    Color
                                </summary>
                                <ul className="menu dropdown-content rounded-box z-50 w-max bg-base-100 p-2 shadow-sm">
                                    {NAMED_LIGHT_PRESETS.map(({name, rgb}) => (
                                        <li key={name}>
                                            <button
                                                type="button"
                                                className="flex w-full items-center gap-2 whitespace-nowrap text-left active:bg-base-200"
                                                disabled={lightControlsLocked}
                                                onClick={() => {
                                                    applySegmentColorPreset(rgb);
                                                    const root = colorPresetDropdownRef.current;
                                                    if (root) root.open = false;
                                                }}
                                            >
                                                <span
                                                    className="h-4 w-4 shrink-0 rounded-sm border border-base-300"
                                                    style={{backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`}}
                                                    aria-hidden
                                                />
                                                <span>{name}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        </div>
                        <label className="form-control min-w-[140px]">
                            <span className="label-text text-xs">Transition (×100 ms)</span>
                            <input
                                type="number"
                                min={0}
                                max={255}
                                className="input input-bordered input-sm"
                                value={deviceFormTransition}
                                onChange={(e) => setDeviceFormTransition(readNumber(e.target.value, 7))}
                                disabled={lightControlsLocked}
                            />
                        </label>
                    </div>
                </div>
            </div>

            <div className="card bg-base-100 card-bordered border-gray-500">
                <div className="card-body gap-4">
                    <h3 className="font-medium">Effect & palette</h3>
                    <p className="text-xs opacity-60">
                        Tap to choose from the list; speed and intensity apply automatically.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="form-control">
                            <span className="label-text text-xs">Effect</span>
                            <button
                                type="button"
                                className="btn btn-sm h-auto min-h-10 w-full text-left"
                                disabled={lightControlsLocked}
                                onClick={() => setEffectModalOpen(true)}
                            >
                                <span className="block truncate">
                                    {deviceFormFx}
                                    {detail?.effects?.[deviceFormFx] != null
                                        ? `: ${detail.effects[deviceFormFx]}`
                                        : ""}
                                </span>
                            </button>
                        </label>
                        <label className="form-control">
                            <span className="label-text text-xs">Palette</span>
                            <button
                                type="button"
                                className="btn btn-sm h-auto min-h-10 w-full text-left"
                                disabled={lightControlsLocked}
                                onClick={() => setPaletteModalOpen(true)}
                            >
                                <span className="block truncate">
                                    {deviceFormPal}
                                    {detail?.palettes?.[deviceFormPal] != null
                                        ? `: ${detail.palettes[deviceFormPal]}`
                                        : ""}
                                </span>
                            </button>
                        </label>
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
                        <label className="form-control">
                            <span className="label-text text-xs">Speed (sx) — {deviceFormSx}</span>
                            <input
                                type="range"
                                min={0}
                                max={255}
                                className="range range-sm"
                                value={deviceFormSx}
                                onChange={(e) => setDeviceFormSx(readNumber(e.target.value, 128))}
                                disabled={lightControlsLocked}
                            />
                        </label>
                        <label className="form-control">
                            <span
                                className="label-text text-xs">Intensity (ix) — {deviceFormIx}</span>
                            <input
                                type="range"
                                min={0}
                                max={255}
                                className="range range-sm"
                                value={deviceFormIx}
                                onChange={(e) => setDeviceFormIx(readNumber(e.target.value, 128))}
                                disabled={lightControlsLocked}
                            />
                        </label>
                    </div>
                </div>
            </div>

            <div className="collapse bg-base-100 border border-gray-500">
                <input type="checkbox"/>
                <div className="collapse-title font-semibold">State & Config</div>
                <div className="collapse-content text-sm grid gap-5">


                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="card bg-base-200 shadow-sm">
                            <div className="card-body">
                                <h3 className="font-medium text-sm mb-2">Device info (GET
                                    /json)</h3>
                                <pre
                                    className="text-xs overflow-auto max-h-64 rounded bg-base-100 p-2 border border-base-300 whitespace-pre-wrap">
              {detail?.info ? prettyJSON(detail.info) : "—"}
            </pre>
                            </div>
                        </div>
                        <div className="card bg-base-200 shadow-sm">
                            <div className="card-body">
                                <h3 className="font-medium text-sm mb-2">Config (GET /json/cfg)</h3>
                                <pre
                                    className="text-xs overflow-auto max-h-64 rounded bg-base-100 p-2 border border-base-300 whitespace-pre-wrap">
              {detail?.config ? prettyJSON(detail.config) : "—"}
            </pre>
                            </div>
                        </div>
                    </div>

                    <div className="card bg-base-200 shadow-sm">
                        <div className="card-body">
                            <h3 className="font-medium text-sm mb-2">Current state (GET /json →
                                state)</h3>
                            <pre
                                className="text-xs overflow-auto max-h-72 rounded bg-base-100 p-2 border border-base-300 whitespace-pre-wrap">
            {detail?.state ? prettyJSON(detail.state) : "—"}
          </pre>
                        </div>
                    </div>

                    {d.lastState && Object.keys(d.lastState).length > 0 && (
                        <div className="text-xs opacity-60">
                            <span
                                className="font-medium opacity-80">Persisted last state</span> (restored
                            on reconnect):{" "}
                            <code
                                className="break-all">{prettyJSON(d.lastState).slice(0, 200)}…</code>
                        </div>
                    )}

                </div>
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
        r = c; g = x; b = 0;
    } else if (h < 120) {
        r = x; g = c; b = 0;
    } else if (h < 180) {
        r = 0; g = c; b = x;
    } else if (h < 240) {
        r = 0; g = x; b = c;
    } else if (h < 300) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
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
