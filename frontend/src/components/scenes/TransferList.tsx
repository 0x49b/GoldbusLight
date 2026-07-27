import {useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {PiCaretDoubleLeft, PiCaretDoubleRight, PiCaretLeft, PiCaretRight} from "react-icons/pi";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";

export type TransferListItem = {
    id: string;
    label: string;
    hint?: string;
};

type TransferListProps = {
    availableLabel?: string;
    includedLabel?: string;
    items: TransferListItem[];
    includedIds: string[];
    onChange: (nextIncludedIds: string[]) => void;
    disabled?: boolean;
};

export function TransferList({
    availableLabel,
    includedLabel,
    items,
    includedIds,
    onChange,
    disabled,
}: TransferListProps) {
    const {t} = useTranslation("scenes");
    const resolvedAvailableLabel = availableLabel ?? t("transfer.available");
    const resolvedIncludedLabel = includedLabel ?? t("transfer.included");
    const [availableSelected, setAvailableSelected] = useState<string[]>([]);
    const [includedSelected, setIncludedSelected] = useState<string[]>([]);

    const includedSet = useMemo(() => new Set(includedIds), [includedIds]);
    const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

    const available = useMemo(
        () => items.filter((item) => !includedSet.has(item.id)),
        [items, includedSet],
    );
    const included = useMemo(
        () => includedIds.map((id) => byId.get(id)).filter((item): item is TransferListItem => Boolean(item)),
        [includedIds, byId],
    );

    const moveToIncluded = (ids: string[]) => {
        if (ids.length === 0) {
            return;
        }
        const next = [...includedIds];
        for (const id of ids) {
            if (!next.includes(id)) {
                next.push(id);
            }
        }
        onChange(next);
        setAvailableSelected([]);
    };

    const moveToAvailable = (ids: string[]) => {
        if (ids.length === 0) {
            return;
        }
        const remove = new Set(ids);
        onChange(includedIds.filter((id) => !remove.has(id)));
        setIncludedSelected([]);
    };

    return (
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
            <TransferColumn
                label={resolvedAvailableLabel}
                items={available}
                selectedIds={availableSelected}
                onSelect={setAvailableSelected}
                disabled={disabled}
            />
            <div className="flex flex-row justify-center gap-2 md:flex-col md:justify-center">
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled || available.length === 0}
                    onClick={() => moveToIncluded(available.map((item) => item.id))}
                    aria-label={t("transfer.addAllAria")}
                    title={t("transfer.addAll")}
                >
                    <PiCaretDoubleRight className="size-4" aria-hidden />
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled || availableSelected.length === 0}
                    onClick={() => moveToIncluded(availableSelected)}
                    aria-label={t("transfer.addSelectedAria")}
                    title={t("transfer.addSelected")}
                >
                    <PiCaretRight className="size-4" aria-hidden />
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled || includedSelected.length === 0}
                    onClick={() => moveToAvailable(includedSelected)}
                    aria-label={t("transfer.removeSelectedAria")}
                    title={t("transfer.removeSelected")}
                >
                    <PiCaretLeft className="size-4" aria-hidden />
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled || included.length === 0}
                    onClick={() => moveToAvailable(included.map((item) => item.id))}
                    aria-label={t("transfer.removeAllAria")}
                    title={t("transfer.removeAll")}
                >
                    <PiCaretDoubleLeft className="size-4" aria-hidden />
                </Button>
            </div>
            <TransferColumn
                label={resolvedIncludedLabel}
                items={included}
                selectedIds={includedSelected}
                onSelect={setIncludedSelected}
                disabled={disabled}
            />
        </div>
    );
}

function TransferColumn({
    label,
    items,
    selectedIds,
    onSelect,
    disabled,
}: {
    label: string;
    items: TransferListItem[];
    selectedIds: string[];
    onSelect: (ids: string[]) => void;
    disabled?: boolean;
}) {
    const {t} = useTranslation("scenes");
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const allSelected = items.length > 0 && items.every((item) => selectedSet.has(item.id));

    return (
        <div className="flex min-h-40 flex-col rounded-md border bg-card">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground">
                    {t("transfer.countLabel", {label, count: items.length})}
                </span>
                <button
                    type="button"
                    disabled={disabled || items.length === 0}
                    className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-40"
                    onClick={() => {
                        if (allSelected) {
                            onSelect([]);
                        } else {
                            onSelect(items.map((item) => item.id));
                        }
                    }}
                >
                    {allSelected ? t("transfer.clear") : t("transfer.selectAll")}
                </button>
            </div>
            <ul className="max-h-56 flex-1 overflow-auto p-1" role="listbox" aria-label={label} aria-multiselectable>
                {items.length === 0 ? (
                    <li className="px-2 py-3 text-xs text-muted-foreground">{t("transfer.none")}</li>
                ) : (
                    items.map((item) => {
                        const selected = selectedSet.has(item.id);
                        return (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    disabled={disabled}
                                    className={cn(
                                        "flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm",
                                        selected ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                                    )}
                                    aria-selected={selected}
                                    onClick={() => {
                                        if (selected) {
                                            onSelect(selectedIds.filter((id) => id !== item.id));
                                        } else {
                                            onSelect([...selectedIds, item.id]);
                                        }
                                    }}
                                >
                                    <span className="truncate font-medium">{item.label}</span>
                                    {item.hint ? (
                                        <span className="truncate text-xs text-muted-foreground">{item.hint}</span>
                                    ) : null}
                                </button>
                            </li>
                        );
                    })
                )}
            </ul>
        </div>
    );
}
