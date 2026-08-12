import {useEffect, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {PiNetwork} from "react-icons/pi";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Field, FieldLabel} from "@/components/ui/field.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Switch} from "@/components/ui/switch.tsx";
import {readNumber} from "@/lib/json.ts";
import type {AccessPointSettings, ControllerSettings} from "@/types/controller.ts";
import type {SettingsUpdater} from "../../settingsTypes.ts";
import {IpNeighborsModal} from "./IpNeighborsModal.tsx";

type ConfirmKind = "enable" | "disable" | "applyFields";

type WledAccessPointCardProps = {
    settings: ControllerSettings;
    updateSettings: SettingsUpdater;
    flushAutosaveNow: () => void;
    busy: boolean;
    onApplyNetworkNow: () => Promise<boolean>;
    listIPNeighborsSupported: boolean;
};

function cloneAccessPoint(ap: AccessPointSettings): AccessPointSettings {
    return {
        enabled: ap.enabled,
        connection: ap.connection,
        interfaceName: ap.interfaceName,
        ssid: ap.ssid,
        password: ap.password,
        channel: ap.channel,
    };
}

function accessPointEquals(a: AccessPointSettings, b: AccessPointSettings): boolean {
    return (
        a.enabled === b.enabled &&
        a.connection === b.connection &&
        a.interfaceName === b.interfaceName &&
        a.ssid === b.ssid &&
        a.password === b.password &&
        a.channel === b.channel
    );
}

export function WledAccessPointCard({
    settings,
    updateSettings,
    flushAutosaveNow,
    busy,
    onApplyNetworkNow,
    listIPNeighborsSupported,
}: Readonly<WledAccessPointCardProps>) {
    const {t} = useTranslation("settings");
    const [ipNeighborsOpen, setIpNeighborsOpen] = useState(false);
    const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
    const [confirmBusy, setConfirmBusy] = useState(false);
    const lastAppliedRef = useRef<AccessPointSettings>(cloneAccessPoint(settings.accessPoint));
    const wledControlsDisabled = busy || confirmBusy || !settings.wled.enabled;

    useEffect(() => {
        lastAppliedRef.current = cloneAccessPoint(settings.accessPoint);
    }, []);

    const patchAccessPoint = (patch: Partial<AccessPointSettings>) => {
        updateSettings({
            ...settings,
            accessPoint: {...settings.accessPoint, ...patch},
        });
    };

    const requestToggle = (enabled: boolean) => {
        if (enabled === settings.accessPoint.enabled) {
            return;
        }
        setConfirmKind(enabled ? "enable" : "disable");
    };

    const onFieldBlur = () => {
        if (!settings.accessPoint.enabled) {
            flushAutosaveNow();
            return;
        }
        if (accessPointEquals(settings.accessPoint, lastAppliedRef.current)) {
            flushAutosaveNow();
            return;
        }
        setConfirmKind("applyFields");
    };

    const closeConfirm = () => {
        if (confirmBusy) {
            return;
        }
        setConfirmKind(null);
    };

    const confirmAction = async () => {
        if (!confirmKind) {
            return;
        }
        setConfirmBusy(true);
        try {
            if (confirmKind === "enable" || confirmKind === "disable") {
                const enabled = confirmKind === "enable";
                updateSettings((prev) => {
                    if (!prev) {
                        return prev;
                    }
                    return {
                        ...prev,
                        accessPoint: {...prev.accessPoint, enabled},
                    };
                }, "debounced");
                const saved = await onApplyNetworkNow();
                if (saved) {
                    lastAppliedRef.current = cloneAccessPoint({
                        ...settings.accessPoint,
                        enabled,
                    });
                }
            } else {
                const saved = await onApplyNetworkNow();
                if (saved) {
                    lastAppliedRef.current = cloneAccessPoint(settings.accessPoint);
                }
            }
        } finally {
            setConfirmBusy(false);
            setConfirmKind(null);
        }
    };

    const confirmTitle =
        confirmKind === "enable"
            ? t("wledTab.apConfirmEnableTitle")
            : confirmKind === "disable"
              ? t("wledTab.apConfirmDisableTitle")
              : t("wledTab.apConfirmApplyFieldsTitle");

    const confirmDescription =
        confirmKind === "enable"
            ? t("wledTab.apConfirmEnableDescription")
            : confirmKind === "disable"
              ? t("wledTab.apConfirmDisableDescription")
              : t("wledTab.apConfirmApplyFieldsDescription");

    const confirmLabel =
        confirmKind === "enable"
            ? t("wledTab.apConfirmEnableAction")
            : confirmKind === "disable"
              ? t("wledTab.apConfirmDisableAction")
              : t("wledTab.apConfirmApplyFieldsAction");

    return (
        <Card className="w-full max-w-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
                <CardTitle>{t("wledTab.accessPointTitle")}</CardTitle>
                {listIPNeighborsSupported && (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setIpNeighborsOpen(true)}
                        disabled={busy || confirmBusy}
                    >
                        <PiNetwork/>
                        {t("wledTab.ipNeighborsOpen")}
                    </Button>
                )}
            </CardHeader>
            <CardContent className="space-y-4">
                <label className="flex items-center gap-3">
                    <Switch
                        id="enable-ap"
                        checked={settings.accessPoint.enabled}
                        onCheckedChange={(checked) => requestToggle(checked)}
                        disabled={wledControlsDisabled}
                    />
                    <Label htmlFor="enable-ap">{t("wledTab.enableAccessPoint")}</Label>
                </label>
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
                            onChange={(e) => patchAccessPoint({connection: e.target.value})}
                            onBlur={onFieldBlur}
                            disabled={wledControlsDisabled}
                        />
                    </Field>

                    <Field>
                        <FieldLabel htmlFor="ap-interface">{t("wledTab.apInterface")}</FieldLabel>
                        <Input
                            id="ap-interface"
                            type="text"
                            value={settings.accessPoint.interfaceName}
                            onChange={(e) => patchAccessPoint({interfaceName: e.target.value})}
                            onBlur={onFieldBlur}
                            disabled={wledControlsDisabled}
                        />
                    </Field>

                    <Field>
                        <FieldLabel htmlFor="ap-ssid">{t("wledTab.apSsid")}</FieldLabel>
                        <Input
                            id="ap-ssid"
                            type="text"
                            value={settings.accessPoint.ssid}
                            onChange={(e) => patchAccessPoint({ssid: e.target.value})}
                            onBlur={onFieldBlur}
                            disabled={wledControlsDisabled}
                        />
                    </Field>

                    <Field>
                        <FieldLabel htmlFor="ap-password">{t("wledTab.apPassword")}</FieldLabel>
                        <Input
                            id="ap-password"
                            type="text"
                            value={settings.accessPoint.password}
                            onChange={(e) => patchAccessPoint({password: e.target.value})}
                            onBlur={onFieldBlur}
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
                                patchAccessPoint({channel: readNumber(e.target.value, 6)})
                            }
                            onBlur={onFieldBlur}
                            disabled={wledControlsDisabled}
                        />
                    </Field>
                </div>
            </CardContent>

            <AlertDialog
                open={confirmKind !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        closeConfirm();
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
                        <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={confirmBusy}>
                            {t("wledTab.apConfirmCancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={confirmBusy}
                            variant={confirmKind === "disable" ? "destructive" : "default"}
                            onClick={(event) => {
                                event.preventDefault();
                                void confirmAction();
                            }}
                        >
                            {confirmBusy ? t("wledTab.apConfirmWorking") : confirmLabel}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
