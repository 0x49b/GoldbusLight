import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ChannelEditorProps } from "./ChannelBase";

export function CustomChannelEditor({
    originalIdx,
    propsMap,
    updateChannelAt,
}: ChannelEditorProps) {
    return (
        <div className="mt-2 max-w-md space-y-2">
            <div className="grid gap-1">
                <Label className="text-xs">Channel name</Label>
                <Input
                    placeholder="e.g. Red"
                    value={typeof propsMap.label === "string" ? propsMap.label : ""}
                    onChange={(e) => {
                        updateChannelAt(originalIdx, {
                            properties: {
                                ...propsMap,
                                label: e.target.value,
                            },
                        });
                    }}
                />
            </div>
        </div>
    );
}
