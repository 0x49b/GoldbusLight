import {Alert, AlertDescription} from "@/components/ui/alert.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {useState} from "react";
import {PiDownloadSimple, PiUploadSimple} from "react-icons/pi";
import {useTranslation} from "react-i18next";
import {prettyJSON} from "../../../lib/json.ts";
import type {NetworkApplyResult} from "@/types/controller.ts";
import {AppearanceCard} from "../components/AppearanceCard.tsx";
import {ApplicationVersionCard} from "../components/ApplicationVersionCard.tsx";
import {LanguageCard} from "../components/LanguageCard.tsx";
import {WindowDisplayCard} from "../components/WindowDisplayCard.tsx";

export type GeneralSettingsTabProps = {
    applyResult: NetworkApplyResult | null;
    busy: boolean;
    currentVersion: string;
    updatesSupported: boolean;
    onExportConfigurationBackup: () => Promise<string>;
    onImportConfigurationBackup: () => Promise<string>;
    onCheckForUpdates: () => Promise<void>;
    setError: (message: string) => void;
};

export function GeneralSettingsTab({
    applyResult,
    busy,
    currentVersion,
    updatesSupported,
    onExportConfigurationBackup,
    onImportConfigurationBackup,
    onCheckForUpdates,
    setError,
}: GeneralSettingsTabProps) {
    const {t} = useTranslation("settings");
    const [backupBusy, setBackupBusy] = useState(false);
    const [backupMessage, setBackupMessage] = useState<string | null>(null);
    const [updateCheckBusy, setUpdateCheckBusy] = useState(false);

    return (
        <div className="space-y-5">
            <ApplicationVersionCard
                currentVersion={currentVersion}
                updatesSupported={updatesSupported}
                busy={busy}
                updateCheckBusy={updateCheckBusy}
                onCheckForUpdates={onCheckForUpdates}
                onUpdateCheckError={setError}
                onUpdateCheckStart={() => setUpdateCheckBusy(true)}
                onUpdateCheckEnd={() => setUpdateCheckBusy(false)}
            />

            <WindowDisplayCard disabled={busy}/>

            <AppearanceCard/>

            <LanguageCard/>

            <Card className="w-full max-w-none">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold">{t("backup.title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm opacity-70">{t("backup.description")}</p>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || backupBusy}
                            onClick={() => {
                                setBackupMessage(null);
                                setBackupBusy(true);
                                void onExportConfigurationBackup()
                                    .then((msg) => setBackupMessage(msg))
                                    .catch((err: unknown) => setError(String(err)))
                                    .finally(() => setBackupBusy(false));
                            }}
                        >
                            <PiDownloadSimple/>
                            {t("backup.export")}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || backupBusy}
                            onClick={() => {
                                setBackupMessage(null);
                                setBackupBusy(true);
                                void onImportConfigurationBackup()
                                    .then((msg) => setBackupMessage(msg))
                                    .catch((err: unknown) => setError(String(err)))
                                    .finally(() => setBackupBusy(false));
                            }}
                        >
                            <PiUploadSimple/>
                            {t("backup.import")}
                        </Button>
                    </div>
                    {backupMessage && (
                        <p className="text-xs text-muted-foreground">{backupMessage}</p>
                    )}
                </CardContent>
            </Card>

            <Card className="w-full max-w-none">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold">{t("networkApply.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                    {!applyResult && <p className="text-sm opacity-70">{t("networkApply.noAction")}</p>}
                    {applyResult && (
                        <div className="space-y-2">
                            <p className="text-sm">
                                {applyResult.dryRun ? t("networkApply.dryRun") : t("networkApply.applied")}
                            </p>
                            {(applyResult.warnings ?? []).map((warning) => (
                                <Alert key={warning} className="py-1 text-xs">
                                    <AlertDescription>{warning}</AlertDescription>
                                </Alert>
                            ))}
                            <div className="max-h-48 overflow-auto rounded border p-2 bg-card">
                                <pre
                                    className="text-xs whitespace-pre-wrap">{prettyJSON(applyResult.steps)}</pre>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
