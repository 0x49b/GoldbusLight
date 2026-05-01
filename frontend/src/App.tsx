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

function App() {
  const [snapshot, setSnapshot] = useState<ControllerSnapshot | null>(null);
  const [settings, setSettings] = useState<ControllerSettings | null>(null);
  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [applyResult, setApplyResult] = useState<NetworkApplyResult | null>(null);
  const [status, setStatus] = useState<string>("Loading...");
  const [error, setError] = useState<string>("");
  const [statePayloadText, setStatePayloadText] = useState<string>('{"on":true,"bri":180}');
  const [configPatchText, setConfigPatchText] = useState<string>("{}");
  const [globalBrightness, setGlobalBrightness] = useState<number>(180);
  const [deviceBrightness, setDeviceBrightness] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<boolean>(false);

  const devices = useMemo(() => snapshot?.devices ?? [], [snapshot]);

  const pullSnapshot = useCallback(async () => {
    const next = (await GreetService.GetControllerSnapshot()) as ControllerSnapshot;
    setSnapshot(next);
    setSettings(next.settings);
    setStatePayloadText(prettyJSON(next.settings.provisioning.defaultStatePayload ?? {}));
    setConfigPatchText(prettyJSON(next.settings.provisioning.defaultConfigPatch ?? {}));
    setStatus(`Snapshot updated at ${new Date(next.updatedAt).toLocaleTimeString()}`);
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

  const onSetGlobalState = useCallback((state: JSONMap, label: string) => {
    void withBusy(async () => {
      const result = await GreetService.SetGlobalState(state);
      setStatus(`${label}: ${Object.keys(result).length} device responses`);
      await pullSnapshot();
    });
  }, [pullSnapshot, withBusy]);

  const onRefreshDevice = useCallback((deviceID: string) => {
    void withBusy(async () => {
      const refreshed = (await GreetService.RefreshDevice(deviceID)) as ControllerSnapshot;
      setSnapshot(refreshed);
      setSettings(refreshed.settings);
      setStatus(`Device ${deviceID} refreshed`);
    });
  }, [withBusy]);

  const onProvisionDevice = useCallback((deviceID: string) => {
    void withBusy(async () => {
      const updated = (await GreetService.ProvisionDevice(deviceID)) as ControllerSnapshot;
      setSnapshot(updated);
      setSettings(updated.settings);
      setStatus(`Device ${deviceID} provisioned`);
    });
  }, [withBusy]);

  const onRemoveDevice = useCallback((deviceID: string) => {
    void withBusy(async () => {
      const updated = (await GreetService.RemoveDevice(deviceID)) as ControllerSnapshot;
      setSnapshot(updated);
      setSettings(updated.settings);
      setStatus(`Device ${deviceID} removed`);
    });
  }, [withBusy]);

  const onSetDeviceState = useCallback((deviceID: string, state: JSONMap) => {
    void withBusy(async () => {
      const updated = (await GreetService.SetDeviceState(deviceID, state)) as ControllerSnapshot;
      setSnapshot(updated);
      setSettings(updated.settings);
      setStatus(`Device ${deviceID} updated`);
    });
  }, [withBusy]);

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <div className="mx-auto max-w-7xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">WLED Central Controller</h1>
            <p className="text-sm opacity-70">
              Network/AP manager, discovery, persistence and WLED provisioning/control backend.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={onDiscoverNow} disabled={busy}>Discover now</button>
            <button className="btn" onClick={() => void pullSnapshot()} disabled={busy}>Refresh snapshot</button>
          </div>
        </div>

        <div className="alert alert-info text-sm py-2">{status}</div>
        {error && <div className="alert alert-error text-sm py-2">{error}</div>}

        {settings && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="card bg-base-200 shadow-sm">
              <div className="card-body space-y-3">
                <h2 className="card-title text-lg">Access Point / Upstream Settings</h2>

                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={settings.accessPoint.enabled}
                    onChange={(e) => setSettings({ ...settings, accessPoint: { ...settings.accessPoint, enabled: e.target.checked } })}
                  />
                  <span className="label-text">Enable local AP</span>
                </label>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <input className="input input-bordered" placeholder="AP connection name" value={settings.accessPoint.connection} onChange={(e) => setSettings({ ...settings, accessPoint: { ...settings.accessPoint, connection: e.target.value } })} />
                  <input className="input input-bordered" placeholder="AP interface (wlan0)" value={settings.accessPoint.interfaceName} onChange={(e) => setSettings({ ...settings, accessPoint: { ...settings.accessPoint, interfaceName: e.target.value } })} />
                  <input className="input input-bordered" placeholder="AP SSID" value={settings.accessPoint.ssid} onChange={(e) => setSettings({ ...settings, accessPoint: { ...settings.accessPoint, ssid: e.target.value } })} />
                  <input className="input input-bordered" placeholder="AP password" value={settings.accessPoint.password} onChange={(e) => setSettings({ ...settings, accessPoint: { ...settings.accessPoint, password: e.target.value } })} />
                  <input className="input input-bordered" type="number" min={1} max={13} placeholder="Channel" value={settings.accessPoint.channel} onChange={(e) => setSettings({ ...settings, accessPoint: { ...settings.accessPoint, channel: readNumber(e.target.value, 6) } })} />
                </div>

                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="checkbox"
                    className="toggle toggle-secondary"
                    checked={settings.upstream.autoConnect}
                    onChange={(e) => setSettings({ ...settings, upstream: { ...settings.upstream, autoConnect: e.target.checked } })}
                  />
                  <span className="label-text">Auto-connect upstream Wi-Fi</span>
                </label>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <input className="input input-bordered" placeholder="Upstream interface (wlan1)" value={settings.upstream.interfaceName} onChange={(e) => setSettings({ ...settings, upstream: { ...settings.upstream, interfaceName: e.target.value } })} />
                  <input className="input input-bordered" placeholder="Upstream SSID" value={settings.upstream.ssid} onChange={(e) => setSettings({ ...settings, upstream: { ...settings.upstream, ssid: e.target.value } })} />
                  <input className="input input-bordered" placeholder="Upstream password" value={settings.upstream.password} onChange={(e) => setSettings({ ...settings, upstream: { ...settings.upstream, password: e.target.value } })} />
                </div>

                <div className="divider my-1">Bridge/NAT</div>
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
                  <input className="input input-bordered" placeholder="Bridge AP interface" value={settings.bridge.apInterface} onChange={(e) => setSettings({ ...settings, bridge: { ...settings.bridge, apInterface: e.target.value } })} />
                  <input className="input input-bordered" placeholder="Bridge upstream interface" value={settings.bridge.upstreamInterface} onChange={(e) => setSettings({ ...settings, bridge: { ...settings.bridge, upstreamInterface: e.target.value } })} />
                </div>
              </div>
            </div>

            <div className="card bg-base-200 shadow-sm">
              <div className="card-body space-y-3">
                <h2 className="card-title text-lg">Discovery / Provisioning</h2>
                <label className="label cursor-pointer justify-start gap-3">
                  <input type="checkbox" className="toggle" checked={settings.discovery.enabled} onChange={(e) => setSettings({ ...settings, discovery: { ...settings.discovery, enabled: e.target.checked } })} />
                  <span className="label-text">Enable mDNS discovery loop</span>
                </label>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <input className="input input-bordered" type="number" min={2} value={settings.discovery.intervalSeconds} onChange={(e) => setSettings({ ...settings, discovery: { ...settings.discovery, intervalSeconds: readNumber(e.target.value, 15) } })} placeholder="Discovery interval seconds" />
                  <input className="input input-bordered" type="number" min={500} value={settings.discovery.queryTimeoutMs} onChange={(e) => setSettings({ ...settings, discovery: { ...settings.discovery, queryTimeoutMs: readNumber(e.target.value, 2000) } })} placeholder="mDNS query timeout ms" />
                </div>

                <input
                  className="input input-bordered"
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
                  <input type="checkbox" className="toggle toggle-primary" checked={settings.provisioning.autoProvision} onChange={(e) => setSettings({ ...settings, provisioning: { ...settings.provisioning, autoProvision: e.target.checked } })} />
                  <span className="label-text">Auto-provision newly discovered devices</span>
                </label>

                <div>
                  <label className="label"><span className="label-text">Default /json/state payload</span></label>
                  <textarea className="textarea textarea-bordered w-full h-24 font-mono text-xs" value={statePayloadText} onChange={(e) => setStatePayloadText(e.target.value)} />
                </div>

                <div>
                  <label className="label"><span className="label-text">Default /json/cfg patch</span></label>
                  <textarea className="textarea textarea-bordered w-full h-24 font-mono text-xs" value={configPatchText} onChange={(e) => setConfigPatchText(e.target.value)} />
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button className="btn btn-primary" onClick={onSaveSettings} disabled={busy}>Save settings</button>
                  <button className="btn" onClick={onScanNetworks} disabled={busy}>Scan upstream Wi-Fi</button>
                  <button className="btn btn-secondary" onClick={onApplyNetwork} disabled={busy}>Apply network config</button>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="card bg-base-200 shadow-sm">
          <div className="card-body gap-3">
            <h2 className="card-title text-lg">Global WLED Controls</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-success" onClick={() => onSetGlobalState({ on: true }, "Global ON")} disabled={busy}>On</button>
              <button className="btn btn-warning" onClick={() => onSetGlobalState({ on: false }, "Global OFF")} disabled={busy}>Off</button>
              <button className="btn btn-accent" onClick={() => onSetGlobalState({ on: "t" }, "Global toggle")} disabled={busy}>Toggle</button>
            </div>
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={255} value={globalBrightness} className="range range-primary" onChange={(e) => setGlobalBrightness(readNumber(e.target.value, 180))} />
              <span className="badge badge-neutral min-w-12 justify-center">{globalBrightness}</span>
              <button className="btn btn-primary" onClick={() => onSetGlobalState({ bri: globalBrightness }, "Global brightness")} disabled={busy}>Apply brightness</button>
            </div>
          </div>
        </section>

        <section className="card bg-base-200 shadow-sm">
          <div className="card-body gap-3">
            <h2 className="card-title text-lg">Known WLED Devices ({devices.length})</h2>
            {devices.length === 0 && <p className="text-sm opacity-70">No devices discovered yet.</p>}
            <div className="space-y-3">
              {devices.map((device) => {
                const localBri = deviceBrightness[device.id] ?? readDeviceBri(device);
                return (
                  <div key={device.id} className="rounded-lg border border-base-300 p-3 bg-base-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{device.name}</h3>
                        <p className="text-xs opacity-70">{device.address}:{device.port} • {device.id}</p>
                        <p className="text-xs opacity-70">
                          {device.online ? "Online" : "Offline"} • Provisioned: {String(device.provisioned)} • Last seen: {new Date(device.lastSeen).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button className="btn btn-sm" onClick={() => onRefreshDevice(device.id)} disabled={busy}>Refresh</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => onProvisionDevice(device.id)} disabled={busy}>Provision</button>
                        <button className="btn btn-sm btn-error" onClick={() => onRemoveDevice(device.id)} disabled={busy}>Forget</button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button className="btn btn-sm btn-success" onClick={() => onSetDeviceState(device.id, { on: true })} disabled={busy}>On</button>
                      <button className="btn btn-sm btn-warning" onClick={() => onSetDeviceState(device.id, { on: false })} disabled={busy}>Off</button>
                      <button className="btn btn-sm btn-accent" onClick={() => onSetDeviceState(device.id, { on: "t" })} disabled={busy}>Toggle</button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={255}
                        value={localBri}
                        className="range range-secondary"
                        onChange={(e) =>
                          setDeviceBrightness((prev) => ({
                            ...prev,
                            [device.id]: readNumber(e.target.value, readDeviceBri(device)),
                          }))
                        }
                      />
                      <span className="badge badge-outline min-w-12 justify-center">{localBri}</span>
                      <button className="btn btn-sm btn-primary" onClick={() => onSetDeviceState(device.id, { bri: localBri, on: readBool(device.info?.on) || localBri > 0 })} disabled={busy}>
                        Apply
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-lg">Network apply result</h2>
              {!applyResult && <p className="text-sm opacity-70">No apply action executed yet.</p>}
              {applyResult && (
                <div className="space-y-2">
                  <p className="text-sm">{applyResult.dryRun ? "Dry-run mode (nmcli unavailable)" : "Applied on host"}</p>
                  {(applyResult.warnings ?? []).map((warning) => (
                    <div key={warning} className="alert alert-warning py-1 text-xs">{warning}</div>
                  ))}
                  <div className="max-h-56 overflow-auto rounded border border-base-300 p-2 bg-base-100">
                    <pre className="text-xs whitespace-pre-wrap">{prettyJSON(applyResult.steps)}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card bg-base-200 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-lg">Scanned upstream Wi-Fi</h2>
              {networks.length === 0 && <p className="text-sm opacity-70">Run “Scan upstream Wi-Fi”.</p>}
              <ul className="menu bg-base-100 rounded-box border border-base-300 max-h-56 overflow-auto">
                {networks.map((network) => (
                  <li key={`${network.ssid}-${network.signal}`}>
                    <span className="flex justify-between">
                      <span>{network.ssid}</span>
                      <span className="text-xs opacity-70">{network.signal}% • {network.security}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {snapshot && (
          <p className="text-xs opacity-60">
            Persistence file: <code>{snapshot.persistencePath}</code> • nmcli available: {String(snapshot.capabilities.nmcliAvailable)}
          </p>
        )}
      </div>
    </div>
  );
}

export default App;