import {Trans, useTranslation} from "react-i18next";
import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import type {WLEDDevice} from "@/types/controller.ts";

type WledIgnoredDevicesCardProps = {
    busy: boolean;
    wledEnabled: boolean;
    ignoredDevices: WLEDDevice[];
    onUnignoreDevice: (deviceId: string) => void;
};

export function WledIgnoredDevicesCard({
                                           busy,
                                           wledEnabled,
                                           ignoredDevices,
                                           onUnignoreDevice,
                                       }: Readonly<WledIgnoredDevicesCardProps>) {
    const {t} = useTranslation("settings");

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle
                    className="text-sm font-semibold">{t("wledTab.ignoredDevicesTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                                    disabled={busy || !wledEnabled}
                                >
                                    {t("wledTab.unignore")}
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
