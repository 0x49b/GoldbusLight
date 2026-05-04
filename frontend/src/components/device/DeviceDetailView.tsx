import {type Dispatch, type SetStateAction, useState} from "react";
import {prettyJSON, readNumber} from "../../lib/json";
import {hexToRgb, rgbToHex} from "../../lib/wled";
import type {JSONMap, WLEDDevice, WLEDDeviceDetail} from "../../types/controller";
import {PiPower} from "react-icons/pi";
import {EffectPickerModal} from "./EffectPickerModal";
import {PalettePickerModal} from "./PalettePickerModal";

export type DeviceDetailViewProps = {
    device: WLEDDevice | undefined;
    deviceDetail: WLEDDeviceDetail | null;
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

    if (!d) {
        return <p className="opacity-70">Device not found.</p>;
    }

    const liveOnline = detail?.online ?? d.online;
    const stateObj = detail?.state as JSONMap | undefined;
    const segList = stateObj && Array.isArray(stateObj.seg) ? (stateObj.seg as unknown[]) : [];
    const segCount = segList.length;
    const last = d.lastState as JSONMap | undefined;
    const powerOn: boolean | undefined =
        stateObj && typeof stateObj.on === "boolean"
            ? stateObj.on
            : last && typeof last.on === "boolean"
                ? last.on
                : undefined;

    return (
        <div className="space-y-6 w-full max-w-none pb-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-3 min-w-0 flex-1">
                    {editingDeviceName ? (
                        <div className="flex flex-wrap items-end gap-2">
                            <label className="form-control flex-1 min-w-[14rem] max-w-md">
                                <span className="label-text text-xs">Device name</span>
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
                                Edit name
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
                    <button className="btn btn-sm" onClick={() => onRefreshDevice(d.id)}
                            disabled={busy}>
                        Refresh
                    </button>
                    <button className="btn btn-sm btn-secondary"
                            onClick={() => onProvisionDevice(d.id)} disabled={busy}>
                        Provision
                    </button>
                    <button className="btn btn-sm btn-warning btn-outline"
                            onClick={() => onIgnoreDevice(d.id)} disabled={busy}>
                        Ignore device
                    </button>
                    <button className="btn btn-sm btn-error btn-outline"
                            onClick={() => onRemoveDevice(d.id)} disabled={busy}>
                        Forget
                    </button>
                </div>
            </div>

            {!detail?.state && liveOnline &&
                <p className="text-sm opacity-70">Loading device state…</p>}

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

            <div className="card bg-base-100 card-bordered border-gray-500">
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
                            <PiPower className="text-lg shrink-0" aria-hidden />
                            {powerOn === true ? "On" : powerOn === false ? "Off" : "…"}
                        </button>
                    </div>
                </div>
            </div>

            <div className="card bg-base-100 card-bordered border-gray-500">
                <div className="card-body gap-4">
                    <h3 className="font-medium">Color & brightness</h3>
                    <p className="text-xs opacity-60">
                        Changes apply automatically (debounced). Same fields as the WLED web UI:
                        primary color for segment {selectedSegIdx}, global brightness and transition (
                        <a className="link" href="https://kno.wled.ge/interfaces/json-api"
                           target="_blank" rel="noreferrer">
                            JSON API
                        </a>
                        ).
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                        <label className="flex flex-col gap-1">
                            <span className="text-xs opacity-70">Color wheel</span>
                            <input
                                type="color"
                                className="h-12 w-24 cursor-pointer rounded border border-base-300 bg-base-100"
                                value={rgbToHex(deviceFormRgb[0], deviceFormRgb[1], deviceFormRgb[2])}
                                onChange={(e) => setDeviceFormRgb(hexToRgb(e.target.value))}
                                disabled={busy || !liveOnline}
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
                                    disabled={busy || !liveOnline}
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
                                    disabled={busy || !liveOnline}
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
                                    disabled={busy || !liveOnline}
                                />
                            </label>
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
                                disabled={busy || !liveOnline}
                            />
                        </label>
                        <span className="badge badge-neutral shrink-0">{deviceFormBri}</span>
                        <label className="form-control min-w-[140px]">
                            <span className="label-text text-xs">Transition (×100 ms)</span>
                            <input
                                type="number"
                                min={0}
                                max={255}
                                className="input input-bordered input-sm"
                                value={deviceFormTransition}
                                onChange={(e) => setDeviceFormTransition(readNumber(e.target.value, 7))}
                                disabled={busy || !liveOnline}
                            />
                        </label>
                    </div>
                </div>
            </div>

            <div className="card bg-base-100 card-bordered border-gray-500">
                <div className="card-body gap-4">
                    <h3 className="font-medium">Effect & palette</h3>
                    <p className="text-xs opacity-60">
                        Tap to choose from the list; speed and intensity apply automatically. See{" "}
                        <a className="link" href="https://kno.wled.ge/interfaces/json-api"
                           target="_blank" rel="noreferrer">
                            kno.wled.ge — JSON API
                        </a>
                        .
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="form-control">
                            <span className="label-text text-xs">Effect</span>
                            <button
                                type="button"
                                className="select select-bordered select-sm h-auto min-h-10 w-full cursor-pointer text-left font-normal"
                                disabled={busy || !liveOnline}
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
                                className="select select-bordered select-sm h-auto min-h-10 w-full cursor-pointer text-left font-normal"
                                disabled={busy || !liveOnline}
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
                        disabled={busy || !liveOnline}
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
                        disabled={busy || !liveOnline}
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
                                disabled={busy || !liveOnline}
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
                                disabled={busy || !liveOnline}
                            />
                        </label>
                    </div>
                </div>
            </div>

            <div className="collapse bg-base-100 border border-gray-500">
  <input type="checkbox" />
  <div className="collapse-title font-semibold">State & Config</div>
  <div className="collapse-content text-sm grid gap-5">
   


            <div className="grid gap-4 lg:grid-cols-2">
                <div className="card bg-base-200 shadow-sm">
                    <div className="card-body">
                        <h3 className="font-medium text-sm mb-2">Device info (GET /json)</h3>
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
                    <h3 className="font-medium text-sm mb-2">Current state (GET /json → state)</h3>
                    <pre
                        className="text-xs overflow-auto max-h-72 rounded bg-base-100 p-2 border border-base-300 whitespace-pre-wrap">
            {detail?.state ? prettyJSON(detail.state) : "—"}
          </pre>
                </div>
            </div>

            {d.lastState && Object.keys(d.lastState).length > 0 && (
                <div className="text-xs opacity-60">
                    <span className="font-medium opacity-80">Persisted last state</span> (restored
                    on reconnect):{" "}
                    <code className="break-all">{prettyJSON(d.lastState).slice(0, 200)}…</code>
                </div>
            )}

</div>
</div>
        </div>
    );
}
