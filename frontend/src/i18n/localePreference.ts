export const LOCALE_STORAGE_KEY = "goldbus-locale";

export type LocalePreference = "system" | "en" | "de";
export type ResolvedLocale = "en" | "de";

export const SUPPORTED_LOCALES: readonly ResolvedLocale[] = ["en", "de"] as const;

export function isLocalePreference(value: string | null | undefined): value is LocalePreference {
    return value === "system" || value === "en" || value === "de";
}

export function getLocalePreference(): LocalePreference {
    try {
        const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
        if (isLocalePreference(raw)) {
            return raw;
        }
    } catch {
        // ignore storage access errors
    }
    return "system";
}

export function setLocalePreference(preference: LocalePreference): void {
    try {
        localStorage.setItem(LOCALE_STORAGE_KEY, preference);
    } catch {
        // ignore storage access errors
    }
}

export function detectSystemLocale(
    languages: readonly string[] = typeof navigator !== "undefined"
        ? navigator.languages?.length
            ? navigator.languages
            : [navigator.language]
        : ["en"],
): ResolvedLocale {
    for (const language of languages) {
        const normalized = language.trim().toLowerCase();
        if (normalized === "de" || normalized.startsWith("de-")) {
            return "de";
        }
    }
    return "en";
}

export function resolveLocale(preference: LocalePreference = getLocalePreference()): ResolvedLocale {
    if (preference === "en" || preference === "de") {
        return preference;
    }
    return detectSystemLocale();
}

export function applyDocumentLang(locale: ResolvedLocale): void {
    if (typeof document !== "undefined") {
        document.documentElement.lang = locale;
    }
}
