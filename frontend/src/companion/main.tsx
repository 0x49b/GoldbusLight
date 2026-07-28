import React from "react";
import ReactDOM from "react-dom/client";
import {ThemeProvider} from "next-themes";
import "../i18n";
import "../index.css";
import {CompanionApp} from "./CompanionApp";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey="goldbus-theme"
        >
            <CompanionApp/>
        </ThemeProvider>
    </React.StrictMode>,
);
