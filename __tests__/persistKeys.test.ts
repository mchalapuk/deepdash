/** @jest-environment jsdom */

import {
  __resetLegacyPersistMigrationForTests,
  CALCULATOR_STORAGE_KEY,
  migrateLegacyPersistKeysOnce,
  POMODORO_CONFIG_KEY,
  TODO_DAY_STORAGE_KEY_PREFIX,
  WORLD_CLOCK_STORAGE_KEY,
} from "@/lib/persistKeys";

describe("migrateLegacyPersistKeysOnce", () => {
  beforeEach(() => {
    __resetLegacyPersistMigrationForTests();
    localStorage.clear();
  });

  it("copies fixed legacy keys into deepdash keys and removes legacy entries", () => {
    localStorage.setItem("worktools.worldClocks.v1", "[1]");
    localStorage.setItem("worktools.calculator.v1", "{}");

    migrateLegacyPersistKeysOnce();

    expect(localStorage.getItem(WORLD_CLOCK_STORAGE_KEY)).toBe("[1]");
    expect(localStorage.getItem(CALCULATOR_STORAGE_KEY)).toBe("{}");
    expect(localStorage.getItem("worktools.worldClocks.v1")).toBeNull();
    expect(localStorage.getItem("worktools.calculator.v1")).toBeNull();
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
    localStorage.setItem("worktools.calculator.v1", "first");
    migrateLegacyPersistKeysOnce();
    localStorage.setItem("worktools.calculator.v1", "second");
    migrateLegacyPersistKeysOnce();

    expect(localStorage.getItem(CALCULATOR_STORAGE_KEY)).toBe("first");
    expect(localStorage.getItem("worktools.calculator.v1")).toBe("second");
  });
});
