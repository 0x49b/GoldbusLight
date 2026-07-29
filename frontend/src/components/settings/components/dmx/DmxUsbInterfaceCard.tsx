import {Trans, useTranslation} from "react-i18next";
import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {NativeSelect, NativeSelectOption} from "@/components/ui/native-select.tsx";
import {Switch} from "@/components/ui/switch.tsx";
import type {ControllerSettings, USBSerialDevice} from "@/types/controller.ts";
import type {SettingsUpdater} from "../../settingsTypes.ts";

type DmxUsbInterfaceCardProps = {
    settings: ControllerSettings;
    updateSettings: SettingsUpdater;
    busy: boolean;
    universeId: string;
    selectedUSBDeviceId: string;
    usbSerialDevices: USBSerialDevice[];
    onRefreshUSBSerialDevices: () => void;
    onSelectUSBSerialDevice: (deviceId: string, universeId?: string) => void;
};

export function DmxUsbInterfaceCard({
    settings,
    updateSettings,
    busy,
    universeId,
    selectedUSBDeviceId,
    usbSerialDevices,
    onRefreshUSBSerialDevices,
    onSelectUSBSerialDevice,
}: DmxUsbInterfaceCardProps) {
    const {t} = useTranslation("settings");
    const dmxControlsDisabled = busy || !settings.dmx.enabled;
    const usbTransportEnabled = settings.dmx.usb.enabled ?? true;
    const usbFieldsDisabled = dmxControlsDisabled || !usbTransportEnabled;

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle className="text-sm font-semibold">{t("dmxTab.usbInterfaceTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <label className="flex items-center gap-3">
                    <Switch
                        checked={usbTransportEnabled}
                        onCheckedChange={(checked) =>
                            updateSettings(
                                {
                                    ...settings,
                                    dmx: {
                                        ...settings.dmx,
                                        usb: {...settings.dmx.usb, enabled: checked},
                                    },
                                },
                                "immediate",
                            )
                        }
                        disabled={dmxControlsDisabled}
                    />
                    <span>{t("dmxTab.enableUsbTransport")}</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                    <NativeSelect
                        className="w-full md:w-[28rem]"
                        value={selectedUSBDeviceId}
                        onChange={(event) => onSelectUSBSerialDevice(event.target.value, universeId)}
                        disabled={usbFieldsDisabled}
                    >
                        <NativeSelectOption value="">{t("dmxTab.noDeviceSelected")}</NativeSelectOption>
                        {usbSerialDevices.map((device) => (
                            <NativeSelectOption key={device.id} value={device.id}>
                                {device.protocol
                                    ? `${device.name} (${device.path}) · ${device.protocol}`
                                    : `${device.name} (${device.path})`}
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
                <p className="text-xs text-muted-foreground">{t("dmxTab.usbProtocolHint")}</p>
                <div className="space-y-2">
                    {selectedUSBDeviceId &&
                        !usbSerialDevices.some((device) => device.id === selectedUSBDeviceId) && (
                            <p className="text-xs text-destructive">
                                <Trans
                                    i18nKey="dmxTab.usbDeviceUnavailable"
                                    t={t}
                                    values={{id: selectedUSBDeviceId}}
                                    components={[<code key="id"/>]}
                                />
                            </p>
                        )}
                </div>
            </CardContent>
        </Card>
    );
}
