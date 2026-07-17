import type {ReactNode} from "react";
import {DMXFixtureEditorView} from "./components/dmx/DMXFixtureEditorView";
import {DMXUniverseView} from "./components/dmx/DMXUniverseView";
import {DeviceDetailView} from "@/components/wled/device/DeviceDetailView";
import {WLEDAddDeviceView} from "./components/wled/WLEDAddDeviceView";
import {AppShell} from "./components/layout/AppShell";
import {PartyModeView} from "./components/party/PartyModeView";
import {ScenesView} from "./components/scenes/ScenesView";
import {GeneralPanel} from "./components/wled/GeneralPanel.tsx";
import {ControllerSettingsView} from "./components/settings/ControllerSettingsView";
import {TransportConsolePanel} from "./components/settings/TransportConsolePanel";
import {useControllerApp} from "./hooks/useControllerApp";
import {universeInterfaceSettings} from "./lib/dmxUniverses";
import type {ControllerSettings, DMXState} from "./types/controller";
import {DEFAULT_DMX_UNIVERSE_ID} from "./types/controller";

function isDmxInterfaceConfigured(settings: ControllerSettings | null, dmxState: DMXState): boolean {
    if (!settings?.dmx.enabled) {
        return false;
    }
    if (settings.dmx.testing.simulateUsbDmx || settings.dmx.testing.simulateArtNet) {
        return true;
    }
    const iface = universeInterfaceSettings(settings, DEFAULT_DMX_UNIVERSE_ID, dmxState);
    if (iface.selectedUSBDeviceId.trim()) {
        return true;
    }
    return iface.artNet.enabled;
}

