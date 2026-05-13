"use client";

import { XYPad as XYPadPrimitive } from "@audio-ui/react";
import { cn } from "@/lib/utils";

type XYPadProps = XYPadPrimitive.RootProps & {
  className?: string;
};

export function XYPad({ className, children, ...props }: XYPadProps) {
  return (
    <XYPadPrimitive.Root
      className={cn("flex flex-col gap-1", className)}
      {...props}
    >
      {children ?? (
        <XYPadPrimitive.Slider
          className={cn(
            "relative aspect-square w-full min-h-[10rem] max-h-[14rem] overflow-hidden rounded-full",
            "border border-border bg-muted/50 shadow-inner outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring/60",
          )}
        >
          <XYPadPrimitive.Grid className="pointer-events-none absolute inset-0 opacity-40">
            <XYPadPrimitive.GridLine orientation="vertical" position={0.5} className="bg-border" />
            <XYPadPrimitive.GridLine orientation="horizontal" position={0.5} className="bg-border" />
            <XYPadPrimitive.GridLine orientation="vertical" position={0.25} className="bg-border/60" />
            <XYPadPrimitive.GridLine orientation="vertical" position={0.75} className="bg-border/60" />
            <XYPadPrimitive.GridLine orientation="horizontal" position={0.25} className="bg-border/60" />
            <XYPadPrimitive.GridLine orientation="horizontal" position={0.75} className="bg-border/60" />
          </XYPadPrimitive.Grid>
          <XYPadPrimitive.Crosshair orientation="vertical" className="bg-border" />
          <XYPadPrimitive.Crosshair orientation="horizontal" className="bg-border" />
          <XYPadPrimitive.Cursor className="size-4">
            <XYPadPrimitive.CursorGlow className="bg-primary/40" />
            <XYPadPrimitive.CursorDot className="bg-primary shadow-md ring-2 ring-background" />
          </XYPadPrimitive.Cursor>
        </XYPadPrimitive.Slider>
      )}
    </XYPadPrimitive.Root>
  );
}
