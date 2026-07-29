import {Badge} from "@/components/ui/badge.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {PiArrowsClockwise} from "react-icons/pi";
import {Trans, useTranslation} from "react-i18next";

type ApplicationVersionCardProps = {
    currentVersion: string;
    updatesSupported: boolean;
    busy: boolean;
    updateCheckBusy: boolean;
    onCheckForUpdates: () => Promise<void>;
    onUpdateCheckError: (message: string) => void;
    onUpdateCheckStart: () => void;
    onUpdateCheckEnd: () => void;
};

export function ApplicationVersionCard({
    currentVersion,
    updatesSupported,
    busy,
    updateCheckBusy,
    onCheckForUpdates,
    onUpdateCheckError,
    onUpdateCheckStart,
    onUpdateCheckEnd,
}: ApplicationVersionCardProps) {
    const {t} = useTranslation("settings");
    const trimmed = currentVersion.trim();
    const versionKnown = trimmed !== "" && trimmed !== "unknown";
    const versionLabel = versionKnown ? trimmed : t("version.loading");

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle className="text-sm font-semibold">{t("version.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm opacity-70">{t("version.installedLabel")}</span>
                    <Badge variant={versionKnown ? "secondary" : "outline"}>
                        {versionLabel}
                    </Badge>
                </div>
                {updatesSupported ? (
                    <>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || updateCheckBusy}
                                onClick={() => {
                                    onUpdateCheckStart();
                                    void onCheckForUpdates()
                                        .catch((err: unknown) => onUpdateCheckError(String(err)))
                                        .finally(() => onUpdateCheckEnd());
                                }}
                            >
                                <PiArrowsClockwise/>
                                {t("version.checkForUpdates")}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t("version.checkHint")}
                        </p>
                    </>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        <Trans
                            i18nKey="version.raspberryPiHint"
                            t={t}
                            components={[
                                <code className="rounded bg-muted px-1 py-0.5" key="cmd"/>,
                                <code className="rounded bg-muted px-1 py-0.5" key="bak"/>,
                            ]}
                        />
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
