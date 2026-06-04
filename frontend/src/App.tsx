import type {ReactNode} from "react";
import {DMXFixtureEditorView} from "./components/dmx/DMXFixtureEditorView";
import {DMXUniverseView} from "./components/dmx/DMXUniverseView";
import {DeviceDetailView} from "./components/device/DeviceDetailView";
import {AppShell} from "./components/layout/AppShell";
import {PartyModeView} from "./components/party/PartyModeView";
import {GeneralPanel} from "./components/wled/GeneralPanel.tsx";
import {ControllerSettingsView} from "./components/settings/ControllerSettingsView";
import {TransportConsolePanel} from "./components/settings/TransportConsolePanel";
import {useControllerApp} from "./hooks/useControllerApp";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Spinner} from "@/components/ui/spinner";

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
    if (app.route.kind === "party" && (app.wledEnabled || app.dmxEnabled)) {
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
                dmxState={app.dmxState}
                dmxEnabled={app.dmxEnabled}
                dmxPartyRunning={app.dmxPartyState?.status?.running === true}
                startDMXLiveOutput={app.startDMXLiveOutput}
                stopDMXLiveOutput={app.stopDMXLiveOutput}
                setError={app.setError}
                usbSerialDevices={app.usbSerialDevices}
                onRefreshUSBSerialDevices={app.refreshUSBSerialDevices}
                onSelectUSBSerialDevice={app.onSelectUSBSerialDevice}
                onDiscoverNow={app.onDiscoverNow}
                onRefreshSnapshot={app.pullSnapshot}
                consoleEntries={app.consoleEntries}
                onClearConsole={app.onClearConsole}
                consoleDetached={app.consoleDetached}
                onToggleConsoleDetach={app.openDetachedConsoleWindow}
                onExportConfigurationBackup={app.onExportConfigurationBackup}
                onImportConfigurationBackup={app.onImportConfigurationBackup}
            />
        );
    } else if (app.route.kind === "dmxUniverse" && app.dmxEnabled) {
        main = (
            <DMXUniverseView
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
                dmxState={app.dmxState}
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
                pullDMXState={app.pullDMXState}
                onEmergency={app.triggerDMXEmergency}
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
            >
                {main}
            </AppShell>


            {app.discovering && (
                <Dialog open>
                    <DialogContent showCloseButton={false} className="max-w-sm">
                        <DialogHeader>
                            <DialogTitle id="discovery-modal-title"
                                         className="flex items-center gap-3 text-sm font-medium">
                                <Spinner className="size-4 text-primary" aria-hidden/>
                                Discovery running ...
                            </DialogTitle>
                        </DialogHeader>
                    </DialogContent>
                </Dialog>
            )}


        </>
    );
}

export default App;
