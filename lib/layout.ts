import { useCurrentPhase } from "@/app/_stores/pomodoroStore";

export type PomodoroPhase = "work" | "shortBreak" | "longBreak";

/** Dark-scheme tints only (ignore system light preference for this backdrop). */
const PHASE_TINT: Record<PomodoroPhase, string> = {
  work: "rgb(44, 21, 31)",
  shortBreak: "rgb(11, 40, 39)",
  longBreak: "rgb(32, 27, 50)",
};

export function usePhaseColor(): string {
  const phase = useCurrentPhase();

  if (phase === "work") return "red.9";
  if (phase === "shortBreak") return "green.9";
  return "blue.9";
}

export function usePhaseBackgroundColor(): string {
  const phase = useCurrentPhase();
  return PHASE_TINT[phase];
}
