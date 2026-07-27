import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Field, FieldLabel} from "@/components/ui/field.tsx";
import {Input} from "@/components/ui/input.tsx";
import {NativeSelect, NativeSelectOption} from "@/components/ui/native-select.tsx";
import {Switch} from "@/components/ui/switch.tsx";
import {Trans, useTranslation} from "react-i18next";
import {readNumber} from "../../../lib/json.ts";
import type {
    ArtNetSettings,
    ControllerSettings,
    DMXState,
    USBSerialDevice,
} from "@/types/controller.ts";
import {DmxFixtureChannelSweepPanel} from "../components/DmxFixtureChannelSweepPanel.tsx";
import {universeInterfaceSettings} from "@/lib/dmxUniverses.ts";
import type {SettingsUpdater} from "../settingsTypes.ts";

export type DmxSettingsTabProps = {
    settings: ControllerSettings;
    updateSettings: SettingsUpdater;
    updateUniverseArtNet: (
        universeId: string,
        patch: Partial<ArtNetSettings>,
        mode?: "debounced" | "immediate",
    ) => void;
    flushAutosaveNow: () => void;
    busy: boolean;
    dmxState: DMXState;
    dmxEnabled: boolean;
    dmxPartyRunning: boolean;
    usbSerialDevices: USBSerialDevice[];
    onRefreshUSBSerialDevices: () => void;
    onSelectUSBSerialDevice: (deviceId: string, universeId?: string) => void;
    startDMXLiveOutput: (fixtureId: string) => Promise<boolean>;
    setError: (message: string) => void;
};

