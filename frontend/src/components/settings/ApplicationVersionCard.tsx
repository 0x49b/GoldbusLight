import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {PiArrowsClockwise} from "react-icons/pi";

type ApplicationVersionCardProps = {
    currentVersion: string;
    busy: boolean;
    updateCheckBusy: boolean;
    onCheckForUpdates: () => Promise<void>;
    onUpdateCheckError: (message: string) => void;
    onUpdateCheckStart: () => void;
    onUpdateCheckEnd: () => void;
};

function installedVersionLabel(currentVersion: string): string {
    const trimmed = currentVersion.trim();
    if (!trimmed || trimmed === "unknown") {
        return "Loading…";
    }
    return trimmed;
}

export function ApplicationVersionCard({
    currentVersion,
    busy,
    updateCheckBusy,
    onCheckForUpdates,
    onUpdateCheckError,
    onUpdateCheckStart,
    onUpdateCheckEnd,
}: ApplicationVersionCardProps) {
    const versionKnown = currentVersion.trim() !== "" && currentVersion !== "unknown";
    const versionLabel = installedVersionLabel(currentVersion);

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle className="text-sm font-semibold">Application version</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm opacity-70">Installed version</span>
                    <Badge variant={versionKnown ? "secondary" : "outline"}>
                        {versionLabel}
                    </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || updateCheckBusy}
                        onClick={() => {
                            onUpdateCheckStart();
                            void onCheckForUpdates()
                                .catch((err: unknown) => onUpdateCheckError(String(err)))
                                .finally(() => onUpdateCheckEnd());
                        }}
                    >
                        <PiArrowsClockwise/>
                        Check for updates
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Opens the built-in updater to download and install a newer release when one is available.
                </p>
            </CardContent>
        </Card>
    );
}
