/** Single source of truth for `localStorage` keys used by feature stores and import/export. */

export const WORLD_CLOCK_STORAGE_KEY = "deepdash.worldClocks.v1";
export const POMODORO_CONFIG_KEY = "deepdash.pomodoro.config.v1";
export const POMODORO_LOGS_KEY = "deepdash.pomodoro.logs.v1";
export const CALCULATOR_STORAGE_KEY = "deepdash.calculator.v1";

/** Per-calendar-day todo buckets: `{prefix}{YYYY-MM-DD}`. */
export const TODO_DAY_STORAGE_KEY_PREFIX = "deepdash.todo.day.";

/** Idempotency markers for auto-rollover: `{prefix}{yesterdayKey}` → today’s day key. */
export const TODO_AUTO_ROLLOVER_MARKER_PREFIX = "deepdash.todo.autoRolloverFrom.";

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

    migratePair("worktools.worldClocks.v1", WORLD_CLOCK_STORAGE_KEY);
    migratePair("worktools.pomodoro.config.v1", POMODORO_CONFIG_KEY);
    migratePair("worktools.pomodoro.logs.v1", POMODORO_LOGS_KEY);
    migratePair("worktools.calculator.v1", CALCULATOR_STORAGE_KEY);

    const legacyDayPrefix = "worktools.todo.day.";
    const legacyRolloverPrefix = "worktools.todo.autoRolloverFrom.";
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      if (k.startsWith(legacyDayPrefix)) {
        const suffix = k.slice(legacyDayPrefix.length);
        migratePair(k, `${TODO_DAY_STORAGE_KEY_PREFIX}${suffix}`);
      } else if (k.startsWith(legacyRolloverPrefix)) {
        const suffix = k.slice(legacyRolloverPrefix.length);
        migratePair(k, `${TODO_AUTO_ROLLOVER_MARKER_PREFIX}${suffix}`);
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
