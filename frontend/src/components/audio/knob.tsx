"use client";

import { Knob as KnobPrimitive } from "@audio-ui/react";
import { cn } from "@/lib/utils";

type KnobProps = KnobPrimitive.RootProps & {
  className?: string;
};

export function Knob({ className, children, ...props }: KnobProps) {
  return (
    <KnobPrimitive.Root
      className={cn("relative inline-flex touch-none select-none", className)}
      {...props}
    >
      {children ?? (
        <KnobPrimitive.Slider className="relative flex size-full items-center justify-center">
          <KnobPrimitive.Body className="absolute inset-[12%] rounded-full bg-input/80 shadow-inner ring-1 ring-black/10 dark:ring-white/10" />
          <KnobPrimitive.Arc
            className="text-primary [&_path]:stroke-current"
            strokeWidth={3}
          />
          <KnobPrimitive.Indicator className="text-foreground [&_line]:stroke-current" strokeWidth={2.5} />
        </KnobPrimitive.Slider>
      )}
    </KnobPrimitive.Root>
  );
}
