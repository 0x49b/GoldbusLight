import {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {PiNetwork} from "react-icons/pi";
import * as GoldbusLightService from "../../../../../bindings/goldbus/internal/service/goldbuslightservice";
import {Alert, AlertDescription} from "@/components/ui/alert.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog.tsx";
import type {NetworkCommandResult} from "@/types/controller.ts";

type IpNeighborsModalProps = {
    open: boolean;
    onClose: () => void;
};

export function IpNeighborsModal({open, onClose}: Readonly<IpNeighborsModalProps>) {
    const {t} = useTranslation("settings");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<NetworkCommandResult | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) {
            setBusy(false);
            setResult(null);
            setError("");
        }
    }, [open]);

    const runIpNeigh = async () => {
        setBusy(true);
        setError("");
        try {
            const next = (await GoldbusLightService.ListIPNeighbors()) as NetworkCommandResult;
            setResult(next);
            if (!next.success && next.error) {
                setError(next.error);
            }
        } catch (err) {
            setResult(null);
            setError(String(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("wledTab.ipNeighborsModalTitle")}</DialogTitle>
                    <DialogDescription>{t("wledTab.ipNeighborsModalDescription")}</DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => void runIpNeigh()}
                        disabled={busy}
                    >
                        <PiNetwork/>
                        {busy ? t("wledTab.ipNeighborsRunning") : t("wledTab.ipNeighborsRun")}
                    </Button>

                    {error && (
                        <Alert className="py-2">
                            <AlertDescription className="text-xs">{error}</AlertDescription>
                        </Alert>
                    )}

                    <Card className="w-full max-w-none">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold">
                                {t("wledTab.ipNeighborsResultTitle")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {!result ? (
                                <p className="text-sm text-muted-foreground">
                                    {t("wledTab.ipNeighborsResultEmpty")}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    <p className="font-mono text-xs text-muted-foreground">
                                        {result.command}
                                        {result.success
                                            ? ` — ${t("wledTab.ipNeighborsSuccess")}`
                                            : ` — ${t("wledTab.ipNeighborsFailed")}`}
                                    </p>
                                    <div className="max-h-64 overflow-auto rounded border p-2 bg-card">
                                        <pre className="text-xs whitespace-pre-wrap">
                                            {result.output?.trim()
                                                ? result.output
                                                : t("wledTab.ipNeighborsNoOutput")}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        {t("wledTab.ipNeighborsClose")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
