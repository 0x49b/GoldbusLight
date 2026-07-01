import {useState} from "react";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Field, FieldLabel} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {hasLicenseFeature, isProLicense, licenseStatusLabel} from "@/lib/license";
import type {LicenseInfo} from "@/types/controller.ts";

const PURCHASE_URL = "https://goldbus.ch/light-controller/pro";

export type LicenseSettingsPanelProps = {
    license: LicenseInfo | null | undefined;
    busy: boolean;
    onActivateLicense: (key: string) => Promise<void>;
    onDeactivateLicense: () => Promise<void>;
    onError: (message: string) => void;
};

export function LicenseSettingsPanel({
    license,
    busy,
    onActivateLicense,
    onDeactivateLicense,
    onError,
}: LicenseSettingsPanelProps) {
    const [licenseKey, setLicenseKey] = useState("");
    const [licenseBusy, setLicenseBusy] = useState(false);

    const pro = isProLicense(license);
    const grace = license?.status === "grace";

    return (
        <Card className="w-full max-w-none">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-sm font-semibold">License</CardTitle>
                <Badge variant={pro ? "default" : "secondary"}>{licenseStatusLabel(license)}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="text-sm space-y-1">
                    {license?.customerName ? (
                        <p>
                            Licensed to <span className="font-medium">{license.customerName}</span>
                        </p>
                    ) : (
                        <p className="opacity-70">
                            Free edition: WLED control for up to 8 devices. Upgrade to Pro for DMX, Party mode,
                            backup, and Wi-Fi provisioning.
                        </p>
                    )}
                    {license?.expiresAt && (
                        <p className="opacity-70">
                            Expires: {new Date(license.expiresAt).toLocaleDateString()}
                            {license.daysRemaining != null && license.daysRemaining > 0
                                ? ` (${license.daysRemaining} days remaining)`
                                : ""}
                        </p>
                    )}
                    {license?.machineId && (
                        <p className="text-xs opacity-60 break-all">
                            Machine ID: <code>{license.machineId}</code>
                        </p>
                    )}
                </div>

                {grace && (
                    <Alert>
                        <AlertDescription>
                            Your Pro license has expired but is still active during the 14-day grace period. Renew
                            soon to avoid losing Pro features.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="flex flex-wrap gap-2 text-xs">
                    <FeaturePill label="DMX" enabled={hasLicenseFeature(license, "dmx")} />
                    <FeaturePill label="Party" enabled={hasLicenseFeature(license, "party")} />
                    <FeaturePill label="Backup" enabled={hasLicenseFeature(license, "backup")} />
                    <FeaturePill label="Wi-Fi AP" enabled={hasLicenseFeature(license, "accessPoint")} />
                </div>

                <Field>
                    <FieldLabel htmlFor="license-key">Pro license key</FieldLabel>
                    <Input
                        id="license-key"
                        value={licenseKey}
                        onChange={(e) => setLicenseKey(e.target.value)}
                        placeholder="GBLC1.…"
                        disabled={busy || licenseBusy}
                    />
                </Field>

                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        disabled={busy || licenseBusy || licenseKey.trim().length === 0}
                        onClick={() => {
                            setLicenseBusy(true);
                            void onActivateLicense(licenseKey.trim())
                                .then(() => setLicenseKey(""))
                                .catch((err: unknown) => onError(String(err)))
                                .finally(() => setLicenseBusy(false));
                        }}
                    >
                        Activate
                    </Button>
                    {pro && (
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || licenseBusy}
                            onClick={() => {
                                setLicenseBusy(true);
                                void onDeactivateLicense()
                                    .catch((err: unknown) => onError(String(err)))
                                    .finally(() => setLicenseBusy(false));
                            }}
                        >
                            Deactivate
                        </Button>
                    )}
                    <Button size="sm" variant="link" asChild>
                        <a href={PURCHASE_URL} target="_blank" rel="noreferrer">
                            Purchase or renew Pro
                        </a>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function FeaturePill({label, enabled}: {label: string; enabled: boolean}) {
    return (
        <span
            className={
                enabled
                    ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300"
                    : "rounded-full border px-2 py-0.5 opacity-60"
            }
        >
            {enabled ? label : `${label} (Pro)`}
        </span>
    );
}