function App() {
    const app = useControllerApp();
    const isDetachedConsoleWindow = new URLSearchParams(window.location.search).get("view") === "console-window";

    if (isDetachedConsoleWindow) {
        return (
            <main className="min-h-screen p-4 bg-background">
                <TransportConsolePanel
                    entries={app.consoleEntries}
                    onClear={app.onClearConsole}
                    onToggleDetach={app.closeDetachedConsoleWindow}
                    detached
                />
            </main>
        );
    }

    let main: ReactNode = null;
    if (app.route.kind === "scenes" && (app.wledEnabled || app.dmxEnabled)) {
        main = (
            <ScenesView
                scenes={app.scenes}
                activeSceneId={app.snapshot?.activeSceneId}
                defaultSceneId={app.snapshot?.defaultSceneId}
                partySceneId={app.snapshot?.partySceneId}
                partyRunning={app.dmxPartyState.status.running}
                devices={app.devices}
                fixtures={app.dmxState.fixtures}
                wledEnabled={app.wledEnabled}
                dmxEnabled={app.dmxEnabled}
                dmxInterfaceConfigured={isDmxInterfaceConfigured(app.settings, app.dmxState)}
                busy={app.busy}
                onApply={async (id) => {
                    await app.onApplyLightingScene(id);
                }}
                onStartParty={app.onStartLightingSceneParty}
                onCreate={app.onCreateLightingScene}
                onUpdate={app.onUpdateLightingScene}
                onDelete={app.onDeleteLightingScene}
                onExport={app.onExportLightingScene}
                onImport={app.onImportLightingScene}
                onSetDefault={async (id) => {
                    await app.onSetDefaultLightingScene(id);
                }}
                onSetPartyScene={async (id) => {
                    await app.onSetPartyLightingScene(id);
                }}
                onOpenSettings={() => {
                    app.setRoute({kind: "settings"});
                }}
            />
        );
    } else if (app.route.kind === "party" && (app.wledEnabled || app.dmxEnabled)) {
        main = (
            <PartyModeView
                fixtures={app.dmxState.fixtures}
                wledDevices={app.devices.filter((device) => device.online && !device.ignored)}
                party={app.dmxPartyState}
                busy={app.busy}
                audioInputDevices={app.partyAudioInputDevices}
                onRefreshAudioDevices={async () => {
                    await app.pullPartyAudioInputDevices();
                }}
                onUpdateConfig={app.setDMXPartyConfig}
                onStart={app.startDMXPartyMode}
                onStop={app.stopDMXPartyMode}
            />
        );
    } else if (app.route.kind === "presets" && app.wledEnabled) {
        main = (
            <GeneralPanel
                devices={app.devices}
                presetBri={app.presetBri}
                setPresetBri={app.setPresetBri}
                presetRgb={app.presetRgb}
                setPresetRgb={app.setPresetRgb}
                onSetGlobalState={app.onSetGlobalState}
                onToggleOneDevice={app.onToggleOneDevice}
                applyWarmWhitePreset={app.applyWarmWhitePreset}
                applyColdWhitePreset={app.applyColdWhitePreset}
                applyNamedColorPreset={app.applyNamedColorPreset}
                generalFx={app.generalFx}
                setGeneralFx={app.setGeneralFx}
                generalPal={app.generalPal}
                setGeneralPal={app.setGeneralPal}
                generalSx={app.generalSx}
                setGeneralSx={app.setGeneralSx}
                generalIx={app.generalIx}
                setGeneralIx={app.setGeneralIx}
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
                onSettingsInteraction={app.markSettingsInteraction}
                onApplyNetwork={app.onApplyNetwork}
                onUnignoreDevice={app.onUnignoreDevice}
                currentVersion={app.currentVersion}
                updatesSupported={app.updatesSupported}
                dmxState={app.dmxState}
                dmxEnabled={app.dmxEnabled}
                dmxPartyRunning={app.dmxPartyState?.status?.running === true}
                startDMXLiveOutput={app.startDMXLiveOutput}
                stopDMXLiveOutput={app.stopDMXLiveOutput}
                setError={app.setError}
                usbSerialDevices={app.usbSerialDevices}
                onRefreshUSBSerialDevices={app.refreshUSBSerialDevices}
                onSelectUSBSerialDevice={app.onSelectUSBSerialDevice}
                onRefreshSnapshot={app.pullSnapshot}
                consoleEntries={app.consoleEntries}
                onClearConsole={app.onClearConsole}
                consoleDetached={app.consoleDetached}
                onToggleConsoleDetach={app.openDetachedConsoleWindow}
                onExportConfigurationBackup={app.onExportConfigurationBackup}
                onImportConfigurationBackup={app.onImportConfigurationBackup}
                onCheckForUpdates={app.onCheckForUpdates}
            />
        );
    } else if (app.route.kind === "dmxUniverse" && app.dmxEnabled) {
        main = (
            <DMXUniverseView
                universes={app.dmxState.universes ?? []}
                selectedUniverseId={app.route.universeId ?? app.dmxState.universes?.[0]?.id}
                settings={app.settings}
                fixtures={app.dmxState.fixtures}
                busy={app.busy}
                selectedUSBDeviceId={app.dmxState.selectedUSBDeviceId}
                usbSerialDevices={app.usbSerialDevices}
                setRoute={app.setRoute}
                onReaddressFixtures={app.onReaddressDMXFixtures}
                dmxLiveStatus={app.dmxLiveStatus}
                pullDMXLiveStatus={app.pullDMXLiveStatus}
                startDMXLiveOutput={app.startDMXLiveOutput}
                stopDMXLiveOutput={app.stopDMXLiveOutput}
                queueDmxLivePatch={app.queueDmxLivePatch}
                onEmergency={app.triggerDMXEmergency}
            />
        );
    } else if ((app.route.kind === "dmxAddFixture" || app.route.kind === "dmxFixture") && app.dmxEnabled) {
        main = (
            <DMXFixtureEditorView
                fixture={app.selectedFixture}
                busy={app.busy}
                onCreate={app.onCreateDMXFixture}
                onUpdate={app.onUpdateDMXFixture}
                onDelete={app.onDeleteDMXFixture}
                onOpenFixture={(fixtureID) => app.setRoute({kind: "dmxFixture", id: fixtureID})}
                onExportFixtureConfig={app.onExportDMXFixtureConfig}
                dmxState={app.dmxState}
                defaultUniverseId={app.route.kind === "dmxAddFixture" ? app.route.universeId : undefined}
                usbSerialDevices={app.usbSerialDevices}
                dmxLiveStatus={app.dmxLiveStatus}
                setRoute={app.setRoute}
                pullDMXLiveStatus={app.pullDMXLiveStatus}
                queueDmxLivePatch={app.queueDmxLivePatch}
                startDMXLiveOutput={app.startDMXLiveOutput}
                stopDMXLiveOutput={app.stopDMXLiveOutput}
                onRefreshUSBSerialDevices={app.refreshUSBSerialDevices}
                onSelectUSBSerialDevice={app.onSelectUSBSerialDevice}
                partyRunning={app.dmxPartyState?.status?.running === true}
                onEmergency={app.triggerDMXEmergency}
            />
        );
    } else if (app.route.kind === "wledAddDevice" && app.wledEnabled) {
        main = (
            <WLEDAddDeviceView
                busy={app.busy}
                setRoute={app.setRoute}
                onAddDevice={app.onAddWLEDDevice}
            />
        );
    } else if (app.route.kind === "device" && app.wledEnabled) {
        main = (
            <DeviceDetailView
                device={app.selectedDevice}
                deviceDetail={app.deviceDetail}
                deviceDetailInitializing={app.deviceDetailInitializing}
                deviceDetailReloading={app.deviceDetailReloading}
                deviceDetailFetchAttempt={app.deviceDetailFetchAttempt}
                deviceDetailFetchMax={app.deviceDetailFetchMax}
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
                onCreatePreset={async (deviceId, name) => {
                    await app.onCreateWLEDDevicePreset(deviceId, name);
                }}
                onApplyPreset={async (deviceId, presetId) => {
                    await app.onApplyWLEDDevicePreset(deviceId, presetId);
                }}
                onDeletePreset={async (deviceId, presetId) => {
                    await app.onDeleteWLEDDevicePreset(deviceId, presetId);
                }}
            />
        );
    } else {
        main = (
            <div className="rounded border bg-card p-4 text-sm text-muted-foreground">
                This page is disabled by current component settings. Open Settings to enable it.
            </div>
        );
    }

    return (
        <>
            <AppShell
                status={app.status}
                route={app.route}
                setRoute={app.setRoute}
                devices={app.devices}
                dmxFixtures={app.dmxState.fixtures}
                wledEnabled={app.wledEnabled}
                dmxEnabled={app.dmxEnabled}
                dmxLiveStatus={app.dmxLiveStatus}
                dmxPartyState={app.dmxPartyState}
                error={app.error}
                onDismissError={app.onDismissError}
                onRefreshWLEDDevice={app.onRefreshDevice}
            >
                {main}
            </AppShell>
        </>
    );
}

export default App;
