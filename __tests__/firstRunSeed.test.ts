import { localDayKey } from "@/app/_stores/pomodoroStore";
import { buildFirstRunSeedBundle } from "@/lib/firstRunSeed";
import { tryMigrateDeepdashBundle } from "@/lib/dataExport";

describe("firstRunSeed bundle", () => {
  it("migrates cleanly and matches expected demo content", () => {
    const bundle = buildFirstRunSeedBundle();
    const r = tryMigrateDeepdashBundle(bundle);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const day = localDayKey();
    expect(r.todo.todosByDay[day]?.items.map((i) => i.text)).toEqual([
      "[community] Give a star to DeepDash on Github",
      "Add tasks to this list",
      "Start working using Pomodoro",
      "Clear your inbox",
      "Write an entry in your journal",
    ]);

    expect(r.todo.backlogItems.map((i) => i.text)).toEqual([
      "[community] Write an essay about artificial intelligence",
      "Unsubscribe from newsletters that are distracting you",
      "Add deep work slots for the week to your calendar",
      "Export DeepDash data and store it in your cloud",
      "Do this one thing you've been putting off for a while",
    ]);

    expect(r.pomodoro.config.workDurationMs).toBe(25 * 60 * 1000);
    expect(r.pomodoro.logs.days).toEqual({});
    expect(r.tagColors.colors.community).toBe("pink");
  });
});
