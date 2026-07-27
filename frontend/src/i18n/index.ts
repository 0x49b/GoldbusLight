import i18n from "i18next";
import {initReactI18next} from "react-i18next";
import {
    applyDocumentLang,
    resolveLocale,
    type ResolvedLocale,
} from "./localePreference";

import enCommon from "../locales/en/common.json";
import enShell from "../locales/en/shell.json";
import enSettings from "../locales/en/settings.json";
import enScenes from "../locales/en/scenes.json";
import enDmx from "../locales/en/dmx.json";
import enWled from "../locales/en/wled.json";
import enParty from "../locales/en/party.json";
import enStatus from "../locales/en/status.json";

import deCommon from "../locales/de/common.json";
import deShell from "../locales/de/shell.json";
import deSettings from "../locales/de/settings.json";
import deScenes from "../locales/de/scenes.json";
import deDmx from "../locales/de/dmx.json";
import deWled from "../locales/de/wled.json";
import deParty from "../locales/de/party.json";
import deStatus from "../locales/de/status.json";

const resources = {
    en: {
        common: enCommon,
        shell: enShell,
        settings: enSettings,
        scenes: enScenes,
        dmx: enDmx,
        wled: enWled,
        party: enParty,
        status: enStatus,
    },
    de: {
        common: deCommon,
        shell: deShell,
        settings: deSettings,
        scenes: deScenes,
        dmx: deDmx,
        wled: deWled,
        party: deParty,
        status: deStatus,
    },
} as const;

void i18n.use(initReactI18next).init({
    resources,
    lng: resolveLocale(),
    fallbackLng: "en",
    supportedLngs: ["en", "de"],
    nonExplicitSupportedLngs: true,
    defaultNS: "common",
    ns: ["common", "shell", "settings", "scenes", "dmx", "wled", "party", "status"],
    interpolation: {
        escapeValue: false,
    },
});

applyDocumentLang(i18n.language as ResolvedLocale);

i18n.on("languageChanged", (lng) => {
    const resolved = (lng === "de" ? "de" : "en") as ResolvedLocale;
    applyDocumentLang(resolved);
});

export default i18n;
