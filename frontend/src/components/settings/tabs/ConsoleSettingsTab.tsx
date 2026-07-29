import type {ConsoleEntry} from "@/types/controller.ts";
import {TransportConsolePanel} from "./TransportConsolePanel.tsx";

export type ConsoleSettingsTabProps = {
    entries: ConsoleEntry[];
    onClear: () => void;
    onToggleDetach: () => void;
};

export function ConsoleSettingsTab({
    entries,
    onClear,
    onToggleDetach,
}: Readonly<ConsoleSettingsTabProps>) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <TransportConsolePanel
                entries={entries}
                onClear={onClear}
                onToggleDetach={onToggleDetach}
                detached={false}
            />
        </div>
    );
}
