import { useCurrentPhase } from "@/app/_stores/pomodoroStore";

export type PomodoroPhase = "work" | "shortBreak" | "longBreak";

/** Mantine palette token for primary filled / light actions tied to the current pomodoro phase. */
export function getColorFromPhase(phase: PomodoroPhase): string {
  if (phase === "work") return "red.9";
  if (phase === "shortBreak") return "green.9";
  return "blue.9";
}

export function usePhaseColor(): string {
  const phase = useCurrentPhase();
  return getColorFromPhase(phase);
}
