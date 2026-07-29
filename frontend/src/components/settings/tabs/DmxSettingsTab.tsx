import type {
    ArtNetSettings,
    ControllerSettings,
    DMXState,
    USBSerialDevice,
} from "@/types/controller.ts";
import {universeInterfaceSettings} from "@/lib/dmxUniverses.ts";
import {DmxArtNetCard} from "../components/dmx/DmxArtNetCard.tsx";
import {DmxComponentCard} from "../components/dmx/DmxComponentCard.tsx";
import {DmxFixtureChannelSweepPanel} from "../components/dmx/DmxFixtureChannelSweepPanel.tsx";
import {DmxUsbInterfaceCard} from "../components/dmx/DmxUsbInterfaceCard.tsx";
import type {SettingsUpdater} from "../settingsTypes.ts";

export type DmxSettingsTabProps = {
    settings: ControllerSettings;
    updateSettings: SettingsUpdater;
    updateUniverseArtNet: (
        universeId: string,
        patch: Partial<ArtNetSettings>,
        mode?: "debounced" | "immediate",
    ) => void;
    flushAutosaveNow: () => void;
    busy: boolean;
    dmxState: DMXState;
    dmxEnabled: boolean;
    dmxPartyRunning: boolean;
    usbSerialDevices: USBSerialDevice[];
    onRefreshUSBSerialDevices: () => void;
    onSelectUSBSerialDevice: (deviceId: string, universeId?: string) => void;
    startDMXLiveOutput: (fixtureId: string) => Promise<boolean>;
    setError: (message: string) => void;
};

export function DmxSettingsTab({
    settings,
    updateSettings,
    updateUniverseArtNet,
    flushAutosaveNow,
    busy,
    dmxState,
    dmxEnabled,
    dmxPartyRunning,
    usbSerialDevices,
    onRefreshUSBSerialDevices,
    onSelectUSBSerialDevice,
    startDMXLiveOutput,
    setError,
}: Readonly<DmxSettingsTabProps>) {
    const dmxControlsDisabled = busy || !settings.dmx.enabled;
    const universeId = "universe-1";
    const iface = universeInterfaceSettings(settings, universeId, dmxState);

    return (
        <div className="space-y-5">
            <DmxComponentCard
                settings={settings}
                updateSettings={updateSettings}
                busy={busy}
            />

            <DmxUsbInterfaceCard
                settings={settings}
                updateSettings={updateSettings}
                busy={busy}
                universeId={universeId}
                selectedUSBDeviceId={iface.selectedUSBDeviceId}
                usbSerialDevices={usbSerialDevices}
                onRefreshUSBSerialDevices={onRefreshUSBSerialDevices}
                onSelectUSBSerialDevice={onSelectUSBSerialDevice}
            />

            <DmxArtNetCard
                artNet={iface.artNet}
                disabled={dmxControlsDisabled}
                fieldsDisabled={dmxControlsDisabled || !iface.artNet.enabled}
                updateArtNet={(patch, mode) => updateUniverseArtNet(universeId, patch, mode)}
                flushAutosaveNow={flushAutosaveNow}
            />

            <DmxFixtureChannelSweepPanel
                fixtures={dmxState.fixtures}
                dmxEnabled={dmxEnabled}
                settings={settings}
                selectedUSBDeviceId={dmxState.selectedUSBDeviceId ?? null}
                usbSerialDevices={usbSerialDevices}
                partyRunning={dmxPartyRunning}
                busy={busy}
                startDMXLiveOutput={startDMXLiveOutput}
                setError={setError}
            />
        </div>
    );
}
