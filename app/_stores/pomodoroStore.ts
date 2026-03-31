import { proxy } from "valtio";

export type PomodoroPhase = "work" | "shortBreak" | "longBreak";

const DEFAULT_WORK_MS = 25 * 60 * 1000;

export const pomodoroStore = proxy({
  phase: "work" as PomodoroPhase,
  /** `Date.now()` when the countdown was last started or resumed; null while paused or idle */
  timeStarted: null as number | null,
  /** `Date.now()` when the user paused; null while the countdown is running */
  timePaused: null as number | null,
  /**
   * Milliseconds left in the current phase at `timeStarted` (start of this run).
   * Deadline while running: `timeStarted + remainingMs`. Updated when pausing or skipping.
   */
  remainingMs: DEFAULT_WORK_MS,
});
