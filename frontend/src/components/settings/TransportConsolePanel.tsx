import {useCallback, useEffect, useMemo, useRef} from "react";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import type {ConsoleEntry} from "../../types/controller";

const TRANSPORT_LABEL: Record<string, string> = {
    wled: "WLED",
    "usb-dmx": "USB DMX",
    artnet: "Art-Net",
};

const DIRECTION_BADGE_CLASS: Record<string, string> = {
    out: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    in: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    info: "bg-muted text-muted-foreground",
    error: "bg-destructive/20 text-destructive",
};

function formatConsoleTime(ts: string): string {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) {
        return ts;
    }
    return d.toLocaleTimeString(undefined, {hour12: false}) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

type TransportConsolePanelProps = {
    entries: ConsoleEntry[];
    onClear: () => void;
    onToggleDetach?: () => void;
    detached?: boolean;
};

export function TransportConsolePanel({
    entries,
    onClear,
    onToggleDetach,
    detached = false,
}: TransportConsolePanelProps) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const autoScrollRef = useRef<boolean>(true);

    const orderedEntries = useMemo(() => {
        return [...entries].sort((a, b) => a.id - b.id);
    }, [entries]);

    useEffect(() => {
        if (!autoScrollRef.current) {
            return;
        }
        const el = scrollRef.current;
        if (!el) {
            return;
        }
        el.scrollTop = el.scrollHeight;
    }, [orderedEntries.length]);

    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) {
            return;
        }
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        autoScrollRef.current = distanceFromBottom < 32;
    }, []);

    return (
        <Card className="w-full max-w-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
                <CardTitle className="text-sm font-semibold">Live transport console</CardTitle>
                <div className="flex items-center gap-2">
                    {onToggleDetach && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={onToggleDetach}
                        >
                            {detached ? "Attach back" : "Detach"}
                        </Button>
                    )}
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onClear}
                        disabled={orderedEntries.length === 0}
                    >
                        Clear
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                    Live commands sent to USB-DMX, Art-Net and WLED transports appear here as they are dispatched.
                </p>
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="max-h-[28rem] overflow-auto rounded border bg-card font-mono text-xs"
                >
                    {orderedEntries.length === 0 ? (
                        <div className="p-3 text-muted-foreground">No transport activity yet.</div>
                    ) : (
                        <ul className="divide-y">
                            {orderedEntries.map((entry) => {
                                const badgeClass = DIRECTION_BADGE_CLASS[entry.direction] ?? DIRECTION_BADGE_CLASS.info;
                                const transportLabel = TRANSPORT_LABEL[entry.transport] ?? entry.transport;
                                return (
                                    <li key={entry.id} className="px-3 py-1.5 leading-relaxed">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="opacity-60">{formatConsoleTime(entry.timestamp)}</span>
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${badgeClass}`}>
                                                {entry.direction}
                                            </span>
                                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                                                {transportLabel}
                                            </span>
                                            {entry.target && (
                                                <span className="opacity-80 truncate">{entry.target}</span>
                                            )}
                                            <span className="flex-1 break-words">{entry.summary}</span>
                                        </div>
                                        {entry.detail && (
                                            <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] opacity-70">{entry.detail}</pre>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
