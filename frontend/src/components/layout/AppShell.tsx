import type {Dispatch, ReactNode, SetStateAction} from "react";
import {
    PiArrowsClockwise,
    PiBinoculars,
    PiGearSix,
    PiLightbulb,
    PiPlus,
    PiSquaresFour,
} from "react-icons/pi";
import type {DMXFixture, DetailRoute, WLEDDevice} from "../../types/controller";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupAction,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
} from "@/components/ui/sidebar";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";

export type AppShellProps = {
    status: string;
    busy: boolean;
    onDiscoverNow: () => void;
    onRefreshSnapshot: () => void;
    route: DetailRoute;
    setRoute: Dispatch<SetStateAction<DetailRoute>>;
    devices: WLEDDevice[];
    dmxFixtures: DMXFixture[];
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
                             dmxFixtures,
                             error,
                             onDismissError,
                             children,
                         }: AppShellProps) {
    return (

        <SidebarProvider>
            <Sidebar collapsible="offcanvas">
                <SidebarHeader>
                    Goldbus Licht Controller
                    <p className="text-xs opacity-70 truncate" title={status}>
                        {status}
                    </p>
                </SidebarHeader>
                <SidebarContent>
                    <SidebarGroup>
                        <SidebarGroupLabel>WLED Devices</SidebarGroupLabel>
                        <SidebarMenu>
                            <SidebarMenuItem className="mb-2">
                                <SidebarMenuButton
                                    type="button"
                                    isActive={route.kind === "presets"}
                                    className={cn(
                                        route.kind === "presets" &&
                                        "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring font-semibold"
                                    )}
                                    onClick={() => setRoute({kind: "presets"})}
                                >
                                    <PiSquaresFour className="size-4 shrink-0" aria-hidden/>
                                    <span className="min-w-0 flex-1 truncate">General</span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                            {devices.map((dev) => (
                                <SidebarMenuItem key={dev.id} className="mb-2">
                                    <SidebarMenuButton
                                        type="button"
                                        isActive={route.kind === "device" && route.id === dev.id}
                                        className={cn(
                                            route.kind === "device" &&
                                            route.id === dev.id &&
                                            "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring font-semibold"
                                        )}

                                        aria-label={`${dev.name} (${dev.online ? "Online" : "Offline"})`}
                                        onClick={() => setRoute({kind: "device", id: dev.id})}
                                    >
                                        <PiLightbulb className="size-4 shrink-0" aria-hidden/>
                                        <span className="min-w-0 flex-1 truncate">{dev.name}</span>
                                        <span
                                            className={cn(
                                                "status status-sm shrink-0",
                                                dev.online ? "status-success" : "status-neutral"
                                            )}
                                            aria-hidden
                                        />
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroup>
                    <SidebarGroup>
                        <SidebarGroupLabel>DMX Devices</SidebarGroupLabel>
                        <SidebarGroupAction
                            type="button"
                            aria-label="Add new DMX device"
                            title="Add new DMX device"
                            onClick={() => setRoute({kind: "dmxAddFixture"})}
                            className={cn(
                                route.kind === "dmxAddFixture" &&
                                "bg-sidebar-accent text-sidebar-accent-foreground"
                            )}
                        >
                            <PiPlus aria-hidden/>
                        </SidebarGroupAction>
                        <SidebarMenu>
                            {dmxFixtures.map((fixture) => (
                                <SidebarMenuItem key={fixture.id} className="mb-2">
                                    <SidebarMenuButton
                                        type="button"
                                        isActive={route.kind === "dmxFixture" && route.id === fixture.id}
                                        className={cn(
                                            route.kind === "dmxFixture" &&
                                            route.id === fixture.id &&
                                            "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring font-semibold"
                                        )}
                                        onClick={() => setRoute({kind: "dmxFixture", id: fixture.id})}
                                    >
                                        <PiLightbulb className="size-4 shrink-0" aria-hidden/>
                                        <span className="min-w-0 flex-1 truncate">{fixture.name}</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroup>
                </SidebarContent>

                <SidebarFooter>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                type="button"
                                isActive={route.kind === "settings"}
                                className={cn(
                                    route.kind === "settings" &&
                                    "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring font-semibold"
                                )}

                                onClick={() => setRoute({kind: "settings"})}
                            >
                                <PiGearSix className="size-4 shrink-0" aria-hidden/>
                                <span className="min-w-0 flex-1 truncate">Settings</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarFooter>
            </Sidebar>

            <SidebarInset className="min-h-screen min-w-0">
                <header
                    className="shrink-0 border-b px-4 py-3 flex flex-wrap items-center justify-between gap-2 min-w-0">

                    <div className="flex flex-row gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onDiscoverNow}
                            disabled={busy}
                            className="basis-24"
                        >
                            <PiBinoculars/>
                            Discover
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="basis-24"
                            onClick={() => void onRefreshSnapshot()}
                            disabled={busy}
                        >
                            <PiArrowsClockwise/>
                            Refresh
                        </Button>
                    </div>
                </header>

                <main className="touch-pan-scroll flex-1 min-w-0 overflow-y-auto overflow-x-auto p-4 md:p-6">
                    {error && (
                        <Alert
                            variant="destructive"
                            className="mb-4 flex items-center justify-between gap-3 py-2 text-sm"
                            role="alert"
                        >
                            <AlertDescription className="min-w-0 break-words">
                                {error}
                            </AlertDescription>
                            <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                className="shrink-0"
                                onClick={onDismissError}
                            >
                                Dismiss
                            </Button>
                        </Alert>
                    )}
                    {children}
                </main>
            </SidebarInset>
        </SidebarProvider>

    );
}
