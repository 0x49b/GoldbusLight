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
        networks={app.networks}
        applyResult={app.applyResult}
        statePayloadText={app.statePayloadText}
        setStatePayloadText={app.setStatePayloadText}
        configPatchText={app.configPatchText}
        setConfigPatchText={app.setConfigPatchText}
        ignoredDevices={app.ignoredDevices}
        busy={app.busy}
        onSaveSettings={app.onSaveSettings}
        onScanNetworks={app.onScanNetworks}
        onApplyNetwork={app.onApplyNetwork}
        onUnignoreDevice={app.onUnignoreDevice}
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
    <AppShell
      status={app.status}
      busy={app.busy}
      onDiscoverNow={app.onDiscoverNow}
      onRefreshSnapshot={app.pullSnapshot}
      route={app.route}
      setRoute={app.setRoute}
      devices={app.devices}
      error={app.error}
    >
      {main}
    </AppShell>
  );
}

export default App;
