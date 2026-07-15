/** @jest-environment jsdom */

import { pomodoroActions } from "@/app/_stores/pomodoroStore";
import { todoActions } from "@/app/_stores/todoStore";
import exportV1Fixture from "../__fixtures__/export-v1.json";
import exportV2Fixture from "../__fixtures__/export-v2.json";
import exportV3Fixture from "../__fixtures__/export-v3.json";
import exportV4Fixture from "../__fixtures__/export-v4.json";
import todoSliceV1Fixture from "../__fixtures__/todo-slice-v1.json";
import todoSliceV2PerDayBacklogFixture from "../__fixtures__/todo-slice-v2-perday-backlog.json";
import {
  applyDeepdashImportWithRollback,
  CURRENT_DEEPDASH_EXPORT_VERSION,
  formatDeepdashImportErrorsForUser,
  runDeepdashJsonImportFromText,
  tryMigrateDeepdashBundle,
  type DeepdashExportLatest,
} from "@/app/lib/dataExport";
import { migrateTodoSliceToLatest } from "@/app/_stores/todoStore";
import { __resetPomodoroDatabaseForTests } from "@/app/lib/pomodoroIndexedDb";
import { __resetTodoDatabaseForTests } from "@/app/lib/todoIndexedDb";

/** Asserts migration succeeds; mirrors the former `migrateImportToLatest` helper for tests. */
function expectMigratedBundle(raw: unknown): DeepdashExportLatest {
  const r = tryMigrateDeepdashBundle(raw);
  if (!r.ok) {
    throw new Error(formatDeepdashImportErrorsForUser(r.errors));
  }
  return {
    version: CURRENT_DEEPDASH_EXPORT_VERSION,
    exportedAt: r.exportedAt,
    pomodoro: r.pomodoro,
    todo: r.todo,
  };
}

