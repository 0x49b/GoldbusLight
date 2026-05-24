import * as GreetService from "../../bindings/goldbus/internal/service/goldbuslightservice";
import {
    type LiveLayoutDocument,
    parseLiveLayoutDocument,
    serializeLiveLayoutDocument,
} from "./dmxFixtureLiveLayout";

const LS_KEY = "goldbus.dmxFixtureLiveLayouts.v1";

type LocalStore = {
    version: 1;
    /** fixtureId -> layout JSON string */
    layouts: Record<string, string>;
};

function readLocalStore(): LocalStore {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) {
            return { version: 1, layouts: {} };
        }
        const j = JSON.parse(raw) as LocalStore;
        if (!j || j.version !== 1 || typeof j.layouts !== "object" || !j.layouts) {
            return { version: 1, layouts: {} };
        }
        return j;
    } catch {
        return { version: 1, layouts: {} };
    }
}

function writeLocalStore(store: LocalStore) {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
}

function goService(): Record<string, (...args: never[]) => Promise<unknown>> {
    return GreetService as unknown as Record<string, (...args: never[]) => Promise<unknown>>;
}

async function tryGoGet(fixtureId: string): Promise<string | null> {
    const fn = goService()["GetDMXFixtureLiveLayoutJSON"];
    if (typeof fn !== "function") {
        return null;
    }
    try {
        return (await fn(fixtureId as never)) as string;
    } catch {
        return null;
    }
}

async function tryGoSet(fixtureId: string, json: string): Promise<boolean> {
    const fn = goService()["SetDMXFixtureLiveLayoutJSON"];
    if (typeof fn !== "function") {
        return false;
    }
    try {
        await fn(fixtureId as never, json as never);
        return true;
    } catch {
        return false;
    }
}

export async function loadFixtureLiveLayoutDocument(fixtureId: string): Promise<LiveLayoutDocument | null> {
    const goRaw = await tryGoGet(fixtureId);
    if (goRaw != null && goRaw.trim() !== "" && goRaw.trim() !== "{}") {
        return parseLiveLayoutDocument(goRaw);
    }
    const st = readLocalStore();
    const raw = st.layouts[fixtureId];
    if (!raw || raw.trim() === "" || raw.trim() === "{}") {
        return null;
    }
    return parseLiveLayoutDocument(raw);
}

export async function saveFixtureLiveLayoutDocument(fixtureId: string, doc: LiveLayoutDocument): Promise<void> {
    const json = serializeLiveLayoutDocument(doc);
    if (await tryGoSet(fixtureId, json)) {
        return;
    }
    const st = readLocalStore();
    st.layouts[fixtureId] = json;
    writeLocalStore(st);
}
