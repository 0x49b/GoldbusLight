import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select.tsx";
import {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import i18n from "@/i18n";
import {
    getLocalePreference,
    resolveLocale,
    setLocalePreference,
    type LocalePreference,
} from "@/i18n/localePreference";

const LANGUAGE_OPTIONS = [
    {value: "system", labelKey: "language.options.system"},
    {value: "en", labelKey: "language.options.en"},
    {value: "de", labelKey: "language.options.de"},
] as const;

export function LanguageCard() {
    const {t} = useTranslation("settings");
    const [mounted, setMounted] = useState(false);
    const [preference, setPreference] = useState<LocalePreference>("system");

    useEffect(() => {
        setPreference(getLocalePreference());
        setMounted(true);
    }, []);

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle className="text-sm font-semibold">{t("language.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm opacity-70">{t("language.description")}</p>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="language-preference" className="text-sm font-medium">
                        {t("language.label")}
                    </label>
                    <Select
                        value={mounted ? preference : undefined}
                        onValueChange={(value) => {
                            if (value !== "system" && value !== "en" && value !== "de") {
                                return;
                            }
                            const next = value as LocalePreference;
                            setPreference(next);
                            setLocalePreference(next);
                            void i18n.changeLanguage(resolveLocale(next));
                        }}
                        disabled={!mounted}
                    >
                        <SelectTrigger id="language-preference" className="w-56">
                            <SelectValue placeholder={t("language.placeholder")}/>
                        </SelectTrigger>
                        <SelectContent>
                            {LANGUAGE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {t(option.labelKey)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
}
