/** @jest-environment jsdom */

import {
  __getPomodoroActivePhaseRunForTests,
  __getPomodoroDayLogEntriesForTests,
  __injectPomodoroMinimalStateForTests,
  __midnightSplitBoundsForTests,
  __partitionPausesForMidnightSplitForTests,
  __runMidnightSplitForTests,
  type ActivePhaseRun,
} from "@/app/_stores/pomodoroStore";

function baseRun(over: Partial<ActivePhaseRun> = {}): ActivePhaseRun {
  return {
    phase: "work",
    phaseStartedAtMs: 1000,
    intendedDurationMs: 25 * 60 * 1000,
    pauses: [],
    openPauseStartMs: null,
    deadlineCrossedNotified: false,
    ...over,
  };
}

describe("midnight split helpers", () => {
  it("bounds: end of day is 23:59:59.999 and next segment starts at following midnight", () => {
    const noon = new Date(2026, 4, 5, 12, 0, 0, 0).getTime();
    const { endOfDayMs, startNextMs } = __midnightSplitBoundsForTests(noon);
    expect(endOfDayMs + 1).toBe(startNextMs);
    const endDate = new Date(endOfDayMs);
    expect(endDate.getFullYear()).toBe(2026);
    expect(endDate.getMonth()).toBe(4);
    expect(endDate.getDate()).toBe(5);
    expect(endDate.getHours()).toBe(23);
    expect(endDate.getMinutes()).toBe(59);
    expect(endDate.getSeconds()).toBe(59);
    expect(endDate.getMilliseconds()).toBe(999);
    expect(new Date(startNextMs).getDate()).toBe(6);
  });

  it("partitions a pause that crosses local midnight", () => {
    const tStart = new Date(2026, 4, 5, 23, 50, 0, 0).getTime();
    const { endOfDayMs, startNextMs } = __midnightSplitBoundsForTests(tStart);
    const pauseStart = new Date(2026, 4, 5, 23, 55, 0, 0).getTime();
    const pauseEnd = new Date(2026, 4, 6, 0, 5, 0, 0).getTime();
    const run = baseRun({
      phaseStartedAtMs: tStart,
      pauses: [{ startMs: pauseStart, endMs: pauseEnd }],
    });
    const { firstSegment, continuation } = __partitionPausesForMidnightSplitForTests(
      run,
      endOfDayMs,
      startNextMs,
    );
    expect(firstSegment).toEqual([{ startMs: pauseStart, endMs: endOfDayMs }]);
    expect(continuation).toEqual([{ startMs: startNextMs, endMs: pauseEnd }]);
  });
});

describe("maybeSplitActivePhaseAtLocalMidnight", () => {
  afterEach(() => {
    __injectPomodoroMinimalStateForTests({
      hydrated: false,
      dayKey: "",
      activePhaseRun: null,
      dayLog: { entries: [] },
    });
  });

  it("splits run onto the next calendar day with shortened intended duration", () => {
    const tStart = new Date(2026, 4, 5, 23, 50, 0, 0).getTime();
    const tNow = new Date(2026, 4, 6, 0, 0, 0, 50).getTime();
    const { endOfDayMs, startNextMs } = __midnightSplitBoundsForTests(tStart);
    const intended = 25 * 60 * 1000;
    const deadline = tStart + intended;

    __injectPomodoroMinimalStateForTests({
      hydrated: true,
      dayKey: "2026-05-05",
      dayLog: { entries: [] },
      activePhaseRun: baseRun({
        phaseStartedAtMs: tStart,
        intendedDurationMs: intended,
      }),
    });

    __runMidnightSplitForTests(tNow);

    const entries = __getPomodoroDayLogEntriesForTests();
    expect(entries).toHaveLength(1);
    expect(entries[0].startedAtMs).toBe(tStart);
    expect(entries[0].endedAtMs).toBe(endOfDayMs);
    expect(entries[0].pauses).toEqual([]);

    const cont = __getPomodoroActivePhaseRunForTests();
    expect(cont).not.toBeNull();
    expect(cont!.phaseStartedAtMs).toBe(startNextMs);
    expect(cont!.intendedDurationMs).toBe(deadline - startNextMs);
    expect(cont!.midnightSplitContinuation).toBe(true);
    expect(cont!.deadlineCrossedNotified).toBe(false);
  });

  it("carries paused state into the continuation segment", () => {
    const tStart = new Date(2026, 4, 5, 23, 50, 0, 0).getTime();
    const tPause = new Date(2026, 4, 5, 23, 52, 0, 0).getTime();
    const tNow = new Date(2026, 4, 6, 0, 0, 0, 0).getTime();
    const { endOfDayMs, startNextMs } = __midnightSplitBoundsForTests(tStart);
    const intended = 25 * 60 * 1000;

    __injectPomodoroMinimalStateForTests({
      hydrated: true,
      dayKey: "2026-05-05",
      dayLog: { entries: [] },
      activePhaseRun: baseRun({
        phaseStartedAtMs: tStart,
        intendedDurationMs: intended,
        openPauseStartMs: tPause,
      }),
    });

    __runMidnightSplitForTests(tNow);

    const entries = __getPomodoroDayLogEntriesForTests();
    expect(entries[0].pauses).toEqual([{ startMs: tPause, endMs: endOfDayMs }]);

    const cont = __getPomodoroActivePhaseRunForTests();
    expect(cont!.openPauseStartMs).toBe(startNextMs);
  });
});
