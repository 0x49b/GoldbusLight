import {useTranslation} from "react-i18next";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Switch} from "@/components/ui/switch.tsx";
import type {ControllerSettings} from "@/types/controller.ts";
import type {SettingsUpdater} from "../../settingsTypes.ts";

type DmxComponentCardProps = {
    settings: ControllerSettings;
    updateSettings: SettingsUpdater;
    busy: boolean;
};

export function DmxComponentCard({settings, updateSettings, busy}: DmxComponentCardProps) {
    const {t} = useTranslation("settings");
    const dmxControlsDisabled = busy || !settings.dmx.enabled;

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle>{t("dmxTab.componentTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <label className="flex items-center gap-3">
                    <Switch
                        checked={settings.dmx.enabled}
                        onCheckedChange={(checked) =>
                            updateSettings(
                                {
                                    ...settings,
                                    dmx: {...settings.dmx, enabled: checked},
                                },
                                "immediate",
                            )
                        }
                        disabled={busy}
                    />
                    <span>{t("dmxTab.enableComponent")}</span>
                </label>

                <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                        {t("dmxTab.simulatorInterfaces")}
                    </p>
                    <label className="flex items-center gap-3">
                        <Switch
                            checked={settings.dmx.testing.simulateUsbDmx}
                            onCheckedChange={(checked) =>
                                updateSettings(
                                    {
                                        ...settings,
                                        dmx: {
                                            ...settings.dmx,
                                            testing: {...settings.dmx.testing, simulateUsbDmx: checked},
                                        },
                                    },
                                    "immediate",
                                )
                            }
                            disabled={dmxControlsDisabled}
                        />
                        <span>{t("dmxTab.simulateUsb")}</span>
                    </label>
                    <label className="flex items-center gap-3">
                        <Switch
                            checked={settings.dmx.testing.simulateArtNet}
                            onCheckedChange={(checked) =>
                                updateSettings(
                                    {
                                        ...settings,
                                        dmx: {
                                            ...settings.dmx,
                                            testing: {...settings.dmx.testing, simulateArtNet: checked},
                                        },
                                    },
                                    "immediate",
                                )
                            }
                            disabled={dmxControlsDisabled}
                        />
                        <span>{t("dmxTab.simulateArtNet")}</span>
                    </label>
                </div>
            </CardContent>
        </Card>
    );
}
