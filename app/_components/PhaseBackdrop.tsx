"use client";

import { usePhaseBackgroundColor } from "@/lib/layout";

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
