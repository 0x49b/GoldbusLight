import {useEffect, useState} from "react";
import {readNumber} from "../../lib/json";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Effect</DialogTitle>
                </DialogHeader>
                {hasList ? (
                    <ScrollArea className="max-h-[60vh] rounded-lg border p-2">
                        <div className="space-y-1">
                            {effectNames!.map((name, idx) => (
                                <Button
                                    type="button"
                                    key={idx}
                                    variant={idx === selectedIndex ? "secondary" : "ghost"}
                                    className={cn("w-full justify-start gap-2", idx === selectedIndex && "font-medium")}
                                    disabled={disabled}
                                    onClick={() => {
                                        onPick(idx);
                                        onClose();
                                    }}
                                >
                                    <span className="shrink-0 font-mono text-xs opacity-60">{idx}</span>
                                    <span className="truncate">{name}</span>
                                </Button>
                            ))}
                        </div>
                    </ScrollArea>
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
