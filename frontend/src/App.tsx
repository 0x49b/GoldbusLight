import type { ReactNode } from "react";
import { AppShell } from "./components/layout/AppShell";
import { DeviceDetailView } from "./components/device/DeviceDetailView";
import { GeneralPanel } from "./components/presets/GeneralPanel";
import { ControllerSettingsView } from "./components/settings/ControllerSettingsView";
import { useControllerApp } from "./hooks/useControllerApp";

function App() {
  const app = useControllerApp();

  let main: ReactNode = null;
  if (app.route.kind === "presets") {
    main = (
      <GeneralPanel
        devices={app.devices}
        busy={app.busy}
        presetBri={app.presetBri}
        setPresetBri={app.setPresetBri}
        presetRgb={app.presetRgb}
        setPresetRgb={app.setPresetRgb}
        onSetGlobalState={app.onSetGlobalState}
        onToggleOneDevice={app.onToggleOneDevice}
        applyWarmWhitePreset={app.applyWarmWhitePreset}
        applyColdWhitePreset={app.applyColdWhitePreset}
        applyNamedColorPreset={app.applyNamedColorPreset}
      />
    );
  } else if (app.route.kind === "settings") {
    main = (
      <ControllerSettingsView
        settings={app.settings}
        setSettings={app.setSettings}
        snapshot={app.snapshot}
        applyResult={app.applyResult}
        statePayloadText={app.statePayloadText}
        setStatePayloadText={app.setStatePayloadText}
        configPatchText={app.configPatchText}
        setConfigPatchText={app.setConfigPatchText}
        ignoredDevices={app.ignoredDevices}
        busy={app.busy}
        onSaveSettings={app.onSaveSettings}
        onApplyNetwork={app.onApplyNetwork}
        onUnignoreDevice={app.onUnignoreDevice}
        currentVersion={app.currentVersion}
        updateInfo={app.updateInfo}
        updateProgress={app.updateProgress}
        updateBusy={app.updateBusy}
        updateAction={app.updateAction}
        onCheckForUpdates={app.onCheckForUpdates}
        onDownloadAndInstallUpdate={app.onDownloadAndInstallUpdate}
      />
    );
  } else {
    main = (
      <DeviceDetailView
        device={app.selectedDevice}
        deviceDetail={app.deviceDetail}
        busy={app.busy}
        editingDeviceName={app.editingDeviceName}
        setEditingDeviceName={app.setEditingDeviceName}
        deviceNameDraft={app.deviceNameDraft}
        setDeviceNameDraft={app.setDeviceNameDraft}
        selectedSegIdx={app.selectedSegIdx}
        setSelectedSegIdx={app.setSelectedSegIdx}
        deviceFormFx={app.deviceFormFx}
        setDeviceFormFx={app.setDeviceFormFx}
        deviceFormPal={app.deviceFormPal}
        setDeviceFormPal={app.setDeviceFormPal}
        deviceFormSx={app.deviceFormSx}
        setDeviceFormSx={app.setDeviceFormSx}
        deviceFormIx={app.deviceFormIx}
        setDeviceFormIx={app.setDeviceFormIx}
        deviceFormRgb={app.deviceFormRgb}
        setDeviceFormRgb={app.setDeviceFormRgb}
        deviceFormBri={app.deviceFormBri}
        setDeviceFormBri={app.setDeviceFormBri}
        deviceFormTransition={app.deviceFormTransition}
        setDeviceFormTransition={app.setDeviceFormTransition}
        onRefreshDevice={app.onRefreshDevice}
        onProvisionDevice={app.onProvisionDevice}
        onIgnoreDevice={app.onIgnoreDevice}
        onRemoveDevice={app.onRemoveDevice}
        onSetDeviceState={app.onSetDeviceState}
        onRenameDevice={app.onRenameDevice}
      />
    );
  }

  return (
    <>
      <AppShell
        status={app.status}
        busy={app.busy}
        onDiscoverNow={app.onDiscoverNow}
        onRefreshSnapshot={app.pullSnapshot}
        route={app.route}
        setRoute={app.setRoute}
        devices={app.devices}
        error={app.error}
        onDismissError={app.onDismissError}
      >
        {main}
      </AppShell>
      {app.startupUpdateModalOpen && app.updateInfo?.updateAvailable && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Update available</h3>
            <p className="py-2">
              Version <code>{app.updateInfo.latestVersion}</code> is available. Install now or postpone?
            </p>
            {app.updateProgress !== null && (
              <div className="space-y-1 mb-3">
                <progress className="progress progress-primary w-full" value={Math.round(app.updateProgress)} max={100} />
                <p className="text-xs opacity-70">{Math.round(app.updateProgress)}% downloaded</p>
              </div>
            )}
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-outline"
                onClick={app.onPostponeUpdate}
                disabled={app.updateBusy}
              >
                Postpone
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={app.onDownloadAndInstallUpdate}
                disabled={app.updateBusy}
              >
                {app.updateBusy && <span className="loading loading-spinner loading-xs" aria-hidden />}
                Update now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
