import {useTranslation} from "react-i18next";
import {PiArrowsClockwise} from "react-icons/pi";
import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Switch} from "@/components/ui/switch.tsx";
import type {ControllerSettings} from "@/types/controller.ts";
import type {SettingsUpdater} from "../../settingsTypes.ts";

type WledComponentCardProps = {
    settings: ControllerSettings;
    updateSettings: SettingsUpdater;
    busy: boolean;
    onRefreshSnapshot: () => void;
};

export function WledComponentCard({
                                      settings,
                                      updateSettings,
                                      busy,
                                      onRefreshSnapshot,
                                  }: Readonly<WledComponentCardProps>) {
    const {t} = useTranslation("settings");

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle>{t("wledTab.componentTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <label className="flex items-center gap-3">
                    <Switch
                        checked={settings.wled.enabled}
                        onCheckedChange={(checked) =>
                            updateSettings(
                                {
                                    ...settings,
                                    wled: {...settings.wled, enabled: checked},
                                    accessPoint: {
                                        ...settings.accessPoint,
                                        enabled: checked ? settings.accessPoint.enabled : false,
                                    },
                                },
                                "immediate",
                            )
                        }
                        disabled={busy}
                    />
                    <span>{t("wledTab.enableComponent")}</span>
                </label>
                {!settings.wled.enabled && (
                    <p className="text-xs text-muted-foreground">{t("wledTab.disabledHint")}</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                        size="sm"
                        variant="outline"
                        className="basis-32"
                        onClick={() => void onRefreshSnapshot()}
                        disabled={busy}
                    >
                        <PiArrowsClockwise/>
                        {t("wledTab.refresh")}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
