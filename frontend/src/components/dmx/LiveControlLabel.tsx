import type {ReactNode} from "react";
import {Badge} from "@/components/ui/badge";
import {Label} from "@/components/ui/label";
import {cn} from "@/lib/utils";
import {PartyPopper} from "lucide-react";

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
                    title="Included in party mode"
                >
                    <PartyPopper/>
                </Badge>
            )}
        </div>
    );
}
