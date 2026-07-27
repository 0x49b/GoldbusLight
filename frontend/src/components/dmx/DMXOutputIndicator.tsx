import {cn} from "@/lib/utils";
import {Badge} from "@/components/ui/badge"

type DMXOutputIndicatorProps = {
    connected: boolean;
    className?: string;
};

/** Read-only indicator: whether the app is currently sending DMX to an attached interface. */
export function DMXOutputIndicator({connected, className}: Readonly<DMXOutputIndicatorProps>) {

    const baseClassNames = "pointer-events-none pt-1"
    const classNames = connected
        ? cn(baseClassNames, "bg-green-500/10 border-green-700 text-green-950 dark:border-green-500 dark:text-green-300", className)
        : cn(baseClassNames, "bg-rose-500/10 border-rose-700 text-rose-950 dark:border-rose-500 dark:text-rose-300", className)

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
