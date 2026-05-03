import type { Dispatch, SetStateAction } from "react";
import type { JSONMap, WLEDDevice } from "../../types/controller";
import { readNumber } from "../../lib/json";

export type PresetsPanelProps = {
  devices: WLEDDevice[];
  busy: boolean;
  presetBri: number;
  setPresetBri: Dispatch<SetStateAction<number>>;
  presetRgb: [number, number, number];
  setPresetRgb: Dispatch<SetStateAction<[number, number, number]>>;
  onSetGlobalState: (state: JSONMap, label: string) => void;
  onToggleOneDevice: (deviceId: string) => void;
  applyPresetColor: () => void;
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
  applyPresetColor,
  applyWarmWhitePreset,
}: PresetsPanelProps) {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold">Presets</h2>
        <p className="text-sm opacity-70 mt-1">
          Control all discovered WLED devices together (POST <code className="text-xs">/json/state</code>). Default scene is warm white.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-success" onClick={() => onSetGlobalState({ on: true }, "All on")} disabled={busy}>
          All on
        </button>
        <button className="btn btn-warning" onClick={() => onSetGlobalState({ on: false }, "All off")} disabled={busy}>
          All off
        </button>
        <button className="btn btn-accent" onClick={() => onSetGlobalState({ on: "t" }, "All toggle")} disabled={busy}>
          All toggle
        </button>
        <button className="btn btn-outline" onClick={applyWarmWhitePreset} disabled={busy}>
          Warm white
        </button>
      </div>

      <div className="card bg-base-200 shadow-sm">
        <div className="card-body gap-4">
          <h3 className="font-medium">Color (all devices)</h3>
          <div className="flex flex-wrap items-end gap-4">
            <label className="form-control">
              <span className="label-text text-xs">Red</span>
              <input
                type="number"
                min={0}
                max={255}
                className="input input-bordered input-sm w-24"
                value={presetRgb[0]}
                onChange={(e) => setPresetRgb([readNumber(e.target.value, 0), presetRgb[1], presetRgb[2]])}
              />
            </label>
            <label className="form-control">
              <span className="label-text text-xs">Green</span>
              <input
                type="number"
                min={0}
                max={255}
                className="input input-bordered input-sm w-24"
                value={presetRgb[1]}
                onChange={(e) => setPresetRgb([presetRgb[0], readNumber(e.target.value, 0), presetRgb[2]])}
              />
            </label>
            <label className="form-control">
              <span className="label-text text-xs">Blue</span>
              <input
                type="number"
                min={0}
                max={255}
                className="input input-bordered input-sm w-24"
                value={presetRgb[2]}
                onChange={(e) => setPresetRgb([presetRgb[0], presetRgb[1], readNumber(e.target.value, 0)])}
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
              />
            </label>
            <span className="badge badge-neutral">{presetBri}</span>
            <button className="btn btn-primary btn-sm" onClick={applyPresetColor} disabled={busy}>
              Apply color
            </button>
          </div>
        </div>
      </div>

      <div className="card bg-base-200 shadow-sm">
        <div className="card-body gap-3">
          <h3 className="font-medium">Per-device switches</h3>
          <p className="text-sm opacity-70">
            Each control sends <code className="text-xs">{"{ \"on\": \"t\" }"}</code> to that device.
          </p>
          {devices.length === 0 ? (
            <p className="text-sm opacity-60">No devices yet. Use Discover in the header or wait for discovery.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {devices.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`btn btn-sm h-auto min-h-[3.5rem] flex flex-col gap-0.5 py-2 ${d.online ? "btn-outline border-success/50" : "btn-ghost opacity-60"}`}
                  onClick={() => onToggleOneDevice(d.id)}
                  disabled={busy}
                >
                  <span className="font-medium text-left w-full truncate">{d.name}</span>
                  <span className="text-[10px] opacity-70 w-full text-left">{d.online ? "Online" : "Offline"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
