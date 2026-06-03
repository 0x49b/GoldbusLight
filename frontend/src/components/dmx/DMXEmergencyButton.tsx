import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {OctagonAlert} from "lucide-react";

type DMXEmergencyButtonProps = {
    busy?: boolean;
    className?: string;
    onEmergency: () => void | Promise<void>;
};

export function DMXEmergencyButton({busy, className, onEmergency}: DMXEmergencyButtonProps) {
    return (
        <Button
            type="button"
            variant="destructive"
            size="sm"
            className={cn("shrink-0", className)}
            disabled={busy}
            title="Stop party mode, blackout all DMX channels, and stop live output"
            onClick={() => void onEmergency()}
        >
            <OctagonAlert className="size-4" aria-hidden/>
            In case of emergency
        </Button>
    );
}
