import {useState} from "react";
import {useTranslation} from "react-i18next";
import {PiDownloadSimple, PiUploadSimple} from "react-icons/pi";
import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";

type BackupCardProps = {
    busy?: boolean;
    onExportConfigurationBackup: () => Promise<string>;
    onImportConfigurationBackup: () => Promise<string>;
    onError: (message: string) => void;
};

export function BackupCard({
    busy = false,
    onExportConfigurationBackup,
    onImportConfigurationBackup,
    onError,
}: BackupCardProps) {
    const {t} = useTranslation("settings");
    const [backupBusy, setBackupBusy] = useState(false);
    const [backupMessage, setBackupMessage] = useState<string | null>(null);

    const runBackupAction = (action: () => Promise<string>) => {
        setBackupMessage(null);
        setBackupBusy(true);
        void action()
            .then((msg) => setBackupMessage(msg))
            .catch((err: unknown) => onError(String(err)))
            .finally(() => setBackupBusy(false));
    };

    return (
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
                        onClick={() => runBackupAction(onExportConfigurationBackup)}
                    >
                        <PiDownloadSimple/>
                        {t("backup.export")}
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || backupBusy}
                        onClick={() => runBackupAction(onImportConfigurationBackup)}
                    >
                        <PiUploadSimple/>
                        {t("backup.import")}
                    </Button>
                </div>
                {backupMessage ? (
                    <p className="text-xs text-muted-foreground">{backupMessage}</p>
                ) : null}
            </CardContent>
        </Card>
    );
}
