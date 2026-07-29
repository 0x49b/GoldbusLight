import type {ControllerSettings, NetworkApplyResult} from "@/types/controller.ts";
import {AppearanceCard} from "../components/general/AppearanceCard.tsx";
import {BackupCard} from "../components/general/BackupCard.tsx";
import {CompanionSettingsCard} from "../components/general/CompanionSettingsCard.tsx";
import {NetworkApplyResultCard} from "../components/general/NetworkApplyResultCard.tsx";
import type {SettingsUpdater} from "../settingsTypes";

export type GeneralSettingsTabProps = {
    applyResult: NetworkApplyResult | null;
    busy: boolean;
    currentVersion: string;
    updatesSupported: boolean;
    settings: ControllerSettings;
    updateSettings: SettingsUpdater;
    onExportConfigurationBackup: () => Promise<string>;
    onImportConfigurationBackup: () => Promise<string>;
    onCheckForUpdates: () => Promise<void>;
    setError: (message: string) => void;
};

export function GeneralSettingsTab({
                                       applyResult,
                                       busy,
                                       settings,
                                       updateSettings,
                                       onExportConfigurationBackup,
                                       onImportConfigurationBackup,
                                       setError,
                                   }: Readonly<GeneralSettingsTabProps>) {
    return (
        <div className="space-y-5">
            <AppearanceCard disabled={busy}/>

            <div className="flex flex-row gap-3">
                <CompanionSettingsCard
                    settings={settings}
                    updateSettings={updateSettings}
                    busy={busy}
                />
                <div className="flex flex-col gap-3">
                    <NetworkApplyResultCard applyResult={applyResult}/>
                    <BackupCard
                        busy={busy}
                        onExportConfigurationBackup={onExportConfigurationBackup}
                        onImportConfigurationBackup={onImportConfigurationBackup}
                        onError={setError}
                    />
                </div>
            </div>


        </div>
    );
}
