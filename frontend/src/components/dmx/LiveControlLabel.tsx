import type {ReactNode} from "react";
import {useTranslation} from "react-i18next";
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
    const {t} = useTranslation("dmx");
    return (
        <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
            <Label className="truncate">{children}</Label>
            {party && (
                <Badge
                    variant="outline"
                    title={t("liveChannel.includedInParty")}
                >
                    <PartyPopper/>
                </Badge>
            )}
        </div>
    );
}
