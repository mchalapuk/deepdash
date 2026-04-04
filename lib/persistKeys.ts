/** Single source of truth for `localStorage` keys used by feature stores and import/export. */

export const WORLD_CLOCK_STORAGE_KEY = "worktools.worldClocks.v1";
export const POMODORO_CONFIG_KEY = "worktools.pomodoro.config.v1";
export const POMODORO_LOGS_KEY = "worktools.pomodoro.logs.v1";
export const CALCULATOR_STORAGE_KEY = "worktools.calculator.v1";

/** Per-calendar-day todo buckets: `{prefix}{YYYY-MM-DD}`. */
export const TODO_DAY_STORAGE_KEY_PREFIX = "worktools.todo.day.";

/** Idempotency markers for auto-rollover: `{prefix}{yesterdayKey}` → today’s day key. */
export const TODO_AUTO_ROLLOVER_MARKER_PREFIX = "worktools.todo.autoRolloverFrom.";
