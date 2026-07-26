import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";

type DMXOutputIndicatorProps = {
    connected: boolean;
    className?: string;
};

/** Read-only indicator: whether the app is currently sending DMX to an attached interface. */
export function DMXOutputIndicator({connected, className}: DMXOutputIndicatorProps) {
    return (
        <Button
            type="button"
            variant={connected ? "destructive" : "secondary"}
            size="sm"
            className={cn("pointer-events-none shrink-0 opacity-100", className)}
            disabled
            aria-disabled="true"
            title={
                connected
                    ? "DMX packets are being sent to the attached interface"
                    : "DMX is not sending — enable DMX and select a USB or Art-Net interface in Settings"
            }
        >
            DMX Output - {connected ? "ON" : "OFF"}
        </Button>
    );
}
