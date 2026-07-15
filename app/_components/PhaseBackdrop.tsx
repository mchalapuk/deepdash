"use client";

import { usePhaseBackgroundColor } from "@/app/lib/pomodoroLayout";

export function PhaseBackdrop({ children }: { children: React.ReactNode }) {
  const backgroundColor = usePhaseBackgroundColor();

  return (
    <div
      className="h-[100dvh] overflow-hidden"
      style={{ backgroundColor }}
    >
      {children}
    </div>
  );
}
