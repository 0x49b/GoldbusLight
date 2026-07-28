"use client"

import * as React from "react"
import {Switch as SwitchPrimitive} from "radix-ui"

import {cn} from "@/lib/utils"

function Switch({
                    className,
                    size = "default",
                    ...props
                }: React.ComponentProps<typeof SwitchPrimitive.Root> & {
    size?: "sm" | "default"
}) {
    return (
        <SwitchPrimitive.Root
            data-slot="switch"
            data-size={size}
            className={cn(
                "peer group/switch relative inline-flex shrink-0 items-center rounded-full border-2 border-transparent transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-[22px] data-[size=default]:w-[40px] data-[size=sm]:h-[16px] data-[size=sm]:w-[28px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50",
                className
            )}
            {...props}
        >
            <SwitchPrimitive.Thumb
                data-slot="switch-thumb"
                className={cn(
                    "pointer-events-none block shrink-0 rounded-full bg-background ring-0 transition-transform",
                    "group-data-[size=default]/switch:size-[18px] group-data-[size=sm]/switch:size-3",
                    "data-[state=unchecked]:translate-x-0",
                    "group-data-[size=default]/switch:data-[state=checked]:translate-x-[18px]",
                    "group-data-[size=sm]/switch:data-[state=checked]:translate-x-3",
                    "dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"
                )}
            />
        </SwitchPrimitive.Root>
    )
}

export {Switch}
