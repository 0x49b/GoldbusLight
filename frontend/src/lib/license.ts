export type LicenseFeature =
    | "dmx"
    | "party"
    | "accessPoint"
    | "backup"
    | "fixtureExport"
    | "dmxChannelSweep"
    | "wledUnlimited";

export type LicenseInfo = {
    edition: string;
    status: string;
    expiresAt?: string | null;
    customerName?: string;
    customerId?: string;
    daysRemaining?: number;
    machineId?: string;
    features: Record<string, boolean>;
};

export function hasLicenseFeature(license: LicenseInfo | null | undefined, feature: LicenseFeature): boolean {
    return license?.features?.[feature] === true;
}

export function isProLicense(license: LicenseInfo | null | undefined): boolean {
    return license?.edition === "pro" && (license.status === "active" || license.status === "grace");
}

export function licenseStatusLabel(license: LicenseInfo | null | undefined): string {
    if (!license) {
        return "Free";
    }
    switch (license.status) {
        case "active":
            return "Pro (active)";
        case "grace":
            return "Pro (grace period)";
        case "expired":
            return "Pro expired";
        default:
            return "Free";
    }
}
