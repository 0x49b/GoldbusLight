import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select.tsx";
import {useTheme} from "next-themes";
import {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";

const COLOR_MODES = [
    {value: "system", labelKey: "appearance.modes.system"},
    {value: "light", labelKey: "appearance.modes.light"},
    {value: "dark", labelKey: "appearance.modes.dark"},
] as const;

export function AppearanceCard() {
    const {t} = useTranslation("settings");
    const {theme, setTheme} = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle className="text-sm font-semibold">{t("appearance.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm opacity-70">{t("appearance.description")}</p>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="color-mode" className="text-sm font-medium">
                        {t("appearance.colorMode")}
                    </label>
                    <Select
                        value={mounted ? (theme ?? "system") : undefined}
                        onValueChange={(value) => {
                            if (value) {
                                setTheme(value);
                            }
                        }}
                        disabled={!mounted}
                    >
                        <SelectTrigger id="color-mode" className="w-56">
                            <SelectValue placeholder={t("appearance.placeholder")}/>
                        </SelectTrigger>
                        <SelectContent>
                            {COLOR_MODES.map((mode) => (
                                <SelectItem key={mode.value} value={mode.value}>
                                    {t(mode.labelKey)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
}
