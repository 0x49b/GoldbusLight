import {cn} from "@/lib/utils";
import {Badge} from "@/components/ui/badge"

type DMXOutputIndicatorProps = {
    connected: boolean;
    className?: string;
};

/** Read-only indicator: whether the app is currently sending DMX to an attached interface. */
export function DMXOutputIndicator({connected, className}: DMXOutputIndicatorProps) {

    let classNames = connected ?
        cn("pointer-events-none bg-green-500/10 border-green-700 text-green-950", className) :
        cn("pointer-events-none bg-rose-500/10 border-rose-700 text-rose-950", className)

    /*
    * variant={connected ? "destructive" : "secondary"}
    * {cn("pointer-events-none shrink-0 opacity-100", className)}
    * */

    return (
        <Badge
            variant="outline"
            className={classNames}
            aria-disabled="true"
        >
            DMX
        </Badge>
    );
}
