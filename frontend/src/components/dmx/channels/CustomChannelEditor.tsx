import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ChannelEditorProps } from "./ChannelBase";
import { DefaultChannelEditor } from "./DefaultChannelEditor";

export function CustomChannelEditor(props: ChannelEditorProps) {
    const { originalIdx, propsMap, updateChannelAt, slotMode } = props;
    const { t } = useTranslation("dmx");
    return (
        <div className="mt-2 space-y-2">
            <div className="grid max-w-md gap-1">
                <Label className="text-xs">{t("channelEditor.channelName")}</Label>
                <Input
                    placeholder={t("channelEditor.channelNamePlaceholder")}
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
            {slotMode && (
                <DefaultChannelEditor {...props} />
            )}
        </div>
    );
}
