import {useCallback, useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Switch} from "@/components/ui/switch.tsx";
import type {CompanionSettings, CompanionStatus, ControllerSettings} from "@/types/controller.ts";
import type {SettingsUpdater} from "../settingsTypes";

type CompanionSettingsCardProps = {
    settings: ControllerSettings;
    updateSettings: SettingsUpdater;
    busy: boolean;
};

const DEFAULT_PORT = 8765;

function companionFromSettings(settings: ControllerSettings): CompanionSettings {
    return {
        enabled: !!settings.companion?.enabled,
        port: settings.companion?.port > 0 ? settings.companion.port : DEFAULT_PORT,
    };
}

export function CompanionSettingsCard({settings, updateSettings, busy}: CompanionSettingsCardProps) {
    const {t} = useTranslation("settings");
    const companion = companionFromSettings(settings);
    const [status, setStatus] = useState<CompanionStatus | null>(null);

    const refreshStatus = useCallback(async () => {
        if (!companion.enabled) {
            setStatus(null);
            return;
        }
        const port = companion.port || DEFAULT_PORT;
        try {
            const res = await fetch(`http://127.0.0.1:${port}/api/info`, {cache: "no-store"});
            if (!res.ok) {
                setStatus({
                    enabled: true,
                    listening: false,
                    port,
                    urls: [],
                });
                return;
            }
            const body = (await res.json()) as CompanionStatus;
            setStatus(body);
        } catch {
            setStatus({
                enabled: true,
                listening: false,
                port,
                urls: [],
            });
        }
    }, [companion.enabled, companion.port]);

    useEffect(() => {
        void refreshStatus();
        if (!companion.enabled) {
            return;
        }
        const id = window.setInterval(() => {
            void refreshStatus();
        }, 2000);
        return () => window.clearInterval(id);
    }, [companion.enabled, refreshStatus]);

    const updateCompanion = (patch: Partial<CompanionSettings>, immediate = false) => {
        updateSettings((prev) => {
            if (!prev) {
                return prev;
            }
            const current = companionFromSettings(prev);
            return {
                ...prev,
                companion: {
                    ...current,
                    ...patch,
                },
            };
        }, immediate ? "immediate" : "debounced");
    };

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle className="text-sm font-semibold">{t("companion.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm opacity-70">{t("companion.description")}</p>

                <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="companion-enabled">{t("companion.enable")}</Label>
                    <Switch
                        id="companion-enabled"
                        checked={companion.enabled}
                        disabled={busy}
                        onCheckedChange={(checked) => updateCompanion({enabled: checked}, true)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="companion-port">{t("companion.port")}</Label>
                    <Input
                        id="companion-port"
                        type="number"
                        min={1}
                        max={65535}
                        value={companion.port}
                        disabled={busy || !companion.enabled}
                        onChange={(e) => {
                            const port = Number(e.target.value);
                            updateCompanion({
                                port: Number.isFinite(port) ? Math.round(port) : DEFAULT_PORT,
                            });
                        }}
                    />
                </div>

                {companion.enabled ? (
                    <div className="space-y-3 rounded-md border p-3">
                        <p className="text-sm">
                            {status?.listening
                                ? t("companion.listening")
                                : t("companion.starting")}
                        </p>
                        {(status?.urls ?? []).length > 0 ? (
                            <ul className="space-y-1">
                                {status!.urls.map((url) => (
                                    <li key={url} className="break-all font-mono text-xs">
                                        {url}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                {t("companion.urlHint", {port: companion.port || DEFAULT_PORT})}
                            </p>
                        )}
                        {status?.qrDataUrl ? (
                            <div className="flex flex-col items-start gap-2">
                                <img
                                    src={status.qrDataUrl}
                                    alt={t("companion.qrAlt")}
                                    className="h-40 w-40 rounded border bg-white p-2"
                                />
                                <p className="text-xs text-muted-foreground">{t("companion.qrHint")}</p>
                            </div>
                        ) : null}
                        <p className="text-xs text-muted-foreground">{t("companion.security")}</p>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}
