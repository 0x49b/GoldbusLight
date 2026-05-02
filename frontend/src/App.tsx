import { useCallback, useEffect, useMemo, useState } from "react";
import * as GreetService from "../bindings/changeme/greetservice";

type JSONMap = Record<string, unknown>;

type AccessPointSettings = {
  enabled: boolean;
  connection: string;
  interfaceName: string;
  ssid: string;
  password: string;
  channel: number;
};

type UpstreamSettings = {
  autoConnect: boolean;
  interfaceName: string;
  ssid: string;
  password: string;
};

type BridgeSettings = {
  enabled: boolean;
  apInterface: string;
  upstreamInterface: string;
};

type DiscoverySettings = {
  enabled: boolean;
  serviceTypes: string[];
  intervalSeconds: number;
  queryTimeoutMs: number;
};

type ProvisioningSettings = {
  autoProvision: boolean;
  defaultStatePayload: JSONMap;
  defaultConfigPatch: JSONMap;
};

type ControllerSettings = {
  accessPoint: AccessPointSettings;
  upstream: UpstreamSettings;
  bridge: BridgeSettings;
  discovery: DiscoverySettings;
  provisioning: ProvisioningSettings;
};

type WLEDDevice = {
  id: string;
  name: string;
  host: string;
  address: string;
  port: number;
  lastSeen: string;
  online: boolean;
  provisioned: boolean;
  info?: JSONMap;
  lastState?: JSONMap;
};

type ControllerSnapshot = {
  settings: ControllerSettings;
  devices: WLEDDevice[];
  persistencePath: string;
  updatedAt: string;
  capabilities: {
    nmcliAvailable: boolean;
  };
};

type WiFiNetwork = {
  ssid: string;
  signal: number;
  security: string;
};

type NetworkCommandResult = {
  command: string;
  output: string;
  success: boolean;
  error?: string;
};

type NetworkApplyResult = {
  dryRun: boolean;
  warnings?: string[];
  steps: NetworkCommandResult[];
};

type WLEDDeviceDetail = {
  online: boolean;
  error?: string;
  state?: JSONMap;
  info?: JSONMap;
  effects?: string[];
  palettes?: string[];
  config?: JSONMap;
  lastState?: JSONMap;
  address: string;
  port: number;
};

type DetailRoute =
  | { kind: "presets" }
  | { kind: "settings" }
  | { kind: "device"; id: string };

function prettyJSON(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseJSONMap(raw: string): JSONMap {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Value must be a JSON object");
  }
  return parsed as JSONMap;
}

function readBool(input: unknown): boolean {
  return input === true || input === "true" || input === "on" || input === "1";
}

function readNumber(input: unknown, fallback: number): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

function readDeviceBri(device: WLEDDevice): number {
  const bri = device.info?.bri;
  return readNumber(bri, 128);
}

/** WLED warm white example: POST /json/state with seg col [[255,160,0]] */
const WARM_WHITE_RGB: [number, number, number] = [255, 160, 0];

function warmWhiteState(bri: number): JSONMap {
  return {
    on: true,
    bri,
    seg: [{ col: [WARM_WHITE_RGB] }],
  };
}

function rgbState(r: number, g: number, b: number, bri: number, on = true): JSONMap {
  return {
    on,
    bri,
    seg: [{ col: [[r, g, b]] }],
  };
}

function mainSegIndex(state: JSONMap | undefined): number {
  if (!state) return 0;
  const m = state.mainseg;
  if (typeof m === "number" && Number.isFinite(m)) return m;
  return 0;
}

function firstSegment(state: JSONMap | undefined): JSONMap | undefined {
  const segs = state?.seg;
  if (!Array.isArray(segs) || segs.length === 0) return undefined;
  const idx = mainSegIndex(state);
  const seg = segs[idx];
  return seg && typeof seg === "object" && !Array.isArray(seg) ? (seg as JSONMap) : undefined;
}

function segmentFx(seg: JSONMap | undefined): number {
  return readNumber(seg?.fx, 0);
}

function segmentPal(seg: JSONMap | undefined): number {
  return readNumber(seg?.pal, 0);
}

function segmentSx(seg: JSONMap | undefined): number {
  return readNumber(seg?.sx, 128);
}

function segmentIx(seg: JSONMap | undefined): number {
  return readNumber(seg?.ix, 128);
}

