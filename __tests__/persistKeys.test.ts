/** @jest-environment jsdom */

import {
  __resetLegacyPersistMigrationForTests,
  migrateLegacyPersistKeysOnce,
  POMODORO_CONFIG_KEY,
  TODO_DAY_STORAGE_KEY_PREFIX,
} from "@/app/lib/persistKeys";

describe("migrateLegacyPersistKeysOnce", () => {
  beforeEach(() => {
    __resetLegacyPersistMigrationForTests();
    localStorage.clear();
  });

  it("removes obsolete calculator storage keys", () => {
    localStorage.setItem("worktools.calculator.v1", "{}");
    localStorage.setItem("deepdash.calculator.v1", "{}");

    migrateLegacyPersistKeysOnce();

    expect(localStorage.getItem("worktools.calculator.v1")).toBeNull();
    expect(localStorage.getItem("deepdash.calculator.v1")).toBeNull();
  });

  it("does not overwrite an existing deepdash key", () => {
    localStorage.setItem(POMODORO_CONFIG_KEY, '{"keep":true}');
    localStorage.setItem("worktools.pomodoro.config.v1", '{"old":true}');

    migrateLegacyPersistKeysOnce();

    expect(localStorage.getItem(POMODORO_CONFIG_KEY)).toBe('{"keep":true}');
    expect(localStorage.getItem("worktools.pomodoro.config.v1")).toBeNull();
  });

  it("migrates todo day prefix and drops obsolete rollover keys", () => {
    localStorage.setItem("worktools.todo.day.2026-04-01", '{"items":[]}');
    localStorage.setItem("worktools.todo.autoRolloverFrom.2026-03-31", "2026-04-01");

    migrateLegacyPersistKeysOnce();

    expect(localStorage.getItem(`${TODO_DAY_STORAGE_KEY_PREFIX}2026-04-01`)).toBe('{"items":[]}');
    expect(localStorage.getItem("worktools.todo.autoRolloverFrom.2026-03-31")).toBeNull();
    expect(localStorage.getItem("worktools.todo.day.2026-04-01")).toBeNull();
  });

  it("runs only once until reset", () => {
    localStorage.setItem("worktools.pomodoro.config.v1", "first");
    migrateLegacyPersistKeysOnce();
    localStorage.setItem("worktools.pomodoro.config.v1", "second");
    migrateLegacyPersistKeysOnce();

    expect(localStorage.getItem(POMODORO_CONFIG_KEY)).toBe("first");
    expect(localStorage.getItem("worktools.pomodoro.config.v1")).toBe("second");
  });
});
