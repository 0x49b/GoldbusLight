import {Alert, AlertDescription} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {useState} from "react";
import {PiDownloadSimple, PiUploadSimple} from "react-icons/pi";
import {prettyJSON} from "../../lib/json";
import type {NetworkApplyResult} from "@/types/controller.ts";
import {ApplicationVersionCard} from "./ApplicationVersionCard";
import {WindowDisplayCard} from "./WindowDisplayCard";

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

            <Card className="w-full max-w-none">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold">Configuration backup</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm opacity-70">
                        Export or import all persisted data: controller settings, WLED devices,
                        DMX fixtures and party config, general tab state, and per-fixture live layouts.
                        Use this to copy a complete setup from one host to another.
                    </p>
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
                            Export backup
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
                            Import backup
                        </Button>
                    </div>
                    {backupMessage && (
                        <p className="text-xs text-muted-foreground">{backupMessage}</p>
                    )}
                </CardContent>
            </Card>

            <Card className="w-full max-w-none">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold">Network apply result</CardTitle>
                </CardHeader>
                <CardContent>
                    {!applyResult && <p className="text-sm opacity-70">No apply action yet.</p>}
                    {applyResult && (
                        <div className="space-y-2">
                            <p className="text-sm">
                                {applyResult.dryRun ? "Dry-run (network CLI unavailable or unsupported)" : "Applied"}
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
