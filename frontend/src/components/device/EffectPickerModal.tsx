import {useEffect, useState} from "react";
import {readNumber} from "../../lib/json";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {cn} from "@/lib/utils";

export type EffectPickerModalProps = {
    open: boolean;
    onClose: () => void;
    effectNames: string[] | undefined;
    selectedIndex: number;
    onPick: (index: number) => void;
    disabled?: boolean;
};

export function EffectPickerModal({
                                      open,
                                      onClose,
                                      effectNames,
                                      selectedIndex,
                                      onPick,
                                      disabled,
                                  }: EffectPickerModalProps) {
    const [manualIdx, setManualIdx] = useState(String(selectedIndex));

    useEffect(() => {
        if (open) {
            setManualIdx(String(selectedIndex));
        }
    }, [open, selectedIndex]);

    const hasList = effectNames && effectNames.length > 0;

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="sm:max-w-5xl">
                <DialogHeader>
                    <DialogTitle className="text-sm">Effect</DialogTitle>
                </DialogHeader>
                {hasList ? (
                    <div
                        className="touch-pan-scroll max-w-full overflow-x-auto overflow-y-hidden rounded-lg border p-2">
                        <div
                            role="listbox"
                            aria-label="Effects"
                            className="inline-block max-h-[min(70dvh,calc(100dvh-14rem))] columns-[10rem] [column-fill:auto] [column-gap:0.625rem] align-top"
                        >
                            {effectNames!.map((name, idx) => (
                                <Button
                                    type="button"
                                    key={idx}
                                    size="xs"
                                    variant={idx === selectedIndex ? "secondary" : "ghost"}
                                    className={cn(
                                        "mb-1 flex h-auto w-full flex-row flex-wrap items-baseline justify-start gap-x-1 gap-y-0 break-inside-avoid px-1.5 py-1.5 text-left font-normal whitespace-normal",
                                        idx === selectedIndex && "font-medium"
                                    )}
                                    disabled={disabled}
                                    onClick={() => {
                                        onPick(idx);
                                        onClose();
                                    }}
                                >
                                    <span
                                        className="shrink-0 font-mono text-[10px] leading-snug opacity-60">
                                        {idx}:
                                    </span>
                                    <span
                                        className="min-w-0 flex-1 break-words text-[11px] leading-snug"
                                        title={name}>
                                        {name}
                                    </span>
                                </Button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="grid gap-1">
                            <Label className="text-xs">Effect index</Label>
                            <Input
                                type="number"
                                min={0}
                                className="h-8 w-32"
                                value={manualIdx}
                                onChange={(e) => setManualIdx(e.target.value)}
                                disabled={disabled}
                            />
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            disabled={disabled}
                            onClick={() => {
                                onPick(readNumber(manualIdx, 0));
                                onClose();
                            }}
                        >
                            Use index
                        </Button>
                    </div>
                )}
                <div className="flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
