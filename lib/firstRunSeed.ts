import { localDayKey } from "@/app/_stores/pomodoroStore";
import {
  applyDeepdashImportWithRollback,
  CURRENT_DEEPDASH_EXPORT_VERSION,
  type DeepdashExportLatest,
} from "@/lib/dataExport";
import log from "@/lib/logger";
import {
  CALCULATOR_STORAGE_KEY,
  FIRST_RUN_SEED_HANDLED_KEY,
  migrateLegacyPersistKeysOnce,
  POMODORO_CONFIG_KEY,
  POMODORO_LOGS_KEY,
  TODO_AUTO_ROLLOVER_MARKER_PREFIX,
  TODO_DAY_STORAGE_KEY_PREFIX,
  WORLD_CLOCK_STORAGE_KEY,
} from "@/lib/persistKeys";

/**
 * Demo bundle for a blank browser profile. Pomodoro uses defaults (empty slice migrates to defaults).
 * Today’s todo bucket uses {@link localDayKey} at build time.
 */
export function buildFirstRunSeedBundle(): DeepdashExportLatest {
  const day = localDayKey();
  return {
    version: CURRENT_DEEPDASH_EXPORT_VERSION,
    exportedAt: new Date(0).toISOString(),
    worldClock: {
      version: 1,
      clocks: [
        { id: "seed-wc-london", timeZone: "Europe/London", label: "London" },
        { id: "seed-wc-sfo", timeZone: "America/Los_Angeles", label: "San Francisco" },
        { id: "seed-wc-nyc", timeZone: "America/New_York", label: "New York" },
        { id: "seed-wc-dubai", timeZone: "Asia/Dubai", label: "Dubai" },
        { id: "seed-wc-tokyo", timeZone: "Asia/Tokyo", label: "Tokyo" },
        { id: "seed-wc-sydney", timeZone: "Australia/Sydney", label: "Sydney" },
      ],
    },
    pomodoro: {
      version: 1,
      config: {
        workDurationMs: 25 * 60 * 1000,
        shortBreakDurationMs: 5 * 60 * 1000,
        longBreakDurationMs: 15 * 60 * 1000,
      },
      logs: {
        days: {}
      }
    },
    todo: {
      version: 1,
      todosByDay: {
        [day]: {
          items: [
            { id: "seed-todo-1", text: "Star mchalapuk/deepdash on Github", done: false },
            { id: "seed-todo-2", text: "Configure world clock time zones", done: false },
            { id: "seed-todo-3", text: "Play with the calculator", done: false },
            { id: "seed-todo-4", text: "Add tasks to this list", done: false },
            { id: "seed-todo-5", text: "Start working using Pomodoro", done: false },
          ],
        },
      },
      todoRolloverMarkers: {},
    },
    calculator: {
      version: 1,
      expression: "",
      history: [
        { id: "seed-calc-h01", normalized: "gcd(84, 30)", result: "6" },
        { id: "seed-calc-h02", normalized: "abs(-2025)", result: "2025" },
        { id: "seed-calc-h03", normalized: "365 / 7", result: "52.142857142857" },
        { id: "seed-calc-h04", normalized: "(1 + sqrt(5)) / 2", result: "1.6180339887499" },
        { id: "seed-calc-h05", normalized: "log(1000, 10)", result: "3" },
        { id: "seed-calc-h06", normalized: "sin(pi / 2)", result: "1" },
        { id: "seed-calc-h07", normalized: "factorial(12)", result: "4.790016e+8" },
        { id: "seed-calc-h08", normalized: "2 * pi", result: "6.2831853071796" },
        { id: "seed-calc-h09", normalized: "sqrt(2)", result: "1.4142135623731" },
        { id: "seed-calc-h10", normalized: "2 ^ 10", result: "1024" },
      ],
    },
  };
}

function hasAnyPersistedDeepdashData(): boolean {
  const ls = localStorage;
  if (ls.getItem(WORLD_CLOCK_STORAGE_KEY) != null) return true;
  if (ls.getItem(CALCULATOR_STORAGE_KEY) != null) return true;
  if (ls.getItem(POMODORO_CONFIG_KEY) != null) return true;
  if (ls.getItem(POMODORO_LOGS_KEY) != null) return true;
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (!k) continue;
    if (
      k.startsWith(TODO_DAY_STORAGE_KEY_PREFIX) ||
      k.startsWith(TODO_AUTO_ROLLOVER_MARKER_PREFIX)
    ) {
      return true;
    }
  }
  return false;
}

function markSeedHandled(): void {
  try {
    localStorage.setItem(FIRST_RUN_SEED_HANDLED_KEY, "1");
  } catch {
    /* quota / private mode */
  }
}

/**
 * On a blank profile, applies {@link buildFirstRunSeedBundle} via the same path as JSON import.
 * Runs in `useLayoutEffect` so `localStorage` is populated before feature store `useEffect` inits read it.
 */
export function maybeApplyFirstRunSeedBundle(): void {
  if (typeof window === "undefined") return;
  migrateLegacyPersistKeysOnce();
  if (localStorage.getItem(FIRST_RUN_SEED_HANDLED_KEY) != null) return;
  if (hasAnyPersistedDeepdashData()) {
    markSeedHandled();
    return;
  }
  const applied = applyDeepdashImportWithRollback(buildFirstRunSeedBundle());
  if (applied.ok) {
    markSeedHandled();
    return;
  }
  log.warn(
    "firstRunSeed: apply failed",
    applied.errors.map((e) => e.message).join("; "),
  );
}
