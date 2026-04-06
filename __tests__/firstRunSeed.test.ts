import { localDayKey } from "@/app/_stores/pomodoroStore";
import { buildFirstRunSeedBundle } from "@/lib/firstRunSeed";
import { tryMigrateDeepdashBundle } from "@/lib/dataExport";

describe("firstRunSeed bundle", () => {
  it("migrates cleanly and matches expected demo content", () => {
    const bundle = buildFirstRunSeedBundle();
    const r = tryMigrateDeepdashBundle(bundle);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.worldClock.clocks.map((c) => c.timeZone)).toEqual([
      "Europe/London",
      "America/Los_Angeles",
      "America/New_York",
      "Asia/Dubai",
      "Asia/Tokyo",
      "Australia/Sydney",
    ]);

    const day = localDayKey();
    expect(r.todo.todosByDay[day]?.items.map((i) => i.text)).toEqual([
      "Star mchalapuk/deepdash on Github",
      "Configure world clock time zones",
      "Play with the calculator",
      "Add tasks to this list",
      "Start working using Pomodoro",
    ]);

    expect(r.pomodoro.config.workDurationMs).toBe(25 * 60 * 1000);
    expect(r.pomodoro.logs.days).toEqual({});

    expect(r.calculator.history).toHaveLength(10);
    expect(r.calculator.expression).toBe("");
  });
});
