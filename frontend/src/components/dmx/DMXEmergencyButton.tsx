import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {OctagonAlert} from "lucide-react";
import {useTranslation} from "react-i18next";

type DMXEmergencyButtonProps = {
    busy?: boolean;
    className?: string;
    onEmergency: () => void | Promise<void>;
};

export function DMXEmergencyButton({busy, className, onEmergency}: DMXEmergencyButtonProps) {
    const {t} = useTranslation("dmx");
    return (
        <Button
            type="button"
            variant="destructive"
            size="sm"
            className={cn("shrink-0", className)}
            disabled={busy}
            title={t("emergency.tooltip")}
            onClick={() => void onEmergency()}
        >
            <OctagonAlert className="size-4" aria-hidden/>
            {t("emergency.blackout")}
        </Button>
    );
}
