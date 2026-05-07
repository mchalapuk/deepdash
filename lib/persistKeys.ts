/** Single source of truth for `localStorage` keys used by feature stores and import/export. */

export const POMODORO_CONFIG_KEY = "deepdash.pomodoro.config.v1";
/** In-flight timer session (JSON). Cleared when idle. */
export const POMODORO_ACTIVE_SESSION_KEY = "deepdash.pomodoro.activeSession.v1";
export const POMODORO_LOGS_KEY = "deepdash.pomodoro.logs.v1";

/** Set after legacy pomodoro work log JSON (`POMODORO_LOGS_KEY`) was migrated into IndexedDB. */
export const POMODORO_IDB_LEGACY_MIGRATED_KEY = "deepdash.pomodoro.logs.idbLegacyMigrated.v1";
export const CALCULATOR_STORAGE_KEY = "deepdash.calculator.v1";

/** Per-calendar-day todo buckets: `{prefix}{YYYY-MM-DD}`. */
export const TODO_DAY_STORAGE_KEY_PREFIX = "deepdash.todo.day.";

/** Single global backlog (not tied to a calendar day). JSON: `{ backlogItems: TodoItem[] }`. */
export const TODO_BACKLOG_STORAGE_KEY = "deepdash.todo.backlog.v1";

/** Set after legacy todo task JSON (`TODO_DAY_*` / `TODO_BACKLOG_STORAGE_KEY`) was migrated into IndexedDB. */
export const TODO_IDB_LEGACY_MIGRATED_KEY = "deepdash.todo.tasks.idbLegacyMigrated.v1";

/** Set after first-run demo data is skipped (existing user) or applied (blank profile). */
export const FIRST_RUN_SEED_HANDLED_KEY = "deepdash.firstRunSeedHandled.v1";

let legacyPersistMigrationDone = false;

/**
 * Copies data from the pre-rename `worktools.*` namespace into `deepdash.*` once per page load,
 * then removes legacy keys. Safe to call from every store `loadFromStorage`.
 */
export function migrateLegacyPersistKeysOnce(): void {
  if (typeof window === "undefined" || legacyPersistMigrationDone) return;
  legacyPersistMigrationDone = true;
  try {
    const ls = localStorage;
    const migratePair = (oldKey: string, newKey: string): void => {
      const oldVal = ls.getItem(oldKey);
      if (oldVal === null) return;
      if (ls.getItem(newKey) === null) {
        ls.setItem(newKey, oldVal);
      }
      ls.removeItem(oldKey);
    };

    migratePair("worktools.pomodoro.config.v1", POMODORO_CONFIG_KEY);
    migratePair("worktools.pomodoro.activeSession.v1", POMODORO_ACTIVE_SESSION_KEY);
    migratePair("worktools.pomodoro.logs.v1", POMODORO_LOGS_KEY);
    migratePair("worktools.calculator.v1", CALCULATOR_STORAGE_KEY);

    const legacyDayPrefix = "worktools.todo.day.";
    const legacyRolloverPrefix = "worktools.todo.autoRolloverFrom.";
    const obsoleteRolloverPrefix = "deepdash.todo.autoRolloverFrom.";
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      if (k.startsWith(legacyDayPrefix)) {
        const suffix = k.slice(legacyDayPrefix.length);
        migratePair(k, `${TODO_DAY_STORAGE_KEY_PREFIX}${suffix}`);
      } else if (k.startsWith(legacyRolloverPrefix) || k.startsWith(obsoleteRolloverPrefix)) {
        // Not task data: old idempotency markers for a removed feature. They are never migrated to
        // IndexedDB (todo rows live under `TODO_DAY_*` / `TODO_BACKLOG_STORAGE_KEY`, copied above).
        try {
          ls.removeItem(k);
        } catch {
          /* best effort */
        }
      }
    }
  } catch {
    // Quota or private mode — best effort only.
  }
}

/** @internal */
export function __resetLegacyPersistMigrationForTests(): void {
  legacyPersistMigrationDone = false;
}
