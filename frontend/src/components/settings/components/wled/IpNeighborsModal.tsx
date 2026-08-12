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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table.tsx";
import type {NetworkCommandResult} from "@/types/controller.ts";

type IpNeighborsModalProps = {
    open: boolean;
    onClose: () => void;
};

type NmapHostRow = {
    name: string;
    ip: string;
    status: string;
    latency: string;
};

type ParsedNmapOutput = {
    header: string;
    hosts: NmapHostRow[];
    footer: string;
};

const REPORT_WITH_NAME = /^Nmap scan report for (.+) \(([^)]+)\)$/;
const REPORT_IP_ONLY = /^Nmap scan report for ([0-9a-fA-F:.]+)$/;
const HOST_STATUS = /^Host is (\S+)(?: \((.+)\))?\.?$/i;

function parseNmapOutput(output: string): ParsedNmapOutput | null {
    const lines = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length === 0) {
        return null;
    }

    let header = "";
    let footer = "";
    const hosts: NmapHostRow[] = [];
    let pending: {name: string; ip: string} | null = null;

    for (const line of lines) {
        if (line.startsWith("Starting Nmap")) {
            header = line;
            continue;
        }
        if (line.startsWith("Nmap done:")) {
            footer = line;
            continue;
        }

        const withName = line.match(REPORT_WITH_NAME);
        if (withName) {
            pending = {name: withName[1], ip: withName[2]};
            continue;
        }

        const ipOnly = line.match(REPORT_IP_ONLY);
        if (ipOnly) {
            pending = {name: "", ip: ipOnly[1]};
            continue;
        }

        const statusMatch = line.match(HOST_STATUS);
        if (statusMatch && pending) {
            const detail = statusMatch[2] ?? "";
            const latencyMatch = detail.match(/([0-9.]+s)\s+latency/i);
            hosts.push({
                name: pending.name,
                ip: pending.ip,
                status: statusMatch[1].toLowerCase(),
                latency: latencyMatch?.[1] ?? "",
            });
            pending = null;
        }
    }

    if (!header && hosts.length === 0 && !footer) {
        return null;
    }

    return {header, hosts, footer};
}

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

    const parsed = result?.output ? parseNmapOutput(result.output) : null;

    const runScan = async () => {
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
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t("wledTab.ipNeighborsModalTitle")}</DialogTitle>
                    <DialogDescription>{t("wledTab.ipNeighborsModalDescription")}</DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => void runScan()}
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
                                    {parsed ? (
                                        <div className="space-y-2">
                                            {parsed.header && (
                                                <p className="font-mono text-xs text-muted-foreground">
                                                    {parsed.header}
                                                </p>
                                            )}
                                            {parsed.hosts.length > 0 ? (
                                                <div className="max-h-72 overflow-auto rounded border">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>{t("wledTab.ipNeighborsColName")}</TableHead>
                                                                <TableHead>{t("wledTab.ipNeighborsColIp")}</TableHead>
                                                                <TableHead>{t("wledTab.ipNeighborsColStatus")}</TableHead>
                                                                <TableHead>{t("wledTab.ipNeighborsColLatency")}</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {parsed.hosts.map((host) => (
                                                                <TableRow key={`${host.ip}-${host.name}`}>
                                                                    <TableCell className="font-medium">
                                                                        {host.name || "—"}
                                                                    </TableCell>
                                                                    <TableCell className="font-mono text-xs">
                                                                        {host.ip}
                                                                    </TableCell>
                                                                    <TableCell>{host.status}</TableCell>
                                                                    <TableCell className="font-mono text-xs">
                                                                        {host.latency || "—"}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">
                                                    {t("wledTab.ipNeighborsNoHosts")}
                                                </p>
                                            )}
                                            {parsed.footer && (
                                                <p className="font-mono text-xs text-muted-foreground">
                                                    {parsed.footer}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="max-h-64 overflow-auto rounded border p-2 bg-card">
                                            <pre className="text-xs whitespace-pre-wrap">
                                                {result.output?.trim()
                                                    ? result.output
                                                    : t("wledTab.ipNeighborsNoOutput")}
                                            </pre>
                                        </div>
                                    )}
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
