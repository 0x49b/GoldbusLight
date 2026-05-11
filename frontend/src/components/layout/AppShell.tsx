import type { Dispatch, ReactNode, SetStateAction } from "react";
import { PiArrowsClockwise, PiBinoculars } from "react-icons/pi";
import type { DetailRoute, WLEDDevice } from "../../types/controller";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

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
    <div className="flex h-screen min-h-screen w-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <header
        className="shrink-0 border-b px-4 py-3 flex flex-wrap items-center justify-between gap-2"
        style={{ paddingLeft: "100px" }}
      >
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">Goldbus Licht Controller</h1>
          <p className="text-xs opacity-70 mt-0.5 truncate" title={status}>
            {status}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="inline-flex items-center gap-2 whitespace-nowrap shrink-0" onClick={onDiscoverNow} disabled={busy}>
          <PiBinoculars />
          Discover
          </Button>
          <Button size="sm" variant="outline" className="inline-flex items-center gap-2 whitespace-nowrap shrink-0" onClick={() => void onRefreshSnapshot()} disabled={busy}>
          <PiArrowsClockwise />
          Refresh
          </Button>
        </div>

      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 shrink-0 border-r flex flex-col bg-muted/30">
          <div className="p-3 text-xs font-semibold uppercase tracking-wide opacity-50">Devices</div>
          <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            <Button
              type="button"
              size="sm"
              variant={route.kind === "presets" ? "default" : "ghost"}
              className="w-full justify-start font-normal"
              onClick={() => setRoute({ kind: "presets" })}
            >
              General
            </Button>
            {devices.map((dev) => (
              <Button
                key={dev.id}
                type="button"
                size="sm"
                variant={route.kind === "device" && route.id === dev.id ? "default" : "ghost"}
                className="w-full justify-start font-normal min-h-10 py-2"
                aria-label={`${dev.name} (${dev.online ? "Online" : "Offline"})`}
                onClick={() => setRoute({ kind: "device", id: dev.id })}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className={cn("status status-sm", dev.online ? "status-success" : "status-neutral")} aria-hidden />
                  <span className="truncate">{dev.name}</span>
                </span>
              </Button>
            ))}
          </nav>
          <div className="p-2 border-t shrink-0">
            <Button
              type="button"
              size="sm"
              variant={route.kind === "settings" ? "default" : "outline"}
              className="w-full"
              onClick={() => setRoute({ kind: "settings" })}
            >
              Settings
            </Button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {error && (
            <Alert variant="destructive" className="mb-4 flex items-center justify-between gap-3 py-2 text-sm" role="alert">
              <AlertDescription className="min-w-0 break-words">{error}</AlertDescription>
              <Button type="button" size="xs" variant="outline" className="shrink-0" onClick={onDismissError}>
                Dismiss
              </Button>
            </Alert>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
