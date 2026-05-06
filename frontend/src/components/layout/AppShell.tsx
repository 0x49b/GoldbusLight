import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { DetailRoute, WLEDDevice } from "../../types/controller";
import { PiBinoculars, PiArrowsClockwise } from "react-icons/pi";

export type AppShellProps = {
  status: string;
  busy: boolean;
  onDiscoverNow: () => void;
  onRefreshSnapshot: () => void;
  route: DetailRoute;
  setRoute: Dispatch<SetStateAction<DetailRoute>>;
  devices: WLEDDevice[];
  error: string;
  onDismissError: () => void;
  children: ReactNode;
};

export function AppShell({
  status,
  busy,
  onDiscoverNow,
  onRefreshSnapshot,
  route,
  setRoute,
  devices,
  error,
  onDismissError,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen w-full min-w-0 bg-base-100 text-base-content flex flex-col h-screen overflow-hidden">
      <header
        className="border-b border-base-300 px-4 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0"
        style={{ paddingLeft: "100px" }}
      >
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">Goldbus Licht Controller</h1>
          <p className="text-xs opacity-70 mt-0.5 truncate" title={status}>
            {status}
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn btn-sm" onClick={onDiscoverNow} disabled={busy}>
          <PiBinoculars /></button>
          <button className="btn btn-sm" onClick={() => void onRefreshSnapshot()} disabled={busy}>
          <PiArrowsClockwise />
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 shrink-0 border-r border-base-300 flex flex-col bg-base-200/50">
          <div className="p-3 text-xs font-semibold uppercase tracking-wide opacity-50">Devices</div>
          <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            <button
              type="button"
              className={`btn btn-sm w-full justify-start font-normal ${route.kind === "presets" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setRoute({ kind: "presets" })}
            >
              General
            </button>
            {devices.map((dev) => (
              <button
                key={dev.id}
                type="button"
                className={`btn btn-sm w-full justify-start font-normal min-h-10 py-2 ${
                  route.kind === "device" && route.id === dev.id ? "btn-primary" : "btn-ghost"
                }`}
                aria-label={`${dev.name} (${dev.online ? "Online" : "Offline"})`}
                onClick={() => setRoute({ kind: "device", id: dev.id })}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span
                    className={`status status-sm ${dev.online ? "status-success" : "status-neutral"}`}
                    aria-hidden
                  />
                  <span className="truncate">{dev.name}</span>
                </span>
              </button>
            ))}
          </nav>
          <div className="p-2 border-t border-base-300 shrink-0">
            <button
              type="button"
              className={`btn btn-sm w-full ${route.kind === "settings" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setRoute({ kind: "settings" })}
            >
              Settings
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {error && (
            <div className="alert alert-error text-sm py-2 mb-4 flex items-center justify-between gap-3" role="alert">
              <span className="min-w-0 break-words">{error}</span>
              <button type="button" className="btn btn-xs btn-outline shrink-0" onClick={onDismissError}>
                Dismiss
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
