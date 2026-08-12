import type {ControllerSettings, WLEDDevice} from "@/types/controller.ts";
import {WledAccessPointCard} from "../components/wled/WledAccessPointCard.tsx";
import {WledComponentCard} from "../components/wled/WledComponentCard.tsx";
import {WledDebugCard} from "../components/wled/WledDebugCard.tsx";
import {WledIgnoredDevicesCard} from "../components/wled/WledIgnoredDevicesCard.tsx";
import {WledProvisioningCard} from "../components/wled/WledProvisioningCard.tsx";
import type {SettingsUpdater} from "../settingsTypes.ts";

export type WledSettingsTabProps = {
    settings: ControllerSettings;
    updateSettings: SettingsUpdater;
    flushAutosaveNow: () => void;
    updateStatePayloadText: (text: string) => void;
    updateConfigPatchText: (text: string) => void;
    busy: boolean;
    onApplyNetworkNow: () => Promise<boolean>;
    onRefreshSnapshot: () => void;
    statePayloadText: string;
    configPatchText: string;
    ignoredDevices: WLEDDevice[];
    onUnignoreDevice: (deviceId: string) => void;
    listIPNeighborsSupported: boolean;
};

export function WledSettingsTab({
                                    settings,
                                    updateSettings,
                                    flushAutosaveNow,
                                    updateStatePayloadText,
                                    updateConfigPatchText,
                                    busy,
                                    onApplyNetworkNow,
                                    onRefreshSnapshot,
                                    statePayloadText,
                                    configPatchText,
                                    ignoredDevices,
                                    onUnignoreDevice,
                                    listIPNeighborsSupported,
                                }: Readonly<WledSettingsTabProps>) {
    return (
        <div className="space-y-5">
            <WledComponentCard
                settings={settings}
                updateSettings={updateSettings}
                busy={busy}
                onRefreshSnapshot={onRefreshSnapshot}
            />

            <div className="flex flex-row gap-3">
                <WledAccessPointCard
                    settings={settings}
                    updateSettings={updateSettings}
                    flushAutosaveNow={flushAutosaveNow}
                    busy={busy}
                    onApplyNetworkNow={onApplyNetworkNow}
                    listIPNeighborsSupported={listIPNeighborsSupported}
                />

                <WledProvisioningCard
                    settings={settings}
                    updateSettings={updateSettings}
                    flushAutosaveNow={flushAutosaveNow}
                    updateStatePayloadText={updateStatePayloadText}
                    updateConfigPatchText={updateConfigPatchText}
                    busy={busy}
                    statePayloadText={statePayloadText}
                    configPatchText={configPatchText}
                />
            </div>

            <WledIgnoredDevicesCard
                busy={busy}
                wledEnabled={settings.wled.enabled}
                ignoredDevices={ignoredDevices}
                onUnignoreDevice={onUnignoreDevice}
            />

            <WledDebugCard
                settings={settings}
                updateSettings={updateSettings}
                busy={busy}
            />
        </div>
    );
}
