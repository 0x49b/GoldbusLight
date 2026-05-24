import type {ReactNode} from "react";
import {Badge} from "@/components/ui/badge";
import {Label} from "@/components/ui/label";
import {cn} from "@/lib/utils";

type LiveControlLabelProps = {
    children: ReactNode;
    party?: boolean;
    className?: string;
};

export function LiveControlLabel({children, party = false, className}: LiveControlLabelProps) {
    return (
        <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
            <Label className="truncate">{children}</Label>
            {party && (
                <Badge
                    variant="outline"
                    className="h-4 shrink-0 border-violet-500/40 bg-violet-500/10 px-1.5 text-[10px] font-medium text-violet-700 dark:text-violet-300"
                    title="Included in party mode"
                >
                    Party
                </Badge>
            )}
        </div>
    );
}
