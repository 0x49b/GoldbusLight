import type { Dispatch, SetStateAction } from "react";
import { prettyJSON, readNumber } from "../../lib/json";
import { PiWifiHigh, PiTarget, PiFloppyDisk } from "react-icons/pi";
import type {
  ControllerSettings,
  ControllerSnapshot,
  NetworkApplyResult,
  WLEDDevice,
  WiFiNetwork,
} from "../../types/controller";

export type ControllerSettingsViewProps = {
  settings: ControllerSettings | null;
  setSettings: Dispatch<SetStateAction<ControllerSettings | null>>;
  snapshot: ControllerSnapshot | null;
  networks: WiFiNetwork[];
  applyResult: NetworkApplyResult | null;
  statePayloadText: string;
  setStatePayloadText: Dispatch<SetStateAction<string>>;
  configPatchText: string;
  setConfigPatchText: Dispatch<SetStateAction<string>>;
  ignoredDevices: WLEDDevice[];
  busy: boolean;
  onSaveSettings: () => void;
  onScanNetworks: () => void;
  onApplyNetwork: () => void;
  onUnignoreDevice: (deviceId: string) => void;
};

export function ControllerSettingsView({
  settings,
  setSettings,
  snapshot,
  networks,
  applyResult,
  statePayloadText,
  setStatePayloadText,
  configPatchText,
  setConfigPatchText,
  ignoredDevices,
  busy,
  onSaveSettings,
  onScanNetworks,
  onApplyNetwork,
  onUnignoreDevice,
}: ControllerSettingsViewProps) {
  if (!settings) {
    return <p className="opacity-70">Loading settings…</p>;
  }

  return (
    <div className="space-y-5 w-full max-w-none pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Controller settings</h2>
        <div className="flex gap-2">

          <div className="tooltip tooltip-bottom" data-tip="Scan Wi-Fi">
          <button className="btn btn-sm" onClick={onScanNetworks} disabled={busy}>
            <PiTarget/>
          </button>
          </div>
          <div className="tooltip tooltip-bottom" data-tip="Apply Network">
          <button className="btn btn-sm btn-success" onClick={onApplyNetwork} disabled={busy}>
            <PiWifiHigh/>
          </button>
          </div>


        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card bg-base-100 card-bordered border-gray-500">
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
                className="toggle toggle-primary"
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
                className="toggle toggle-primary"
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

        <div className="card bg-base-100 card-bordered border-gray-500">
          <div className="card-body space-y-3">
            <h3 className="card-title text-base">Discovery / provisioning</h3>
            <label className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={settings.discovery.enabled}
                onChange={(e) =>
                  setSettings({ ...settings, discovery: { ...settings.discovery, enabled: e.target.checked } })
                }
              />
              <span className="label-text">Enable mDNS discovery loop</span>
            </label>

            <label className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="toggle toggle-error"
                checked={settings.testing.simulateWled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    testing: { ...settings.testing, simulateWled: e.target.checked },
                  })
                }
              />
              <span className="label-text">Simulate WLED device (testing)</span>
            </label>
            <p className="text-xs opacity-60">
              Adds an in-app fake device (<code className="font-mono text-[10px]">sim:wled</code>) with no network traffic.
              Enable this option, save settings, then pick the device from the list (Discover or wait for the next snapshot refresh).
            </p>

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
              <label className="label py-0">
                <span className="label-text text-xs">Default /json/state payload</span>
              </label>
              <textarea
                className="textarea textarea-bordered w-full h-24 font-mono text-xs"
                value={statePayloadText}
                onChange={(e) => setStatePayloadText(e.target.value)}
              />
            </div>

            <div>
              <label className="label py-0">
                <span className="label-text text-xs">Default /json/cfg patch</span>
              </label>
              <textarea
                className="textarea textarea-bordered w-full h-24 font-mono text-xs"
                value={configPatchText}
                onChange={(e) => setConfigPatchText(e.target.value)}
              />
            </div>

            <button className="btn btn-primary btn-sm" onClick={onSaveSettings} disabled={busy}>
              <PiFloppyDisk/>
            </button>
          </div>
        </div>
      </section>

      <section className="card bg-base-100 card-bordered border-gray-500 w-full max-w-none">
        <div className="card-body space-y-3">
          <h3 className="card-title text-base">Ignored devices</h3>
          <p className="text-sm opacity-70">
            Ignored devices stay out of the sidebar and presets but remain in <code className="text-xs">state.json</code>. Use this to hide
            unrelated mDNS hosts.
          </p>
          {ignoredDevices.length === 0 ? (
            <p className="text-sm opacity-60">No ignored devices.</p>
          ) : (
            <ul className="space-y-2">
              {ignoredDevices.map((dev) => (
                <li
                  key={dev.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-base-300 bg-base-100 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{dev.name}</div>
                    <div className="text-xs opacity-60 font-mono truncate">
                      {dev.address}:{dev.port} • {dev.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline btn-success shrink-0"
                    onClick={() => onUnignoreDevice(dev.id)}
                    disabled={busy}
                  >
                    Un-ignore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card bg-base-100 card-bordered border-gray-500">
          <div className="card-body">
            <h3 className="card-title text-base">Network apply result</h3>
            {!applyResult && <p className="text-sm opacity-70">No apply action yet.</p>}
            {applyResult && (
              <div className="space-y-2">
                <p className="text-sm">
                  {applyResult.dryRun ? "Dry-run (network CLI unavailable or unsupported)" : "Applied"}
                </p>
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

        <div className="card bg-base-100 card-bordered border-gray-500">
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
          Persistence: <code>{snapshot.persistencePath}</code> • backend: {snapshot.capabilities.networkBackendLabel} (
          {snapshot.capabilities.networkBackendId}) • host CLI:{" "}
          <code>{snapshot.capabilities.networkCliName || "—"}</code>
          {snapshot.capabilities.networkControlAvailable
            ? ""
            : snapshot.capabilities.networkCliUnavailableReason && (
                <>
                  {" "}
                  — <span className="opacity-90">{snapshot.capabilities.networkCliUnavailableReason}</span>
                </>
              )}
        </p>
      )}
    </div>
  );
}
