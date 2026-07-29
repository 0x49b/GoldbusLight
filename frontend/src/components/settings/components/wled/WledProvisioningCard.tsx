import {Trans, useTranslation} from "react-i18next";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Switch} from "@/components/ui/switch.tsx";
import {Textarea} from "@/components/ui/textarea.tsx";
import type {ControllerSettings} from "@/types/controller.ts";
import type {SettingsUpdater} from "../../settingsTypes.ts";

type WledProvisioningCardProps = {
    settings: ControllerSettings;
    updateSettings: SettingsUpdater;
    flushAutosaveNow: () => void;
    updateStatePayloadText: (text: string) => void;
    updateConfigPatchText: (text: string) => void;
    busy: boolean;
    statePayloadText: string;
    configPatchText: string;
};

export function WledProvisioningCard({
    settings,
    updateSettings,
    flushAutosaveNow,
    updateStatePayloadText,
    updateConfigPatchText,
    busy,
    statePayloadText,
    configPatchText,
}: WledProvisioningCardProps) {
    const {t} = useTranslation("settings");
    const wledControlsDisabled = busy || !settings.wled.enabled;

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle className="text-sm font-semibold">{t("wledTab.provisioningTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <label className="flex cursor-pointer justify-start gap-3 items-center">
                    <Switch
                        checked={settings.wled.testing.simulateWled}
                        onCheckedChange={(checked) =>
                            updateSettings(
                                {
                                    ...settings,
                                    wled: {
                                        ...settings.wled,
                                        testing: {...settings.wled.testing, simulateWled: checked},
                                    },
                                },
                                "immediate",
                            )
                        }
                        disabled={wledControlsDisabled}
                    />
                    <span>{t("wledTab.simulateWled")}</span>
                </label>
                <label className="flex cursor-pointer justify-start gap-3 items-center">
                    <Switch
                        checked={settings.wled.provisioning.autoProvision}
                        onCheckedChange={(checked) =>
                            updateSettings(
                                {
                                    ...settings,
                                    wled: {
                                        ...settings.wled,
                                        provisioning: {
                                            ...settings.wled.provisioning,
                                            autoProvision: checked,
                                        },
                                    },
                                },
                                "immediate",
                            )
                        }
                        disabled={wledControlsDisabled}
                    />
                    <span>{t("wledTab.autoProvision")}</span>
                </label>

                <div>
                    <Label className="py-0 text-xs">{t("wledTab.defaultStatePayload")}</Label>
                    <Textarea
                        className="h-24 w-full font-mono text-xs"
                        value={statePayloadText}
                        onChange={(e) => updateStatePayloadText(e.target.value)}
                        onBlur={flushAutosaveNow}
                        disabled={wledControlsDisabled}
                    />
                </div>

                <div>
                    <Label className="py-0 text-xs">{t("wledTab.defaultConfigPatch")}</Label>
                    <Textarea
                        className="h-24 w-full font-mono text-xs"
                        value={configPatchText}
                        onChange={(e) => updateConfigPatchText(e.target.value)}
                        onBlur={flushAutosaveNow}
                        disabled={wledControlsDisabled}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
