"use client";

/**
 * @author: @dorianbaffier
 * @description: Rain Glass Background
 * @version: 1.0.0
 * @date: 2026-10-22
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { RainGlassController } from "./rain-glass-controller";

export interface RainGlassBackgroundProps {
  /** The view behind the window. Served with CORS so WebGL can read it. */
  src?: string;
  title?: ReactNode;
  /** Content under the headline. */
  children?: ReactNode;
  /** How hard it rains, from 0 (a few drops) to 1 (a downpour). */
  rain?: number;
  /** Set false for a window you can't wipe. */
  interactive?: boolean;
  className?: string;
}

const DEFAULT_SRC =
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1800&q=80&auto=format&fit=crop";

export default function RainGlassBackground({
  src = DEFAULT_SRC,
  title = "Stay in when it rains.",
  children,
  rain = 0.6,
  interactive = true,
  className,
}: RainGlassBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fogRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const fogElement = fogRef.current;
    if (!(root && canvas && fogElement)) return;

    const controller = new RainGlassController({ root, canvas, fogElement, src, rain, interactive });
    controller.mount();
    return () => controller.destroy();
  }, [src, rain, interactive]);

  return (
    <div
      className={cn(
        "relative min-h-[560px] w-full touch-pan-y select-none overflow-hidden bg-zinc-900 text-zinc-50",
        className
      )}
      style={{
        backgroundImage: `linear-gradient(rgba(12, 17, 22, 0.35), rgba(12, 17, 22, 0.55)), url("${src}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      ref={rootRef}
    >
      <span className="hidden text-[#1a2025]" ref={fogRef} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas
          className="h-full w-full opacity-0 transition-opacity duration-700 ease-out"
          ref={canvasRef}
        />
      </div>
      <div className="relative flex min-h-[560px] flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <h1 className="max-w-3xl text-balance font-serif text-5xl font-semibold tracking-[-0.045em] sm:text-7xl">
          {title}
        </h1>
        {children === undefined ? <DefaultContent /> : children}
      </div>
    </div>
  );
}

function DefaultContent() {
  return (
    <>
      <p className="max-w-md text-balance text-base text-zinc-700 leading-relaxed dark:text-zinc-300">
        Cabins two hours from the city, with a wood stove, a deep bath and no signal. Wipe the glass to look outside.
      </p>
      <div className="flex items-center gap-2">
        <a
          className="inline-flex h-10 items-center rounded-full bg-zinc-900 px-5 font-medium text-sm text-white transition-colors duration-150 hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          href="#book"
        >
          Find a weekend
        </a>
        <a
          className="inline-flex h-10 items-center rounded-full px-4 font-medium text-sm text-zinc-700 transition-colors duration-150 hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-zinc-50"
          href="#cabins"
        >
          See the cabins
        </a>
      </div>
    </>
  );
}
