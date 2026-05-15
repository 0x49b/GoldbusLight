import type {Dispatch, ReactNode, SetStateAction} from "react";
import {
    PiGearSix,
    PiLightbulb,
    PiPlanet,
    PiPlus,
    PiSquaresFour,
} from "react-icons/pi";
import type {DetailRoute, DMXFixture, WLEDDevice} from "../../types/controller";
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
    route: DetailRoute;
    setRoute: Dispatch<SetStateAction<DetailRoute>>;
    devices: WLEDDevice[];
    dmxFixtures: DMXFixture[];
    wledEnabled: boolean;
    dmxEnabled: boolean;
    error: string;
    onDismissError: () => void;
    children: ReactNode;
};


export function AppShell({
                             status,
                             route,
                             setRoute,
                             devices,
                             dmxFixtures,
                             wledEnabled,
                             dmxEnabled,
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

                    {wledEnabled && (
                        <>
                            <div className="px-2 pt-2">
                                <span
                                    className="text-xs font-semibold tracking-wide text-sidebar-foreground/90">
                                    WLED
                                </span>
                            </div>
                            <SidebarGroup>
                                <SidebarMenu>
                                    <SidebarMenuItem>
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
                                </SidebarMenu>
                            </SidebarGroup>

                            <SidebarGroup>
                                <SidebarGroupLabel>Devices</SidebarGroupLabel>
                                <SidebarMenu>
                                    {devices.map((dev) => (
                                        <SidebarMenuItem key={dev.id} className="mb-2">
                                            <SidebarMenuButton
                                                type="button"
                                                disabled={!dev.online}
                                                title={
                                                    dev.online
                                                        ? undefined
                                                        : "Offline — use Discover or Refresh on the WLED settings tab. When the device is reachable again, you can open its page."
                                                }
                                                isActive={route.kind === "device" && route.id === dev.id}
                                                className={cn(
                                                    route.kind === "device" &&
                                                    route.id === dev.id &&
                                                    "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring font-semibold",
                                                    !dev.online && "opacity-60 cursor-not-allowed",
                                                )}
                                                aria-label={
                                                    dev.online
                                                        ? `${dev.name} (online)`
                                                        : `${dev.name} (offline, unavailable until refreshed)`
                                                }
                                                onClick={() => {
                                                    if (!dev.online) {
                                                        return;
                                                    }
                                                    setRoute({kind: "device", id: dev.id});
                                                }}
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
                        </>
                    )}

                    {dmxEnabled && (
                        <>
                            <div className="px-2 pt-2">
                                <span
                                    className="text-xs font-semibold tracking-wide text-sidebar-foreground/90">
                                    DMX
                                </span>
                            </div>

                            <SidebarGroup className="py-1">
                                <SidebarGroupLabel>Universe</SidebarGroupLabel>
                                <SidebarMenu>
                                    <SidebarMenuItem className="mb-2">
                                        <SidebarMenuButton
                                            type="button"
                                            isActive={route.kind === "dmxUniverse"}
                                            className={cn(
                                                route.kind === "dmxUniverse" &&
                                                "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring font-semibold"
                                            )}
                                            onClick={() => setRoute({kind: "dmxUniverse"})}
                                        >
                                            <PiPlanet className="size-4 shrink-0" aria-hidden/>
                                            <span className="min-w-0 flex-1 truncate">Universe</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                </SidebarMenu>
                            </SidebarGroup>

                            <SidebarGroup>
                                <SidebarGroupLabel>DMX Devices</SidebarGroupLabel>
                                <SidebarGroupAction
                                    type="button"
                                    aria-label="Create new DMX device"
                                    title="Create new DMX device"
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
                                                onClick={() => setRoute({
                                                    kind: "dmxFixture",
                                                    id: fixture.id
                                                })}
                                            >
                                                <PiLightbulb className="size-4 shrink-0" aria-hidden/>
                                                <span
                                                    className="min-w-0 flex-1 truncate">{fixture.name}</span>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    ))}
                                </SidebarMenu>
                            </SidebarGroup>
                        </>
                    )}
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
                <main
                    className="touch-pan-scroll flex-1 min-w-0 overflow-y-auto overflow-x-auto p-4 md:p-6">
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
