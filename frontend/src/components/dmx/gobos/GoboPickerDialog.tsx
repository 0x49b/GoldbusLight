import React, { useState, useEffect, useMemo } from "react";
import type { DMXChannel, JSONMap } from "@/types/controller.ts";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { parseEntries } from "../channels/ChannelBase";

export type GoboCatalogEntry = {
    code: string;
    name: string;
    image: string;
};

export interface GoboPickerDialogProps {
    goboPickerTarget: { channelIdx: number; slotIdx: number } | null;
    setGoboPickerTarget: (target: { channelIdx: number; slotIdx: number } | null) => void;
    setChannels: React.Dispatch<React.SetStateAction<DMXChannel[]>>;
}

function parseGoboCatalog(data: unknown): GoboCatalogEntry[] {
    if (!Array.isArray(data)) {
        return [];
    }
    const out: GoboCatalogEntry[] = [];
    for (const item of data) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            continue;
        }
        const o = item as Record<string, unknown>;
        const code = typeof o.code === "string" ? o.code : "";
        const name = typeof o.name === "string" ? o.name : "";
        const image = typeof o.image === "string" ? o.image : "";
        if (code && name && image) {
            out.push({ code, name, image });
        }
    }
    return out;
}

export function GoboPickerDialog({
    goboPickerTarget,
    setGoboPickerTarget,
    setChannels,
}: GoboPickerDialogProps) {
    const [goboCatalog, setGoboCatalog] = useState<GoboCatalogEntry[] | null>(null);
    const [goboCatalogError, setGoboCatalogError] = useState<string | null>(null);
    const [goboCatalogFilter, setGoboCatalogFilter] = useState("");

    useEffect(() => {
        let cancelled = false;
        setGoboCatalogError(null);
        (async () => {
            try {
                const res = await fetch("/gobos/catalog.json");
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const data: unknown = await res.json();
                if (cancelled) {
                    return;
                }
                setGoboCatalog(parseGoboCatalog(data));
            } catch (e) {
                if (!cancelled) {
                    setGoboCatalogError(e instanceof Error ? e.message : "Failed to load gobo catalog");
                    setGoboCatalog([]);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!goboPickerTarget) {
            setGoboCatalogFilter("");
        }
    }, [goboPickerTarget]);

    const goboCatalogShown = useMemo(() => {
        if (!goboCatalog || goboCatalog.length === 0) {
            return [];
        }
        const q = goboCatalogFilter.trim().toLowerCase();
        if (q === "") {
            return goboCatalog.slice(0, 400);
        }
        return goboCatalog.filter(
            (entry) =>
                entry.code.toLowerCase().includes(q) ||
                entry.name.toLowerCase().includes(q)
        );
    }, [goboCatalog, goboCatalogFilter]);

    return (
        <Dialog
            open={goboPickerTarget !== null}
            onOpenChange={(open) => {
                if (!open) {
                    setGoboPickerTarget(null);
                }
            }}
        >
            <DialogContent
                showCloseButton
                className="flex max-h-[88vh] w-full max-w-[min(42rem,calc(100%-2rem))] flex-col gap-3 sm:max-w-2xl"
            >
                <DialogHeader>
                    <DialogTitle>Choose gobo</DialogTitle>
                    <DialogDescription>
                        Filter by Rosco code or name. Images load from the local catalog.
                    </DialogDescription>
                </DialogHeader>
                <Input
                    placeholder="Filter…"
                    value={goboCatalogFilter}
                    onChange={(e) => setGoboCatalogFilter(e.target.value)}
                    autoComplete="off"
                />
                {goboCatalog === null ? (
                    <p className="text-sm text-muted-foreground">Loading catalog…</p>
                ) : goboCatalogError ? (
                    <p className="text-sm text-destructive">{goboCatalogError}</p>
                ) : goboCatalog.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No catalog entries found.</p>
                ) : (
                    <>
                        <div className="max-h-[min(60vh,520px)] overflow-y-auto rounded-md border p-2">
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                                {goboCatalogShown.map((entry) => (
                                    <button
                                        key={entry.code}
                                        type="button"
                                        className="flex flex-col items-center gap-1 rounded-lg border bg-background p-2 text-left text-xs transition-colors hover:bg-muted/80"
                                        onClick={() => {
                                            if (!goboPickerTarget) {
                                                return;
                                            }
                                            const { channelIdx, slotIdx } = goboPickerTarget;
                                            setChannels((prev) =>
                                                prev.map((c, i) => {
                                                    if (i !== channelIdx) {
                                                        return c;
                                                    }
                                                    const pm = (c.properties ?? {}) as JSONMap;
                                                    const sl = parseEntries(pm);
                                                    const next = [...sl];
                                                    if (!next[slotIdx]) {
                                                        return c;
                                                    }
                                                    next[slotIdx] = {
                                                        ...next[slotIdx],
                                                        goboIdentifier: entry.code,
                                                        goboName: entry.name,
                                                        goboImage: entry.image,
                                                        label: entry.name,
                                                    };
                                                    return {
                                                        ...c,
                                                        properties: {
                                                            ...pm,
                                                            entries: next,
                                                        },
                                                    };
                                                })
                                            );
                                            setGoboPickerTarget(null);
                                        }}
                                    >
                                        <img
                                            src={entry.image}
                                            alt=""
                                            className="size-14 rounded-full object-cover ring-1 ring-border"
                                            loading="lazy"
                                        />
                                        <span className="line-clamp-2 w-full text-center font-mono text-[10px] leading-tight">
                                            {entry.code}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        {goboCatalogFilter === "" && goboCatalog.length > 400 ? (
                            <p className="text-xs text-muted-foreground">
                                Showing the first 400 gobos — type in the filter to narrow the list.
                            </p>
                        ) : null}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
