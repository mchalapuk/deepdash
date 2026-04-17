/** @jest-environment jsdom */

import { TODO_BACKLOG_STORAGE_KEY, TODO_DAY_STORAGE_KEY_PREFIX } from "@/lib/persistKeys";

describe("todo day rollover", () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-11T15:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("rolls incomplete today-list rows from yesterday into today (global backlog unchanged)", async () => {
    const yKey = "2026-04-10";
    localStorage.setItem(
      `${TODO_DAY_STORAGE_KEY_PREFIX}${yKey}`,
      JSON.stringify({
        items: [{ id: "t1", text: "Carry over", done: false }],
      }),
    );
    localStorage.setItem(
      TODO_BACKLOG_STORAGE_KEY,
      JSON.stringify({
        backlogItems: [{ id: "b1", text: "Global backlog", done: false }],
      }),
    );

    const { __awaitTodoStoreHydrationForTests, todoActions } = await import(
      "@/app/_stores/todoStore"
    );
    const dispose = todoActions.init();
    await __awaitTodoStoreHydrationForTests();
    try {
      const exp = await todoActions.exportData();
      expect(exp.todosByDay["2026-04-11"]?.items?.some((i) => i.text === "Carry over")).toBe(true);
      expect(exp.todosByDay["2026-04-11"]?.items?.find((i) => i.text === "Carry over")?.id).toBe(
        "t1",
      );
      expect(exp.backlogItems?.map((i) => i.text)).toEqual(["Global backlog"]);
    } finally {
      dispose();
    }
  });

  it("migrates per-day backlog JSON into the global backlog list (IndexedDB) on init", async () => {
    const yKey = "2026-04-10";
    localStorage.setItem(
      `${TODO_DAY_STORAGE_KEY_PREFIX}${yKey}`,
      JSON.stringify({
        items: [],
        backlogItems: [{ id: "b1", text: "From old per-day storage", done: false }],
      }),
    );

    const { __awaitTodoStoreHydrationForTests, todoActions } = await import(
      "@/app/_stores/todoStore"
    );
    const dispose = todoActions.init();
    await __awaitTodoStoreHydrationForTests();
    try {
      const exp = await todoActions.exportData();
      expect(exp.backlogItems.some((b) => b.text === "From old per-day storage")).toBe(true);
      expect(localStorage.getItem(`${TODO_DAY_STORAGE_KEY_PREFIX}${yKey}`)).toBeNull();
    } finally {
      dispose();
    }
  });
});