function rgbFromSegment(seg: JSONMap | undefined): [number, number, number] {
  const col = seg?.col;
  if (!Array.isArray(col) || col.length === 0) return [...WARM_WHITE_RGB];
  const first = col[0];
  if (Array.isArray(first) && first.length >= 3) {
    return [readNumber(first[0], 255), readNumber(first[1], 160), readNumber(first[2], 0)];
  }
  return [...WARM_WHITE_RGB];
}

function App() {
  const [snapshot, setSnapshot] = useState<ControllerSnapshot | null>(null);
  const [settings, setSettings] = useState<ControllerSettings | null>(null);
  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [applyResult, setApplyResult] = useState<NetworkApplyResult | null>(null);
  const [status, setStatus] = useState<string>("Loading...");
  const [error, setError] = useState<string>("");
  const [statePayloadText, setStatePayloadText] = useState<string>('{"on":true,"bri":180}');
  const [configPatchText, setConfigPatchText] = useState<string>("{}");
  const [presetBri, setPresetBri] = useState<number>(200);
  const [presetRgb, setPresetRgb] = useState<[number, number, number]>([...WARM_WHITE_RGB]);
  const [busy, setBusy] = useState<boolean>(false);
  const [route, setRoute] = useState<DetailRoute>({ kind: "presets" });
  const [deviceDetail, setDeviceDetail] = useState<WLEDDeviceDetail | null>(null);
  const [deviceFormFx, setDeviceFormFx] = useState(0);
  const [deviceFormPal, setDeviceFormPal] = useState(0);
  const [deviceFormSx, setDeviceFormSx] = useState(128);
  const [deviceFormIx, setDeviceFormIx] = useState(128);
  const [deviceFormRgb, setDeviceFormRgb] = useState<[number, number, number]>([255, 0, 0]);
  const [deviceFormBri, setDeviceFormBri] = useState(180);

  const devices = useMemo(() => snapshot?.devices ?? [], [snapshot]);

  const selectedDevice = useMemo(() => {
    if (route.kind !== "device") return undefined;
    return devices.find((d) => d.id === route.id);
  }, [devices, route]);

  const pullSnapshot = useCallback(async () => {
    const next = (await GreetService.GetControllerSnapshot()) as ControllerSnapshot;
    setSnapshot(next);
    setSettings(next.settings);
    setStatePayloadText(prettyJSON(next.settings.provisioning.defaultStatePayload ?? {}));
    setConfigPatchText(prettyJSON(next.settings.provisioning.defaultConfigPatch ?? {}));
    setStatus(`Updated ${new Date(next.updatedAt).toLocaleTimeString()}`);
    setError("");
  }, []);

  useEffect(() => {
    void pullSnapshot().catch((err: unknown) => {
      setError(String(err));
    });
    const timer = window.setInterval(() => {
      void pullSnapshot().catch((err: unknown) => {
        setError(String(err));
      });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [pullSnapshot]);

  const loadDeviceDetail = useCallback(async (deviceId: string) => {
    try {
      const d = (await GreetService.GetDeviceDetail(deviceId)) as WLEDDeviceDetail;
      setDeviceDetail(d);
      if (d.state) {
        const seg = firstSegment(d.state);
        setDeviceFormFx(segmentFx(seg));
        setDeviceFormPal(segmentPal(seg));
        setDeviceFormSx(segmentSx(seg));
        setDeviceFormIx(segmentIx(seg));
        setDeviceFormRgb(rgbFromSegment(seg));
        setDeviceFormBri(readNumber(d.state.bri, 180));
      }
    } catch (e) {
      setDeviceDetail({
        online: false,
        error: String(e),
        address: "",
        port: 80,
      });
    }
  }, []);

  useEffect(() => {
    if (route.kind !== "device") {
      setDeviceDetail(null);
      return;
    }
    void loadDeviceDetail(route.id);
    const t = window.setInterval(() => {
      void loadDeviceDetail(route.id);
    }, 5000);
    return () => window.clearInterval(t);
  }, [route, loadDeviceDetail]);

  const withBusy = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const onSaveSettings = useCallback(() => {
    if (!settings) {
      return;
    }
    void withBusy(async () => {
      const statePayload = parseJSONMap(statePayloadText);
      const configPatch = parseJSONMap(configPatchText);

      const merged: ControllerSettings = {
        ...settings,
        provisioning: {
          ...settings.provisioning,
          defaultStatePayload: statePayload,
          defaultConfigPatch: configPatch,
        },
      };

      const saved = (await GreetService.SaveControllerSettings(merged)) as ControllerSnapshot;
      setSnapshot(saved);
      setSettings(saved.settings);
      setStatus("Settings saved");
      setError("");
    });
  }, [configPatchText, settings, statePayloadText, withBusy]);

  const onScanNetworks = useCallback(() => {
    void withBusy(async () => {
      const discovered = (await GreetService.ScanNetworks()) as WiFiNetwork[];
      setNetworks(discovered);
      setStatus(`Found ${discovered.length} upstream Wi-Fi networks`);
    });
  }, [withBusy]);

  const onApplyNetwork = useCallback(() => {
    void withBusy(async () => {
      const result = (await GreetService.ApplyNetworkSettings()) as NetworkApplyResult;
      setApplyResult(result);
      setStatus(result.dryRun ? "Network apply simulated (dry run)" : "Network settings applied");
    });
  }, [withBusy]);

  const onDiscoverNow = useCallback(() => {
    void withBusy(async () => {
      await GreetService.DiscoverDevicesNow();
      await pullSnapshot();
      setStatus("Discovery complete");
    });
  }, [pullSnapshot, withBusy]);

  const onSetGlobalState = useCallback(
    (state: JSONMap, label: string) => {
      void withBusy(async () => {
        const result = await GreetService.SetGlobalState(state);
        setStatus(`${label}: ${Object.keys(result).length} targets`);
        await pullSnapshot();
      });
    },
    [pullSnapshot, withBusy],
  );

  const onRefreshDevice = useCallback(
    (deviceID: string) => {
      void withBusy(async () => {
        const refreshed = (await GreetService.RefreshDevice(deviceID)) as ControllerSnapshot;
        setSnapshot(refreshed);
        setSettings(refreshed.settings);
        setStatus(`Device refreshed`);
        if (route.kind === "device" && route.id === deviceID) {
          await loadDeviceDetail(deviceID);
        }
      });
    },
    [loadDeviceDetail, route, withBusy],
  );

  const onProvisionDevice = useCallback(
    (deviceID: string) => {
      void withBusy(async () => {
        const updated = (await GreetService.ProvisionDevice(deviceID)) as ControllerSnapshot;
        setSnapshot(updated);
        setSettings(updated.settings);
        setStatus(`Device provisioned`);
        if (route.kind === "device" && route.id === deviceID) {
          await loadDeviceDetail(deviceID);
        }
      });
    },
    [loadDeviceDetail, route, withBusy],
  );

  const onRemoveDevice = useCallback(
    (deviceID: string) => {
      void withBusy(async () => {
        const updated = (await GreetService.RemoveDevice(deviceID)) as ControllerSnapshot;
        setSnapshot(updated);
        setSettings(updated.settings);
        setStatus(`Device removed`);
        setRoute({ kind: "presets" });
      });
    },
    [withBusy],
  );

  const onSetDeviceState = useCallback(
    (deviceID: string, state: JSONMap) => {
      void withBusy(async () => {
        await GreetService.SetDeviceState(deviceID, state);
        await pullSnapshot();
        setStatus(`Device updated`);
        if (route.kind === "device" && route.id === deviceID) {
          await loadDeviceDetail(deviceID);
        }
      });
    },
    [loadDeviceDetail, pullSnapshot, route, withBusy],
  );

  const onToggleOneDevice = useCallback(
    (deviceID: string) => {
      onSetDeviceState(deviceID, { on: "t" });
    },
    [onSetDeviceState],
  );

  const applyPresetColor = useCallback(() => {
    const [r, g, b] = presetRgb;
    onSetGlobalState(rgbState(r, g, b, presetBri, true), "All devices color");
  }, [onSetGlobalState, presetBri, presetRgb]);

  const applyWarmWhitePreset = useCallback(() => {
    setPresetRgb([...WARM_WHITE_RGB]);
    onSetGlobalState(warmWhiteState(presetBri), "Warm white (all)");
  }, [onSetGlobalState, presetBri]);

  const renderPresets = () => (
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
          <p className="text-sm opacity-70">Each control sends <code className="text-xs">{"{ \"on\": \"t\" }"}</code> to that device.</p>
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

  const renderSettings = () =>
    settings ? (
      <div className="space-y-5 max-w-5xl pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Controller settings</h2>
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={onScanNetworks} disabled={busy}>
              Scan Wi-Fi
            </button>
            <button className="btn btn-sm btn-secondary" onClick={onApplyNetwork} disabled={busy}>
              Apply network
            </button>
          </div>
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body space-y-3">
              <h3 className="card-title text-base">Access point / upstream</h3>

              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={settings.accessPoint.enabled}
                  onChange={(e) =>
                    setSettings({ ...settings, accessPoint: { ...settings.accessPoint, enabled: e.target.checked } })
                  }
                />
                <span className="label-text">Enable local AP</span>
              </label>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  className="input input-bordered input-sm"
                  placeholder="AP connection name"
                  value={settings.accessPoint.connection}
                  onChange={(e) =>
                    setSettings({ ...settings, accessPoint: { ...settings.accessPoint, connection: e.target.value } })
                  }
                />
                <input
                  className="input input-bordered input-sm"
                  placeholder="AP interface"
                  value={settings.accessPoint.interfaceName}
                  onChange={(e) =>
                    setSettings({ ...settings, accessPoint: { ...settings.accessPoint, interfaceName: e.target.value } })
                  }
                />
                <input
                  className="input input-bordered input-sm"
                  placeholder="AP SSID"
                  value={settings.accessPoint.ssid}
                  onChange={(e) =>
                    setSettings({ ...settings, accessPoint: { ...settings.accessPoint, ssid: e.target.value } })
                  }
                />
                <input
                  className="input input-bordered input-sm"
                  placeholder="AP password"
                  value={settings.accessPoint.password}
                  onChange={(e) =>
                    setSettings({ ...settings, accessPoint: { ...settings.accessPoint, password: e.target.value } })
                  }
                />
                <input
                  className="input input-bordered input-sm"
                  type="number"
                  min={1}
                  max={13}
                  placeholder="Channel"
                  value={settings.accessPoint.channel}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      accessPoint: { ...settings.accessPoint, channel: readNumber(e.target.value, 6) },
                    })
                  }
                />
              </div>

              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="toggle toggle-secondary"
                  checked={settings.upstream.autoConnect}
                  onChange={(e) =>
                    setSettings({ ...settings, upstream: { ...settings.upstream, autoConnect: e.target.checked } })
                  }
                />
                <span className="label-text">Auto-connect upstream Wi-Fi</span>
              </label>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  className="input input-bordered input-sm"
                  placeholder="Upstream interface"
                  value={settings.upstream.interfaceName}
                  onChange={(e) =>
                    setSettings({ ...settings, upstream: { ...settings.upstream, interfaceName: e.target.value } })
                  }
                />
                <input
                  className="input input-bordered input-sm"
                  placeholder="Upstream SSID"
                  value={settings.upstream.ssid}
                  onChange={(e) => setSettings({ ...settings, upstream: { ...settings.upstream, ssid: e.target.value } })}
                />
                <input
                  className="input input-bordered input-sm"
                  placeholder="Upstream password"
                  value={settings.upstream.password}
                  onChange={(e) =>
                    setSettings({ ...settings, upstream: { ...settings.upstream, password: e.target.value } })
                  }
                />
              </div>

              <div className="divider my-1 text-xs">Bridge / NAT</div>
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="toggle toggle-accent"
                  checked={settings.bridge.enabled}
                  onChange={(e) => setSettings({ ...settings, bridge: { ...settings.bridge, enabled: e.target.checked } })}
                />
                <span className="label-text">Enable AP to upstream NAT</span>
              </label>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  className="input input-bordered input-sm"
                  placeholder="Bridge AP interface"
                  value={settings.bridge.apInterface}
                  onChange={(e) =>
                    setSettings({ ...settings, bridge: { ...settings.bridge, apInterface: e.target.value } })
                  }
                />
                <input
                  className="input input-bordered input-sm"
                  placeholder="Bridge upstream interface"
                  value={settings.bridge.upstreamInterface}
                  onChange={(e) =>
                    setSettings({ ...settings, bridge: { ...settings.bridge, upstreamInterface: e.target.value } })
                  }
                />
              </div>
            </div>
          </div>

          <div className="card bg-base-200 shadow-sm">
            <div className="card-body space-y-3">
              <h3 className="card-title text-base">Discovery / provisioning</h3>
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="toggle"
                  checked={settings.discovery.enabled}
                  onChange={(e) =>
                    setSettings({ ...settings, discovery: { ...settings.discovery, enabled: e.target.checked } })
                  }
                />
                <span className="label-text">Enable mDNS discovery loop</span>
              </label>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  className="input input-bordered input-sm"
                  type="number"
                  min={2}
                  value={settings.discovery.intervalSeconds}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      discovery: { ...settings.discovery, intervalSeconds: readNumber(e.target.value, 15) },
                    })
                  }
                  placeholder="Interval (s)"
                />
                <input
                  className="input input-bordered input-sm"
                  type="number"
                  min={500}
                  value={settings.discovery.queryTimeoutMs}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      discovery: { ...settings.discovery, queryTimeoutMs: readNumber(e.target.value, 2000) },
                    })
                  }
                  placeholder="Query timeout ms"
                />
              </div>

              <input
                className="input input-bordered input-sm"
                placeholder="Service types (comma separated)"
                value={settings.discovery.serviceTypes.join(",")}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    discovery: {
                      ...settings.discovery,
                      serviceTypes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    },
                  })
                }
              />

              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={settings.provisioning.autoProvision}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      provisioning: { ...settings.provisioning, autoProvision: e.target.checked },
                    })
                  }
                />
                <span className="label-text">Auto-provision newly discovered devices</span>
              </label>

              <div>
                <label className="label py-0"><span className="label-text text-xs">Default /json/state payload</span></label>
                <textarea
                  className="textarea textarea-bordered w-full h-24 font-mono text-xs"
                  value={statePayloadText}
                  onChange={(e) => setStatePayloadText(e.target.value)}
                />
              </div>

              <div>
                <label className="label py-0"><span className="label-text text-xs">Default /json/cfg patch</span></label>
                <textarea
                  className="textarea textarea-bordered w-full h-24 font-mono text-xs"
                  value={configPatchText}
                  onChange={(e) => setConfigPatchText(e.target.value)}
                />
              </div>

              <button className="btn btn-primary btn-sm" onClick={onSaveSettings} disabled={busy}>
                Save settings
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body">
              <h3 className="card-title text-base">Network apply result</h3>
              {!applyResult && <p className="text-sm opacity-70">No apply action yet.</p>}
              {applyResult && (
                <div className="space-y-2">
                  <p className="text-sm">{applyResult.dryRun ? "Dry-run (nmcli unavailable)" : "Applied"}</p>
                  {(applyResult.warnings ?? []).map((warning) => (
                    <div key={warning} className="alert alert-warning py-1 text-xs">
                      {warning}
                    </div>
                  ))}
                  <div className="max-h-48 overflow-auto rounded border border-base-300 p-2 bg-base-100">
                    <pre className="text-xs whitespace-pre-wrap">{prettyJSON(applyResult.steps)}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card bg-base-200 shadow-sm">
            <div className="card-body">
              <h3 className="card-title text-base">Scanned upstream Wi-Fi</h3>
              {networks.length === 0 && <p className="text-sm opacity-70">Run Scan Wi-Fi.</p>}
              <ul className="menu bg-base-100 rounded-box border border-base-300 max-h-48 overflow-auto p-0">
                {networks.map((network) => (
                  <li key={`${network.ssid}-${network.signal}`}>
                    <span className="flex justify-between text-sm">
                      <span>{network.ssid}</span>
                      <span className="text-xs opacity-70">
                        {network.signal}% • {network.security}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {snapshot && (
          <p className="text-xs opacity-60">
            Persistence: <code>{snapshot.persistencePath}</code> • nmcli: {String(snapshot.capabilities.nmcliAvailable)}
          </p>
        )}
      </div>
    ) : (
      <p className="opacity-70">Loading settings…</p>
    );

  const renderDeviceDetail = () => {
    if (!selectedDevice) {
      return <p className="opacity-70">Device not found.</p>;
    }
    const d = selectedDevice;
    const detail = deviceDetail;
    const liveOnline = detail?.online ?? d.online;
    const segIdx = mainSegIndex(detail?.state as JSONMap | undefined);

    return (
      <div className="space-y-6 max-w-4xl pb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{d.name}</h2>
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
            <button className="btn btn-sm" onClick={() => onRefreshDevice(d.id)} disabled={busy}>
              Refresh
            </button>
            <button className="btn btn-sm btn-secondary" onClick={() => onProvisionDevice(d.id)} disabled={busy}>
              Provision
            </button>
            <button className="btn btn-sm btn-error btn-outline" onClick={() => onRemoveDevice(d.id)} disabled={busy}>
              Forget
            </button>
          </div>
        </div>

        {!detail?.state && liveOnline && <p className="text-sm opacity-70">Loading device state…</p>}

        <div className="card bg-base-200 shadow-sm">
          <div className="card-body gap-3">
            <h3 className="font-medium">Power</h3>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-sm btn-success" onClick={() => onSetDeviceState(d.id, { on: true })} disabled={busy}>
                On
              </button>
              <button className="btn btn-sm btn-warning" onClick={() => onSetDeviceState(d.id, { on: false })} disabled={busy}>
                Off
              </button>
              <button className="btn btn-sm btn-accent" onClick={() => onSetDeviceState(d.id, { on: "t" })} disabled={busy}>
                Toggle
              </button>
            </div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-sm">
          <div className="card-body gap-4">
            <h3 className="font-medium">Color & brightness</h3>
            <p className="text-xs opacity-60">
              Uses segment index {segIdx} (from <code>mainseg</code>). POST fields: <code>on</code>, <code>bri</code>,{" "}
              <code>seg</code> with <code>col</code> RGB triplets per WLED JSON API.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <input
                type="number"
                min={0}
                max={255}
                className="input input-bordered input-sm w-20"
                value={deviceFormRgb[0]}
                onChange={(e) => setDeviceFormRgb([readNumber(e.target.value, 0), deviceFormRgb[1], deviceFormRgb[2]])}
              />
              <input
                type="number"
                min={0}
                max={255}
                className="input input-bordered input-sm w-20"
                value={deviceFormRgb[1]}
                onChange={(e) => setDeviceFormRgb([deviceFormRgb[0], readNumber(e.target.value, 0), deviceFormRgb[2]])}
              />
              <input
                type="number"
                min={0}
                max={255}
                className="input input-bordered input-sm w-20"
                value={deviceFormRgb[2]}
                onChange={(e) => setDeviceFormRgb([deviceFormRgb[0], deviceFormRgb[1], readNumber(e.target.value, 0)])}
              />
              <label className="form-control flex-1 min-w-[180px]">
                <span className="label-text text-xs">Brightness</span>
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
              <button
                className="btn btn-primary btn-sm"
                onClick={() =>
                  onSetDeviceState(d.id, {
                    on: true,
                    bri: deviceFormBri,
                    seg: [{ id: segIdx, col: [deviceFormRgb] }],
                  })
                }
                disabled={busy || !liveOnline}
              >
                Apply color
              </button>
            </div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-sm">
          <div className="card-body gap-4">
            <h3 className="font-medium">Effect & palette</h3>
            <p className="text-xs opacity-60">
              Effect index <code>fx</code>, palette <code>pal</code>, speed <code>sx</code>, intensity <code>ix</code> on the selected segment (
              <a className="link" href="https://github.com/wled/WLED/wiki/JSON-API" target="_blank" rel="noreferrer">
                WLED JSON API
              </a>
              ).
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="form-control">
                <span className="label-text text-xs">Effect # (fx)</span>
                <input
                  type="number"
                  min={0}
                  className="input input-bordered input-sm"
                  value={deviceFormFx}
                  onChange={(e) => setDeviceFormFx(readNumber(e.target.value, 0))}
                  disabled={!liveOnline}
                />
                {detail?.effects && detail.effects[deviceFormFx] && (
                  <span className="label-text-alt opacity-70 truncate">{detail.effects[deviceFormFx]}</span>
                )}
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Palette # (pal)</span>
                <input
                  type="number"
                  min={0}
                  className="input input-bordered input-sm"
                  value={deviceFormPal}
                  onChange={(e) => setDeviceFormPal(readNumber(e.target.value, 0))}
                  disabled={!liveOnline}
                />
                {detail?.palettes && detail.palettes[deviceFormPal] && (
                  <span className="label-text-alt opacity-70 truncate">{detail.palettes[deviceFormPal]}</span>
                )}
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="form-control">
                <span className="label-text text-xs">Speed (sx)</span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  className="range range-sm"
                  value={deviceFormSx}
                  onChange={(e) => setDeviceFormSx(readNumber(e.target.value, 128))}
                  disabled={!liveOnline}
                />
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Intensity (ix)</span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  className="range range-sm"
                  value={deviceFormIx}
                  onChange={(e) => setDeviceFormIx(readNumber(e.target.value, 128))}
                  disabled={!liveOnline}
                />
              </label>
            </div>
            <button
              className="btn btn-sm btn-primary w-fit"
              onClick={() =>
                onSetDeviceState(d.id, {
                  seg: [{ id: segIdx, fx: deviceFormFx, pal: deviceFormPal, sx: deviceFormSx, ix: deviceFormIx }],
                })
              }
              disabled={busy || !liveOnline}
            >
              Apply effect
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body">
              <h3 className="font-medium text-sm mb-2">Device info (GET /json)</h3>
              <pre className="text-xs overflow-auto max-h-64 rounded bg-base-100 p-2 border border-base-300 whitespace-pre-wrap">
                {detail?.info ? prettyJSON(detail.info) : "—"}
              </pre>
            </div>
          </div>
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body">
              <h3 className="font-medium text-sm mb-2">Config (GET /json/cfg)</h3>
              <pre className="text-xs overflow-auto max-h-64 rounded bg-base-100 p-2 border border-base-300 whitespace-pre-wrap">
                {detail?.config ? prettyJSON(detail.config) : "—"}
              </pre>
            </div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-sm">
          <div className="card-body">
            <h3 className="font-medium text-sm mb-2">Current state (GET /json → state)</h3>
            <pre className="text-xs overflow-auto max-h-72 rounded bg-base-100 p-2 border border-base-300 whitespace-pre-wrap">
              {detail?.state ? prettyJSON(detail.state) : "—"}
            </pre>
          </div>
        </div>

        {d.lastState && Object.keys(d.lastState).length > 0 && (
          <div className="text-xs opacity-60">
            <span className="font-medium opacity-80">Persisted last state</span> (restored on reconnect):{" "}
            <code className="break-all">{prettyJSON(d.lastState).slice(0, 200)}…</code>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-base-100 text-base-content flex flex-col h-screen overflow-hidden">
      <header className="border-b border-base-300 px-4 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-lg font-bold leading-tight">WLED Central Controller</h1>
          <p className="text-xs opacity-70">Master presets, per-device control, and settings</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={onDiscoverNow} disabled={busy}>
            Discover now
          </button>
          <button className="btn btn-sm" onClick={() => void pullSnapshot()} disabled={busy}>
            Refresh
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 shrink-0 border-r border-base-300 flex flex-col bg-base-200/50">
          <div className="p-3 text-xs font-semibold uppercase tracking-wide opacity-50">Devices</div>
          <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            <button
              type="button"
              className={`btn btn-sm w-full justify-start font-normal ${route.kind === "presets" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setRoute({ kind: "presets" })}
            >
              Presets
            </button>
            {devices.map((dev) => (
              <button
                key={dev.id}
                type="button"
                className={`btn btn-sm w-full justify-start font-normal h-auto min-h-10 py-2 flex-col items-stretch ${
                  route.kind === "device" && route.id === dev.id ? "btn-primary" : "btn-ghost"
                }`}
                onClick={() => setRoute({ kind: "device", id: dev.id })}
              >
                <span className="truncate text-left w-full">{dev.name}</span>
                <span className="text-[10px] opacity-70 font-normal">{dev.online ? "Online" : "Offline"}</span>
              </button>
            ))}
          </nav>
          <div className="p-2 border-t border-base-300 shrink-0">
            <button
              type="button"
              className={`btn btn-sm w-full ${route.kind === "settings" ? "btn-secondary" : "btn-outline"}`}
              onClick={() => setRoute({ kind: "settings" })}
            >
              Settings
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="alert alert-info text-sm py-2 mb-4">{status}</div>
          {error && (
            <div className="alert alert-error text-sm py-2 mb-4" role="alert">
              {error}
            </div>
          )}

          {route.kind === "presets" && renderPresets()}
          {route.kind === "settings" && renderSettings()}
          {route.kind === "device" && renderDeviceDetail()}
        </main>
      </div>
    </div>
  );
}

export default App;
