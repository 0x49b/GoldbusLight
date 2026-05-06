import type { Dispatch, SetStateAction } from "react";
import { prettyJSON, readNumber } from "../../lib/json";
import { PiWifiHigh, PiFloppyDisk } from "react-icons/pi";
import type { UpdateInfo } from "../../../bindings/github.com/wailsapp/wails/v3/pkg/services/selfupdate/models";
import type {
  ControllerSettings,
  ControllerSnapshot,
  NetworkApplyResult,
  WLEDDevice,
} from "../../types/controller";

export type ControllerSettingsViewProps = {
  settings: ControllerSettings | null;
  setSettings: Dispatch<SetStateAction<ControllerSettings | null>>;
  snapshot: ControllerSnapshot | null;
  applyResult: NetworkApplyResult | null;
  statePayloadText: string;
  setStatePayloadText: Dispatch<SetStateAction<string>>;
  configPatchText: string;
  setConfigPatchText: Dispatch<SetStateAction<string>>;
  ignoredDevices: WLEDDevice[];
  busy: boolean;
  onSaveSettings: () => void;
  onApplyNetwork: () => void;
  onUnignoreDevice: (deviceId: string) => void;
  currentVersion: string;
  updateInfo: UpdateInfo | null;
  updateProgress: number | null;
  updateBusy: boolean;
  updateAction: "check" | "install" | null;
  onCheckForUpdates: () => void;
  onDownloadAndInstallUpdate: () => void;
};

export function ControllerSettingsView({
  settings,
  setSettings,
  snapshot,
  applyResult,
  statePayloadText,
  setStatePayloadText,
  configPatchText,
  setConfigPatchText,
  ignoredDevices,
  busy,
  onSaveSettings,
  onApplyNetwork,
  onUnignoreDevice,
  currentVersion,
  updateInfo,
  updateProgress,
  updateBusy,
  updateAction,
  onCheckForUpdates,
  onDownloadAndInstallUpdate,
}: ControllerSettingsViewProps) {
  if (!settings) {
    return <p className="opacity-70">Loading settings…</p>;
  }

  return (
    <div className="space-y-5 w-full max-w-none pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Controller settings</h2>
        <div className="flex gap-2">
          <div className="tooltip tooltip-bottom" data-tip="Apply network (access point)">
          <button className="btn btn-sm btn-success" onClick={onApplyNetwork} disabled={busy}>
            <PiWifiHigh/>
          </button>
          </div>


        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card bg-base-100 card-bordered border-gray-500">
          <div className="card-body space-y-3">
            <h3 className="card-title text-base">Access point</h3>

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
          <h3 className="card-title text-base">Application updates</h3>
          <p className="text-sm opacity-70">
            Current version: <code>{currentVersion}</code>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm btn-outline flex-1" onClick={onCheckForUpdates} disabled={updateBusy}>
              {updateBusy && updateAction === "check" && <span className="loading loading-spinner loading-xs" aria-hidden />}
              Check for updates
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary flex-1"
              onClick={onDownloadAndInstallUpdate}
              disabled={updateBusy || !updateInfo?.updateAvailable}
            >
              {updateBusy && updateAction === "install" && <span className="loading loading-spinner loading-xs" aria-hidden />}
              Download and restart
            </button>
          </div>
          {updateProgress !== null && (
            <div className="space-y-1">
              <progress className="progress progress-primary w-full" value={Math.round(updateProgress)} max={100} />
              <p className="text-xs opacity-70">{Math.round(updateProgress)}% downloaded</p>
            </div>
          )}
          {updateInfo && (
            <div className="rounded border border-base-300 p-3 text-sm space-y-1">
              <div>
                Latest: <code>{updateInfo.latestVersion || "unknown"}</code>
              </div>
              <div>Status: {updateInfo.updateAvailable ? "Update available" : "Up to date"}</div>
              {updateInfo.publishedAt && <div>Published: {new Date(updateInfo.publishedAt).toLocaleString()}</div>}
              {updateInfo.releaseUrl && (
                <a className="link link-primary text-xs" href={updateInfo.releaseUrl} target="_blank" rel="noreferrer">
                  Open release notes
                </a>
              )}
            </div>
          )}
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

      <section className="card bg-base-100 card-bordered border-gray-500 w-full max-w-none">
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
