import {useState} from "react";
import {useTranslation} from "react-i18next";
import {PiNetwork, PiWifiHigh} from "react-icons/pi";
import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Field, FieldLabel} from "@/components/ui/field.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Switch} from "@/components/ui/switch.tsx";
import {readNumber} from "@/lib/json.ts";
import type {ControllerSettings} from "@/types/controller.ts";
import type {SettingsUpdater} from "../../settingsTypes.ts";
import {IpNeighborsModal} from "./IpNeighborsModal.tsx";

type WledAccessPointCardProps = {
    settings: ControllerSettings;
    updateSettings: SettingsUpdater;
    flushAutosaveNow: () => void;
    disableAccessPointNow: () => Promise<void>;
    busy: boolean;
    onApplyNetwork: () => void;
    listIPNeighborsSupported: boolean;
};

export function WledAccessPointCard({
    settings,
    updateSettings,
    flushAutosaveNow,
    disableAccessPointNow,
    busy,
    onApplyNetwork,
    listIPNeighborsSupported,
}: WledAccessPointCardProps) {
    const {t} = useTranslation("settings");
    const [ipNeighborsOpen, setIpNeighborsOpen] = useState(false);
    const wledControlsDisabled = busy || !settings.wled.enabled;

    return (
        <Card className="w-full max-w-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
                <CardTitle>{t("wledTab.accessPointTitle")}</CardTitle>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={onApplyNetwork}
                    disabled={wledControlsDisabled}
                >
                    <PiWifiHigh/> {t("wledTab.applyNetworkSettings")}
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                <label className="flex items-center gap-3">
                    <Switch
                        id="enable-ap"
                        checked={settings.accessPoint.enabled}
                        onCheckedChange={(checked) =>
                            updateSettings(
                                {
                                    ...settings,
                                    accessPoint: {...settings.accessPoint, enabled: checked},
                                },
                                "immediate",
                            )
                        }
                        disabled={wledControlsDisabled}
                    />
                    <Label htmlFor="enable-ap">{t("wledTab.enableAccessPoint")}</Label>
                </label>
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void disableAccessPointNow()}
                        disabled={wledControlsDisabled || !settings.accessPoint.enabled}
                    >
                        {t("wledTab.disableApNow")}
                    </Button>
                    {listIPNeighborsSupported && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setIpNeighborsOpen(true)}
                            disabled={busy}
                        >
                            <PiNetwork/>
                            {t("wledTab.ipNeighborsOpen")}
                        </Button>
                    )}
                </div>
                {listIPNeighborsSupported && (
                    <IpNeighborsModal
                        open={ipNeighborsOpen}
                        onClose={() => setIpNeighborsOpen(false)}
                    />
                )}
                {!settings.wled.enabled && (
                    <p className="text-xs text-muted-foreground">{t("wledTab.apDisabledWhileOff")}</p>
                )}

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <Field>
                        <FieldLabel htmlFor="ap-connection-name">{t("wledTab.apConnectionName")}</FieldLabel>
                        <Input
                            id="ap-connection-name"
                            type="text"
                            value={settings.accessPoint.connection}
                            onChange={(e) =>
                                updateSettings({
                                    ...settings,
                                    accessPoint: {
                                        ...settings.accessPoint,
                                        connection: e.target.value,
                                    },
                                })
                            }
                            onBlur={flushAutosaveNow}
                            disabled={wledControlsDisabled}
                        />
                    </Field>

                    <Field>
                        <FieldLabel htmlFor="ap-interface">{t("wledTab.apInterface")}</FieldLabel>
                        <Input
                            id="ap-interface"
                            type="text"
                            value={settings.accessPoint.interfaceName}
                            onChange={(e) =>
                                updateSettings({
                                    ...settings,
                                    accessPoint: {
                                        ...settings.accessPoint,
                                        interfaceName: e.target.value,
                                    },
                                })
                            }
                            onBlur={flushAutosaveNow}
                            disabled={wledControlsDisabled}
                        />
                    </Field>

                    <Field>
                        <FieldLabel htmlFor="ap-ssid">{t("wledTab.apSsid")}</FieldLabel>
                        <Input
                            id="ap-ssid"
                            type="text"
                            value={settings.accessPoint.ssid}
                            onChange={(e) =>
                                updateSettings({
                                    ...settings,
                                    accessPoint: {...settings.accessPoint, ssid: e.target.value},
                                })
                            }
                            onBlur={flushAutosaveNow}
                            disabled={wledControlsDisabled}
                        />
                    </Field>

                    <Field>
                        <FieldLabel htmlFor="ap-password">{t("wledTab.apPassword")}</FieldLabel>
                        <Input
                            id="ap-password"
                            type="text"
                            value={settings.accessPoint.password}
                            onChange={(e) =>
                                updateSettings({
                                    ...settings,
                                    accessPoint: {...settings.accessPoint, password: e.target.value},
                                })
                            }
                            onBlur={flushAutosaveNow}
                            disabled={wledControlsDisabled}
                        />
                    </Field>

                    <Field>
                        <FieldLabel htmlFor="ap-channel">{t("wledTab.apChannel")}</FieldLabel>
                        <Input
                            id="ap-channel"
                            type="number"
                            value={settings.accessPoint.channel}
                            onChange={(e) =>
                                updateSettings({
                                    ...settings,
                                    accessPoint: {
                                        ...settings.accessPoint,
                                        channel: readNumber(e.target.value, 6),
                                    },
                                })
                            }
                            onBlur={flushAutosaveNow}
                            disabled={wledControlsDisabled}
                        />
                    </Field>
                </div>
            </CardContent>
        </Card>
    );
}
