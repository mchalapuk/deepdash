"use client";

import {
  css,
  elapsedTime,
  flipClock,
  theme,
} from "flipclock";
import "flipclock/themes/flipclock";
import { useEffect, useRef } from "react";

export type FlipClockJsCountdownProps = {
  /** Epoch milliseconds when the countdown hits zero */
  endsAt: number;
  className?: string;
  /** Passed into FlipClock.js theme CSS (e.g. `2.75rem`) */
  fontSize?: string;
  /** When false, the clock is mounted but not ticking */
  running?: boolean;
};

export function FlipClockJsCountdown({
  endsAt,
  className,
  fontSize = "2.75rem",
  running = true,
}: FlipClockJsCountdownProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;

    const face = elapsedTime({
      to: new Date(endsAt),
      format: "[mm]:[ss]",
    });

    const instance = flipClock({
      face,
      theme: theme({
        dividers: ":",
        css: css({ fontSize }),
      }),
      autoStart: false,
    });

    instance.mount(parent);
    if (running) instance.start();

    return () => {
      instance.stop();
      instance.unmount();
    };
  }, [endsAt, fontSize, running]);

  return <div className={className} ref={parentRef} />;
}
