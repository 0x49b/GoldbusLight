import type {ReactNode} from "react";
import {DMXFixtureEditorView} from "./components/dmx/DMXFixtureEditorView";
import {DeviceDetailView} from "./components/device/DeviceDetailView";
import {AppShell} from "./components/layout/AppShell";
import {GeneralPanel} from "./components/presets/GeneralPanel";
import {ControllerSettingsView} from "./components/settings/ControllerSettingsView";
import {useControllerApp} from "./hooks/useControllerApp";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Spinner} from "@/components/ui/spinner";

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
                onApplyNetwork={app.onApplyNetwork}
                onUnignoreDevice={app.onUnignoreDevice}
                currentVersion={app.currentVersion}
                dmxState={app.dmxState}
                usbSerialDevices={app.usbSerialDevices}
                onRefreshUSBSerialDevices={app.refreshUSBSerialDevices}
                onSelectUSBSerialDevice={app.onSelectUSBSerialDevice}
            />
        );
    } else if (app.route.kind === "dmxAddFixture" || app.route.kind === "dmxFixture") {
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
            />
        );
    } else {
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
                dmxFixtures={app.dmxState.fixtures}
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