export function DmxSettingsTab({
                                   settings,
                                   updateSettings,
                                   updateUniverseArtNet,
                                   flushAutosaveNow,
                                   busy,
                                   dmxState,
                                   dmxEnabled,
                                   dmxPartyRunning,
                                   usbSerialDevices,
                                   onRefreshUSBSerialDevices,
                                   onSelectUSBSerialDevice,
                                   startDMXLiveOutput,
                                   setError,
                               }: Readonly<DmxSettingsTabProps>) {
    const {t} = useTranslation("settings");
    const dmxControlsDisabled = busy || !settings.dmx.enabled;
    const usbTransportEnabled = settings.dmx.usb.enabled ?? true;
    const universeId = "universe-1";
    const iface = universeInterfaceSettings(settings, universeId, dmxState);
    const usbFieldsDisabled = dmxControlsDisabled || !usbTransportEnabled;
    const artNetFieldsDisabled = dmxControlsDisabled || !iface.artNet.enabled;
    const usbDeviceId = iface.selectedUSBDeviceId;

    return (
        <div className="space-y-5">
            <Card className="w-full max-w-none">
                <CardHeader>
                    <CardTitle>{t("dmxTab.componentTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <label className="flex items-center gap-3">
                        <Switch
                            checked={settings.dmx.enabled}
                            onCheckedChange={(checked) => updateSettings({
                                ...settings,
                                dmx: {...settings.dmx, enabled: checked}
                            }, "immediate")}
                            disabled={busy}
                        />
                        <span>{t("dmxTab.enableComponent")}</span>
                    </label>

                    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                        <p className="text-xs font-medium text-muted-foreground">{t("dmxTab.simulatorInterfaces")}</p>
                        <label className="flex items-center gap-3">
                            <Switch
                                checked={settings.dmx.testing.simulateUsbDmx}
                                onCheckedChange={(checked) => updateSettings({
                                    ...settings,
                                    dmx: {
                                        ...settings.dmx,
                                        testing: {...settings.dmx.testing, simulateUsbDmx: checked}
                                    }
                                }, "immediate")}
                                disabled={dmxControlsDisabled}
                            />
                            <span>{t("dmxTab.simulateUsb")}</span>
                        </label>
                        <label className="flex items-center gap-3">
                            <Switch
                                checked={settings.dmx.testing.simulateArtNet}
                                onCheckedChange={(checked) => updateSettings({
                                    ...settings,
                                    dmx: {
                                        ...settings.dmx,
                                        testing: {...settings.dmx.testing, simulateArtNet: checked}
                                    }
                                }, "immediate")}
                                disabled={dmxControlsDisabled}
                            />
                            <span>{t("dmxTab.simulateArtNet")}</span>
                        </label>
                    </div>
                </CardContent>
            </Card>

            <Card className="w-full max-w-none">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold">{t("dmxTab.usbInterfaceTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <label className="flex items-center gap-3">
                        <Switch
                            checked={usbTransportEnabled}
                            onCheckedChange={(checked) => updateSettings({
                                ...settings,
                                dmx: {
                                    ...settings.dmx,
                                    usb: {...settings.dmx.usb, enabled: checked},
                                }
                            }, "immediate")}
                            disabled={dmxControlsDisabled}
                        />
                        <span>{t("dmxTab.enableUsbTransport")}</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                        <NativeSelect
                            className="w-full md:w-[28rem]"
                            value={usbDeviceId ?? ""}
                            onChange={(event) => onSelectUSBSerialDevice(event.target.value, universeId)}
                            disabled={usbFieldsDisabled}
                        >
                            <NativeSelectOption value="">{t("dmxTab.noDeviceSelected")}</NativeSelectOption>
                            {usbSerialDevices.map((device) => (
                                <NativeSelectOption key={device.id} value={device.id}>
                                    {device.name} ({device.path})
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={onRefreshUSBSerialDevices}
                            disabled={dmxControlsDisabled}
                        >
                            {t("dmxTab.refreshUsbDevices")}
                        </Button>
                    </div>
                    <div className="space-y-2">
                        {usbDeviceId && !usbSerialDevices.some((device) => device.id === usbDeviceId) && (
                            <p className="text-xs text-destructive">
                                <Trans
                                    i18nKey="dmxTab.usbDeviceUnavailable"
                                    t={t}
                                    values={{id: usbDeviceId}}
                                    components={[<code key="id"/>]}
                                />
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="w-full max-w-none">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold">{t("dmxTab.artNetTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <label className="flex items-center gap-3">
                        <Switch
                            checked={iface.artNet.enabled}
                            onCheckedChange={(checked) => updateUniverseArtNet(universeId, {enabled: checked}, "immediate")}
                            disabled={dmxControlsDisabled}
                        />
                        <span>{t("dmxTab.enableArtNet")}</span>
                    </label>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <Field>
                            <FieldLabel>{t("dmxTab.targetHost")}</FieldLabel>
                            <Input
                                value={iface.artNet.targetHost}
                                onChange={(e) => updateUniverseArtNet(universeId, {targetHost: e.target.value})}
                                onBlur={flushAutosaveNow}
                                disabled={artNetFieldsDisabled}
                            />
                        </Field>
                        <Field>
                            <FieldLabel>{t("dmxTab.udpPort")}</FieldLabel>
                            <Input
                                type="number"
                                min={1}
                                max={65535}
                                value={iface.artNet.port}
                                onChange={(e) => updateUniverseArtNet(universeId, {port: readNumber(e.target.value, 6454)})}
                                onBlur={flushAutosaveNow}
                                disabled={artNetFieldsDisabled}
                            />
                        </Field>
                        <Field>
                            <FieldLabel>{t("dmxTab.net")}</FieldLabel>
                            <Input
                                type="number"
                                min={0}
                                max={127}
                                value={iface.artNet.net}
                                onChange={(e) => updateUniverseArtNet(universeId, {net: readNumber(e.target.value, 0)})}
                                onBlur={flushAutosaveNow}
                                disabled={artNetFieldsDisabled}
                            />
                        </Field>
                        <Field>
                            <FieldLabel>{t("dmxTab.subnet")}</FieldLabel>
                            <Input
                                type="number"
                                min={0}
                                max={15}
                                value={iface.artNet.subnet}
                                onChange={(e) => updateUniverseArtNet(universeId, {subnet: readNumber(e.target.value, 0)})}
                                onBlur={flushAutosaveNow}
                                disabled={artNetFieldsDisabled}
                            />
                        </Field>
                        <Field>
                            <FieldLabel>{t("dmxTab.artNetUniverse")}</FieldLabel>
                            <Input
                                type="number"
                                min={0}
                                max={15}
                                value={iface.artNet.universe}
                                onChange={(e) => updateUniverseArtNet(universeId, {universe: readNumber(e.target.value, 0)})}
                                onBlur={flushAutosaveNow}
                                disabled={artNetFieldsDisabled}
                            />
                        </Field>
                        <Field>
                            <FieldLabel>{t("dmxTab.refreshHz")}</FieldLabel>
                            <Input
                                type="number"
                                min={1}
                                max={50}
                                value={iface.artNet.refreshHz}
                                onChange={(e) => updateUniverseArtNet(universeId, {refreshHz: readNumber(e.target.value, 44)})}
                                onBlur={flushAutosaveNow}
                                disabled={artNetFieldsDisabled}
                            />
                        </Field>
                    </div>

                </CardContent>
            </Card>

            <DmxFixtureChannelSweepPanel
                fixtures={dmxState.fixtures}
                dmxEnabled={dmxEnabled}
                settings={settings}
                selectedUSBDeviceId={dmxState.selectedUSBDeviceId ?? null}
                usbSerialDevices={usbSerialDevices}
                partyRunning={dmxPartyRunning}
                busy={busy}
                startDMXLiveOutput={startDMXLiveOutput}
                setError={setError}
            />
        </div>
    );
}