describe("dataExport migrations", () => {
  it("migrates v1 fixture (nested slices) to the current canonical bundle", () => {
    const result = expectMigratedBundle(exportV1Fixture);

    const expected: DeepdashExportLatest = {
      version: CURRENT_DEEPDASH_EXPORT_VERSION,
      exportedAt: "2026-04-01T12:00:00.000Z",
      pomodoro: {
        version: 1,
        config: {
          workDurationMs: 1_500_000,
          shortBreakDurationMs: 300_000,
          longBreakDurationMs: 900_000,
        },
        logs: {
          days: {
            "2026-03-31": {
              entries: [
                {
                  phase: "work",
                  startedAtMs: 1000,
                  endedAtMs: 2000,
                  deletedAtMs: null,
                  pauses: [{ startMs: 1100, endMs: 1200 }],
                },
              ],
            },
          },
        },
      },
      todo: {
        version: 3,
        todosByDay: {
          "2026-04-04": {
            items: [{ id: "todo-1", text: "Ship export", done: false }],
          },
        },
        backlogItems: [],
      },
    };

    expect(result).toEqual(expected);
  });

  it("migrates v2 bundle (with removed calculator slice) to the current canonical bundle", () => {
    const result = expectMigratedBundle(exportV2Fixture);

    expect(result.version).toBe(CURRENT_DEEPDASH_EXPORT_VERSION);
    expect(result.exportedAt).toBe("2026-05-01T12:00:00.000Z");
    expect(result.pomodoro.config.workDurationMs).toBe(1_500_000);
    expect(result.todo.todosByDay["2026-05-02"]?.items[0]?.text).toBe(
      "Migrated from v2 export",
    );
  });

  it("migrates v3 bundle to the current canonical bundle", () => {
    const result = expectMigratedBundle(exportV3Fixture);

    expect(result.version).toBe(CURRENT_DEEPDASH_EXPORT_VERSION);
    expect(result.exportedAt).toBe("2026-06-01T12:00:00.000Z");
    expect(result.todo.todosByDay["2026-06-02"]?.items[0]?.text).toBe(
      "Migrated from v3 export",
    );
  });

  it("migrates v4 bundle (with a since-removed tagColors slice) to the current canonical bundle, dropping tagColors", () => {
    const result = expectMigratedBundle(exportV4Fixture);

    expect(result.version).toBe(CURRENT_DEEPDASH_EXPORT_VERSION);
    expect(result.exportedAt).toBe("2026-07-01T12:00:00.000Z");
    expect(result.todo.todosByDay["2026-07-02"]?.items[0]?.text).toBe(
      "Migrated from v4 export",
    );
    expect(result).not.toHaveProperty("tagColors");
  });

  it("migrates legacy flat bundle v1 (pre–nested slices)", () => {
    const legacy = {
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      worldClocks: [{ id: "x", timeZone: "UTC", label: "" }],
      pomodoro: {
        config: {
          workDurationMs: 25 * 60 * 1000,
          shortBreakDurationMs: 5 * 60 * 1000,
          longBreakDurationMs: 15 * 60 * 1000,
        },
        logs: { days: {} },
      },
      todosByDay: {},
      calculator: { expression: "", history: [] },
    };

    const result = expectMigratedBundle(legacy);
    expect(result.todo).toEqual({
      version: 3,
      todosByDay: {},
      backlogItems: [],
    });
  });

  it("rejects unsupported bundle versions", () => {
    const r = tryMigrateDeepdashBundle({ version: 999, exportedAt: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(formatDeepdashImportErrorsForUser(r.errors)).toMatch(/bundle version 999/);
    }
  });

  it("rejects non-objects", () => {
    const a = tryMigrateDeepdashBundle(null);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.errors[0]?.message).toMatch(/not a JSON object/);

    const b = tryMigrateDeepdashBundle("nope" as unknown);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.errors[0]?.message).toMatch(/not a JSON object/);
  });

  it("tryMigrateDeepdashBundle runs all slice migrations and aggregates failures", () => {
    const r = tryMigrateDeepdashBundle({
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      pomodoro: { version: 99, config: {}, logs: { days: {} } },
      todo: { version: 3, todosByDay: {}, backlogItems: [] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBe(1);
      const mods = r.errors.map((e) => e.module);
      expect(mods).toContain("pomodoro");
      const text = formatDeepdashImportErrorsForUser(r.errors);
      expect(text).toContain("pomodoro");
    }
  });

  it("runDeepdashJsonImportFromText reports invalid JSON", async () => {
    const r = await runDeepdashJsonImportFromText("{");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.phase).toBe("bundle");
      expect(r.errors[0]?.message).toMatch(/Invalid JSON/i);
    }
  });

  it("fills defaults for a minimal v1 payload (nested slices)", () => {
    const result = expectMigratedBundle({
      version: 1,
      exportedAt: "",
      pomodoro: { version: 1, config: {}, logs: {} },
      todo: { version: 1, todosByDay: {} },
    });

    expect(result.pomodoro.logs).toEqual({ days: {} });
    expect(result.pomodoro.config.workDurationMs).toBe(25 * 60 * 1000);
    expect(result.todo).toEqual({
      version: 3,
      todosByDay: {},
      backlogItems: [],
    });
  });

  it("migrates todo slice v1 day documents to v3 (global backlog)", () => {
    expect(
      migrateTodoSliceToLatest({
        version: 1,
        todosByDay: {
          "2026-04-04": {
            items: [{ id: "todo-1", text: "Ship export", done: false }],
          },
        },
        todoRolloverMarkers: { "2026-04-03": "2026-04-04" },
      }),
    ).toEqual({
      version: 3,
      todosByDay: {
        "2026-04-04": {
          items: [{ id: "todo-1", text: "Ship export", done: false }],
        },
      },
      backlogItems: [],
    });
  });

  it("migrates todo-slice-v1.json fixture to v3 shape", () => {
    expect(migrateTodoSliceToLatest(todoSliceV1Fixture)).toEqual({
      version: 3,
      todosByDay: {
        "2026-04-04": {
          items: [{ id: "todo-1", text: "From v1 export", done: false }],
        },
      },
      backlogItems: [],
    });
  });

  it("migrates todo slice v2 per-day backlogs into a single global backlog (v3)", () => {
    expect(migrateTodoSliceToLatest(todoSliceV2PerDayBacklogFixture)).toEqual({
      version: 3,
      todosByDay: {
        "2026-04-10": {
          items: [{ id: "t1", text: "Today", done: false }],
        },
        "2026-04-11": {
          items: [],
        },
      },
      backlogItems: [
        { id: "b1", text: "Back A", done: false },
        { id: "b2", text: "Back B", done: false },
      ],
    });
  });

});

describe("applyDeepdashImportWithRollback", () => {
  beforeEach(async () => {
    localStorage.clear();
    await __resetTodoDatabaseForTests();
    await __resetPomodoroDatabaseForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rolls back to the pre-import snapshot when a module import fails", async () => {
    const seed: DeepdashExportLatest = {
      version: CURRENT_DEEPDASH_EXPORT_VERSION,
      exportedAt: "2020-01-01T00:00:00.000Z",
      pomodoro: {
        version: 1,
        config: {
          workDurationMs: 25 * 60 * 1000,
          shortBreakDurationMs: 5 * 60 * 1000,
          longBreakDurationMs: 15 * 60 * 1000,
        },
        logs: { days: {} },
      },
      todo: {
        version: 3,
        todosByDay: {},
        backlogItems: [{ id: "seed-bl", text: "rollback-check", done: false }],
      },
    };

    const incoming: DeepdashExportLatest = {
      ...seed,
    };

    await pomodoroActions.importData(seed.pomodoro);
    await todoActions.importData(seed.todo);

    jest.spyOn(pomodoroActions, "importData").mockImplementationOnce(() => {
      throw new Error("simulated pomodoro import failure");
    });

    const result = await applyDeepdashImportWithRollback(incoming);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        phase: "import",
        module: "pomodoro",
        message: "simulated pomodoro import failure",
      });
    }

    expect((await todoActions.exportData()).backlogItems).toEqual(seed.todo.backlogItems);
  });
});
