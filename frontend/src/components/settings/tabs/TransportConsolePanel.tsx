import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {useTranslation} from "react-i18next";
import {ArrowDownToLine} from "lucide-react";
import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Toggle} from "@/components/ui/toggle.tsx";
import type {ConsoleEntry} from "@/types/controller.ts";

const TRANSPORT_LABEL_KEY: Record<string, string> = {
    wled: "console.transports.wled",
    "usb-dmx": "console.transports.usbDmx",
    artnet: "console.transports.artnet",
};

const DIRECTION_FILTERS = ["info", "out", "in", "warning", "error"] as const;

const DIRECTION_BADGE_CLASS: Record<string, string> = {
    out: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    in: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    info: "bg-muted text-muted-foreground",
    warning: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
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
                                      }: Readonly<TransportConsolePanelProps>) {
    const {t} = useTranslation("settings");
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
    const [selectedTypes, setSelectedTypes] = useState<Set<string>>(() => new Set());
    const [query, setQuery] = useState("");

    const orderedEntries = useMemo(() => {
        return [...entries].sort((a, b) => a.id - b.id);
    }, [entries]);

    const visibleEntries = useMemo(() => {
        const q = query.trim().toLowerCase();
        return orderedEntries.filter((entry) => {
            if (selectedTypes.size > 0 && !selectedTypes.has(entry.direction)) {
                return false;
            }
            if (!q) {
                return true;
            }
            const transportKey = TRANSPORT_LABEL_KEY[entry.transport];
            const transportLabel = transportKey ? t(transportKey) : entry.transport;
            const haystack = [
                entry.summary,
                entry.detail ?? "",
                entry.target,
                entry.direction,
                entry.transport,
                transportLabel,
            ]
                .join(" ")
                .toLowerCase();
            return haystack.includes(q);
        });
    }, [orderedEntries, selectedTypes, query, t]);

    const lastVisibleId = visibleEntries.length > 0 ? visibleEntries[visibleEntries.length - 1].id : 0;

    useEffect(() => {
        if (!autoScrollEnabled) {
            return;
        }
        const el = scrollRef.current;
        if (!el) {
            return;
        }
        el.scrollTop = el.scrollHeight;
    }, [autoScrollEnabled, visibleEntries.length, lastVisibleId]);

    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) {
            return;
        }
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        setAutoScrollEnabled(distanceFromBottom < 32);
    }, []);

    const scrollToBottom = useCallback(() => {
        setAutoScrollEnabled(true);
        const el = scrollRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, []);

    const toggleDirection = useCallback((direction: string) => {
        setSelectedTypes((prev) => {
            const next = new Set(prev);
            if (next.has(direction)) {
                next.delete(direction);
            } else {
                next.add(direction);
            }
            return next;
        });
    }, []);

    let listBody: ReactNode;
    if (orderedEntries.length === 0) {
        listBody = <div className="p-3 text-muted-foreground">{t("console.noActivity")}</div>;
    } else if (visibleEntries.length === 0) {
        listBody = <div className="p-3 text-muted-foreground">{t("console.noMatches")}</div>;
    } else {
        listBody = (
            <ul className="divide-y">
                {visibleEntries.map((entry) => {
                    const badgeClass = DIRECTION_BADGE_CLASS[entry.direction] ?? DIRECTION_BADGE_CLASS.info;
                    const transportKey = TRANSPORT_LABEL_KEY[entry.transport];
                    const transportLabel = transportKey ? t(transportKey) : entry.transport;
                    return (
                        <li key={entry.id} className="px-3 py-1.5 leading-relaxed">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="opacity-60">{formatConsoleTime(entry.timestamp)}</span>
                                <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${badgeClass}`}>
                                    {entry.direction}
                                </span>
                                <span
                                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                                    {transportLabel}
                                </span>
                                {entry.target && (
                                    <span className="opacity-80 truncate">{entry.target}</span>
                                )}
                                <span className="flex-1 break-words">{entry.summary}</span>
                            </div>
                            {entry.detail && (
                                <pre
                                    className="mt-1 whitespace-pre-wrap break-all text-[10px] opacity-70">{entry.detail}</pre>
                            )}
                        </li>
                    );
                })}
            </ul>
        );
    }

    return (
        <Card className="h-full min-h-0 w-full max-w-none gap-3">
            <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 gap-2">
                <CardTitle className="text-sm font-semibold">{t("console.title")}</CardTitle>
                <div className="flex items-center gap-2">
                    {onToggleDetach && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={onToggleDetach}
                        >
                            {detached ? t("console.attachBack") : t("console.detach")}
                        </Button>
                    )}
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onClear}
                        disabled={orderedEntries.length === 0}
                    >
                        {t("console.clear")}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="min-h-0 flex-1 overflow-auto rounded border bg-card font-mono text-xs"
                >
                    {listBody}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                        {DIRECTION_FILTERS.map((direction) => (
                            <Toggle
                                key={direction}
                                type="button"
                                size="sm"
                                variant="outline"
                                pressed={selectedTypes.has(direction)}
                                onPressedChange={() => toggleDirection(direction)}
                                aria-label={t(`console.directions.${direction}`)}
                                className="uppercase"
                            >
                                {t(`console.directions.${direction}`)}
                            </Toggle>
                        ))}
                    </div>
                    <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("console.searchPlaceholder")}
                        className="h-8 min-w-[10rem] flex-1 text-xs"
                        aria-label={t("console.searchPlaceholder")}
                    />
                    <Button
                        type="button"
                        size="icon-sm"
                        variant={autoScrollEnabled ? "outline" : "default"}
                        onClick={scrollToBottom}
                        aria-label={t("console.scrollToBottom")}
                        title={t("console.scrollToBottom")}
                    >
                        <ArrowDownToLine/>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
