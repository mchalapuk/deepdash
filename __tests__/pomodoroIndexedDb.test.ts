/** @jest-environment jsdom */

import {
  __resetPomodoroDatabaseForTests,
  collectPomodoroLogsForExport,
  getSortedPomodoroLogRecordsForDay,
  migrateLegacyPomodoroLocalStorageToIndexedDb,
} from "@/lib/pomodoroIndexedDb";
import {
  POMODORO_IDB_LEGACY_MIGRATED_KEY,
  POMODORO_LOGS_KEY,
} from "@/lib/persistKeys";

describe("pomodoroIndexedDb", () => {
  beforeEach(async () => {
    localStorage.clear();
    await __resetPomodoroDatabaseForTests();
  });

  it("migrates legacy localStorage work log into IndexedDB and clears the legacy key", async () => {
    localStorage.setItem(
      POMODORO_LOGS_KEY,
      JSON.stringify({
        days: {
          "2026-04-01": {
            entries: [
              {
                phase: "work",
                startedAtMs: 100,
                endedAtMs: 200,
                pauses: [{ startMs: 120, endMs: 140 }],
              },
            ],
          },
        },
      }),
    );

    await migrateLegacyPomodoroLocalStorageToIndexedDb();

    expect(localStorage.getItem(POMODORO_LOGS_KEY)).toBeNull();
    expect(localStorage.getItem(POMODORO_IDB_LEGACY_MIGRATED_KEY)).toBe("1");

    const rows = await getSortedPomodoroLogRecordsForDay("2026-04-01");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      day: "2026-04-01",
      phase: "work",
      startedAtMs: 100,
      endedAtMs: 200,
      pauses: [{ startMs: 120, endMs: 140 }],
    });
    expect(typeof rows[0]!.id).toBe("string");

    const exp = await collectPomodoroLogsForExport();
    expect(exp.days["2026-04-01"]?.entries).toEqual([
      {
        phase: "work",
        startedAtMs: 100,
        endedAtMs: 200,
        pauses: [{ startMs: 120, endMs: 140 }],
      },
    ]);
  });

  it("is idempotent when the legacy migrated flag is already set", async () => {
    localStorage.setItem(
      POMODORO_LOGS_KEY,
      JSON.stringify({
        days: {
          "2026-04-01": {
            entries: [
              {
                phase: "work",
                startedAtMs: 1,
                endedAtMs: 2,
                pauses: [],
              },
            ],
          },
        },
      }),
    );
    localStorage.setItem(POMODORO_IDB_LEGACY_MIGRATED_KEY, "1");

    await migrateLegacyPomodoroLocalStorageToIndexedDb();

    expect(localStorage.getItem(POMODORO_LOGS_KEY)).not.toBeNull();
    const rows = await getSortedPomodoroLogRecordsForDay("2026-04-01");
    expect(rows.length).toBe(0);
  });
});
