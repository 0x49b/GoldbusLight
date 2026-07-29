import {useTranslation} from "react-i18next";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Switch} from "@/components/ui/switch.tsx";
import type {ControllerSettings} from "@/types/controller.ts";
import type {SettingsUpdater} from "../../settingsTypes.ts";

type WledDebugCardProps = {
    settings: ControllerSettings;
    updateSettings: SettingsUpdater;
    busy: boolean;
};

export function WledDebugCard({settings, updateSettings, busy}: WledDebugCardProps) {
    const {t} = useTranslation("settings");
    const wledControlsDisabled = busy || !settings.wled.enabled;

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle className="text-sm font-semibold">{t("wledTab.debugInformationTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <label className="flex items-center gap-3">
                    <Switch
                        checked={settings.wled.debug?.showInfo ?? false}
                        onCheckedChange={(checked) =>
                            updateSettings(
                                {
                                    ...settings,
                                    wled: {
                                        ...settings.wled,
                                        debug: {
                                            showInfo: checked,
                                        },
                                    },
                                },
                                "immediate",
                            )
                        }
                        disabled={wledControlsDisabled}
                    />
                    <span>{t("wledTab.showDebugInformation")}</span>
                </label>
            </CardContent>
        </Card>
    );
}
