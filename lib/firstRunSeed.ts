import { localDayKey } from "@/app/_stores/pomodoroStore";
import {
  applyDeepdashImportWithRollback,
  CURRENT_DEEPDASH_EXPORT_VERSION,
  type DeepdashExportLatest,
} from "@/lib/dataExport";
import log from "@/lib/logger";
import {
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
            { id: "seed-todo-2", text: "Try import/export in Settings", done: false },
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
  };
}

function hasAnyPersistedDeepdashData(): boolean {
  return (
    localStorage.getItem(POMODORO_CONFIG_KEY) != null ||
    localStorage.getItem(TODO_BACKLOG_STORAGE_KEY) != null
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
