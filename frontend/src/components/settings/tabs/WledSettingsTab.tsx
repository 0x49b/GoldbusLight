import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Field, FieldLabel} from "@/components/ui/field.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Switch} from "@/components/ui/switch.tsx";
import {Textarea} from "@/components/ui/textarea.tsx";
import {PiArrowsClockwise, PiWifiHigh} from "react-icons/pi";
import {Trans, useTranslation} from "react-i18next";
import {readNumber} from "../../../lib/json.ts";
import type {ControllerSettings, WLEDDevice} from "@/types/controller.ts";
import type {SettingsUpdater} from "../settingsTypes.ts";

export type WledSettingsTabProps = {
    settings: ControllerSettings;
    updateSettings: SettingsUpdater;
    flushAutosaveNow: () => void;
    updateStatePayloadText: (text: string) => void;
    updateConfigPatchText: (text: string) => void;
    disableAccessPointNow: () => Promise<void>;
    busy: boolean;
    onApplyNetwork: () => void;
    onRefreshSnapshot: () => void;
    statePayloadText: string;
    configPatchText: string;
    ignoredDevices: WLEDDevice[];
    onUnignoreDevice: (deviceId: string) => void;
};

export function WledSettingsTab({
    settings,
    updateSettings,
    flushAutosaveNow,
    updateStatePayloadText,
    updateConfigPatchText,
    disableAccessPointNow,
    busy,
    onApplyNetwork,
    onRefreshSnapshot,
    statePayloadText,
    configPatchText,
    ignoredDevices,
    onUnignoreDevice,
}: WledSettingsTabProps) {
    const {t} = useTranslation("settings");
    const wledControlsDisabled = busy || !settings.wled.enabled;

    return (
        <div className="space-y-5">
            <Card className="w-full max-w-none">
                <CardHeader>
                    <CardTitle>{t("wledTab.componentTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <label className="flex items-center gap-3">
                        <Switch
                            checked={settings.wled.enabled}
                            onCheckedChange={(checked) => updateSettings({
                                ...settings,
                                wled: {...settings.wled, enabled: checked},
                                accessPoint: {
                                    ...settings.accessPoint,
                                    enabled: checked ? settings.accessPoint.enabled : false
                                }
                            }, "immediate")}
                            disabled={busy}
                        />
                        <span>{t("wledTab.enableComponent")}</span>
                    </label>
                    {!settings.wled.enabled && (
                        <p className="text-xs text-muted-foreground">
                            {t("wledTab.disabledHint")}
                        </p>
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
                    <p className="text-xs text-muted-foreground">
                        {t("wledTab.refreshHint")}
                    </p>
                </CardContent>
            </Card>

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
                            onCheckedChange={(checked) => updateSettings({
                                ...settings,
                                accessPoint: {...settings.accessPoint, enabled: checked}
                            }, "immediate")}
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
                    </div>
                    {!settings.wled.enabled && (
                        <p className="text-xs text-muted-foreground">
                            {t("wledTab.apDisabledWhileOff")}
                        </p>
                    )}

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <Field>
                            <FieldLabel htmlFor="ap-connection-name">{t("wledTab.apConnectionName")}</FieldLabel>
                            <Input
                                id="ap-connection-name"
                                type="text"
                                value={settings.accessPoint.connection}
                                onChange={(e) => updateSettings({
                                    ...settings,
                                    accessPoint: {...settings.accessPoint, connection: e.target.value}
                                })}
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
                                onChange={(e) => updateSettings({
                                    ...settings,
                                    accessPoint: {...settings.accessPoint, interfaceName: e.target.value}
                                })}
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
                                onChange={(e) => updateSettings({
                                    ...settings,
                                    accessPoint: {...settings.accessPoint, ssid: e.target.value}
                                })}
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
                                onChange={(e) => updateSettings({
                                    ...settings,
                                    accessPoint: {...settings.accessPoint, password: e.target.value}
                                })}
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
                                onChange={(e) => updateSettings({
                                    ...settings,
                                    accessPoint: {
                                        ...settings.accessPoint,
                                        channel: readNumber(e.target.value, 6)
                                    }
                                })}
                                onBlur={flushAutosaveNow}
                                disabled={wledControlsDisabled}
                            />
                        </Field>
                    </div>
                </CardContent>
            </Card>

            <Card className="w-full max-w-none">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold">{t("wledTab.provisioningTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <label className="flex cursor-pointer justify-start gap-3 items-center">
                        <Switch
                            checked={settings.wled.testing.simulateWled}
                            onCheckedChange={(checked) => updateSettings({
                                ...settings,
                                wled: {
                                    ...settings.wled,
                                    testing: {...settings.wled.testing, simulateWled: checked}
                                }
                            }, "immediate")}
                            disabled={wledControlsDisabled}
                        />
                        <span>{t("wledTab.simulateWled")}</span>
                    </label>
                    <p className="text-xs opacity-60">
                        <Trans
                            i18nKey="wledTab.simulateWledHint"
                            t={t}
                            components={[<code className="font-mono text-[10px]" key="sim"/>]}
                        />
                    </p>

                    <label className="flex cursor-pointer justify-start gap-3 items-center">
                        <Switch
                            checked={settings.wled.provisioning.autoProvision}
                            onCheckedChange={(checked) => updateSettings({
                                ...settings,
                                wled: {
                                    ...settings.wled,
                                    provisioning: {...settings.wled.provisioning, autoProvision: checked}
                                }
                            }, "immediate")}
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

            <Card className="w-full max-w-none">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold">{t("wledTab.ignoredDevicesTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm opacity-70">
                        <Trans
                            i18nKey="wledTab.ignoredDevicesDescription"
                            t={t}
                            components={[<code className="text-xs" key="state"/>]}
                        />
                    </p>
                    {ignoredDevices.length === 0 ? (
                        <p className="text-sm opacity-60">{t("wledTab.noIgnoredDevices")}</p>
                    ) : (
                        <ul className="space-y-2">
                            {ignoredDevices.map((dev) => (
                                <li
                                    key={dev.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded border bg-card px-3 py-2"
                                >
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{dev.name}</div>
                                        <div className="text-xs opacity-60 font-mono truncate">
                                            {dev.address}:{dev.port} • {dev.id}
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="shrink-0"
                                        onClick={() => onUnignoreDevice(dev.id)}
                                        disabled={busy || !settings.wled.enabled}
                                    >
                                        {t("wledTab.unignore")}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
            <Card className="w-full max-w-none">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold">{t("wledTab.debugInformationTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <label className="flex items-center gap-3">
                        <Switch
                            checked={settings.wled.debug?.showInfo ?? false}
                            onCheckedChange={(checked) => updateSettings({
                                ...settings,
                                wled: {
                                    ...settings.wled,
                                    debug: {
                                        showInfo: checked,
                                    },
                                },
                            }, "immediate")}
                            disabled={wledControlsDisabled}
                        />
                        <span>{t("wledTab.showDebugInformation")}</span>
                    </label>
                </CardContent>
            </Card>
        </div>
    );
}
