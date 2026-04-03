"use client";

import type { PomodoroPhase } from "@/app/_stores/pomodoroStore";
import { useCurrentPhase } from "@/app/_stores/pomodoroStore";

/** Dark-scheme tints only (ignore system light preference for this backdrop). */
export const PHASE_TINT: Record<PomodoroPhase, string> = {
  work: "rgb(44, 21, 31)",
  shortBreak: "rgb(11, 40, 39)",
  longBreak: "rgb(32, 27, 50)",
};

export function PhaseBackdrop({ children }: { children: React.ReactNode }) {
  const phase = useCurrentPhase();

  return (
    <div
      className="min-h-full"
      data-phase={phase}
      style={{ backgroundColor: PHASE_TINT[phase] }}
    >
      {children}
    </div>
  );
}
