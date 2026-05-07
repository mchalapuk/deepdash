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
  TODO_BACKLOG_STORAGE_KEY,
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
      version: 3,
      todosByDay: {
        [day]: {
          items: [
            { id: "seed-todo-1", text: "Star DeepDash on Github", done: false },
            { id: "seed-todo-2", text: "Play with the calculator", done: false },
            { id: "seed-todo-3", text: "Add tasks to this list", done: false },
            { id: "seed-todo-4", text: "Start working using Pomodoro", done: false },
            { id: "seed-todo-5", text: "Clear your inbox", done: false },
            { id: "seed-todo-6", text: "Write an entry in your journal", done: false },
          ],
        },
      },
      backlogItems: [
        { id: "seed-backlog-1", text: "Write an essay about AI", done: false },
        {
          id: "seed-backlog-2",
          text: "Unsubscribe from newsletters that are distracting you",
          done: false,
        },
        {
          id: "seed-backlog-3",
          text: "Add deep work slots for the week to your calendar",
          done: false,
        },
        {
          id: "seed-backlog-4",
          text: "Export DeepDash data and store it in your cloud",
          done: false,
        },
        {
          id: "seed-backlog-5",
          text: "Do this one thing you've been putting off for a while",
          done: false,
        },
      ],
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
        { id: "seed-calc-h11", normalized: "12 * 9", result: "108" },
        { id: "seed-calc-h12", normalized: "100 - 17", result: "83" },
        { id: "seed-calc-h13", normalized: "round(3.1415926, 3)", result: "3.142" },
        { id: "seed-calc-h14", normalized: "floor(19.99)", result: "19" },
        { id: "seed-calc-h15", normalized: "ceil(19.01)", result: "20" },
        { id: "seed-calc-h16", normalized: "sqrt(144)", result: "12" },
        { id: "seed-calc-h17", normalized: "2^16", result: "65536" },
        { id: "seed-calc-h18", normalized: "(45 + 30 + 25) / 3", result: "33.333333333333336" },
        { id: "seed-calc-h19", normalized: "10%", result: "0.1" },
        { id: "seed-calc-h20", normalized: "min(3, 7, -2)", result: "-2" },
      ],
    },
  };
}

function hasAnyPersistedDeepdashData(): boolean {
  return (
    localStorage.getItem(POMODORO_CONFIG_KEY) != null ||
    localStorage.getItem(TODO_BACKLOG_STORAGE_KEY) != null ||
    localStorage.getItem(CALCULATOR_STORAGE_KEY) != null
  );
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
 * Await this before mounting feature UI so stores see seeded storage (including IndexedDB todos).
 */
export async function maybeApplyFirstRunSeedBundle(): Promise<void> {
  if (typeof window === "undefined") return;
  migrateLegacyPersistKeysOnce();
  if (localStorage.getItem(FIRST_RUN_SEED_HANDLED_KEY) != null) return;
  if (hasAnyPersistedDeepdashData()) {
    markSeedHandled();
    return;
  }
  const applied = await applyDeepdashImportWithRollback(buildFirstRunSeedBundle());
  if (applied.ok) {
    markSeedHandled();
    return;
  }
  log.warn(
    "firstRunSeed: apply failed",
    applied.errors.map((e) => e.message).join("; "),
  );
}
