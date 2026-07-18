/** @jest-environment jsdom */

import {
  __getPomodoroActivePhaseRunForTests,
  __getPomodoroDayLogEntriesForTests,
  __injectPomodoroMinimalStateForTests,
  __isPausedWorkRunStaleForTests,
  __runPausedWorkAbandonCheckForTests,
  type ActivePhaseRun,
  type PomodoroLogEntryStored,
} from "@/app/_stores/pomodoroStore";

const SHORT_BREAK_MS = 5 * 60 * 1000;
const LONG_BREAK_MS = 15 * 60 * 1000;

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

function completedWorkEntry(over: Partial<PomodoroLogEntryStored> = {}): PomodoroLogEntryStored {
  return {
    id: crypto.randomUUID(),
    phase: "work",
    startedAtMs: 0,
    endedAtMs: 25 * 60 * 1000,
    pauses: [],
    deletedAtMs: null,
    ...over,
  };
}

describe("isPausedWorkRunStale", () => {
  afterEach(() => {
    __injectPomodoroMinimalStateForTests({
      hydrated: false,
      dayKey: "",
      activePhaseRun: null,
      dayLog: { entries: [] },
    });
  });

  it("is not stale before the next (short) break's duration has elapsed", () => {
    __injectPomodoroMinimalStateForTests({ hydrated: true, dayKey: "2026-07-09", dayLog: { entries: [] } });
    const tPause = 10_000;
    const run = baseRun({ openPauseStartMs: tPause });
    expect(__isPausedWorkRunStaleForTests(run, tPause + SHORT_BREAK_MS - 1)).toBe(false);
  });

  it("is stale once paused longer than the next (short) break would last", () => {
    __injectPomodoroMinimalStateForTests({ hydrated: true, dayKey: "2026-07-09", dayLog: { entries: [] } });
    const tPause = 10_000;
    const run = baseRun({ openPauseStartMs: tPause });
    expect(__isPausedWorkRunStaleForTests(run, tPause + SHORT_BREAK_MS + 1)).toBe(true);
  });

  it("uses the long break's duration once the 4th pomodoro of the day is up next", () => {
    __injectPomodoroMinimalStateForTests({
      hydrated: true,
      dayKey: "2026-07-09",
      dayLog: { entries: [1, 2, 3, 4].map((n) => completedWorkEntry({ id: `w${n}` })) },
    });
    const tPause = 10_000;
    const run = baseRun({ openPauseStartMs: tPause });
    expect(__isPausedWorkRunStaleForTests(run, tPause + SHORT_BREAK_MS + 1)).toBe(false);
    expect(__isPausedWorkRunStaleForTests(run, tPause + LONG_BREAK_MS + 1)).toBe(true);
  });

  it("is never stale for a running (non-paused) run", () => {
    __injectPomodoroMinimalStateForTests({ hydrated: true, dayKey: "2026-07-09", dayLog: { entries: [] } });
    const run = baseRun({ openPauseStartMs: null });
    expect(__isPausedWorkRunStaleForTests(run, 999_999_999)).toBe(false);
  });

  it("is never stale for a paused break", () => {
    __injectPomodoroMinimalStateForTests({ hydrated: true, dayKey: "2026-07-09", dayLog: { entries: [] } });
    const run = baseRun({ phase: "shortBreak", openPauseStartMs: 0 });
    expect(__isPausedWorkRunStaleForTests(run, 999_999_999)).toBe(false);
  });
});

describe("abandonStalePausedWorkRunIfAny", () => {
  // Same local day as the injected dayKey below, so finalizing stays on the synchronous same-day path.
  const dayStartMs = new Date(2026, 6, 9, 10, 0, 0, 0).getTime();

  afterEach(() => {
    __injectPomodoroMinimalStateForTests({
      hydrated: false,
      dayKey: "",
      activePhaseRun: null,
      dayLog: { entries: [] },
    });
  });

  it("auto-finalizes a stale paused pomodoro into the worklog, logging work done before the pause", () => {
    const tPause = dayStartMs + 10_000;
    __injectPomodoroMinimalStateForTests({
      hydrated: true,
      dayKey: "2026-07-09",
      dayLog: { entries: [] },
      activePhaseRun: baseRun({ phaseStartedAtMs: dayStartMs, openPauseStartMs: tPause }),
    });

    const endedAtMs = tPause + SHORT_BREAK_MS + 1;
    __runPausedWorkAbandonCheckForTests(endedAtMs);

    expect(__getPomodoroActivePhaseRunForTests()).toBeNull();
    const entries = __getPomodoroDayLogEntriesForTests();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      phase: "work",
      startedAtMs: dayStartMs,
      endedAtMs,
      pauses: [{ startMs: tPause, endMs: endedAtMs }],
      deletedAtMs: null,
    });
  });

  it("leaves a paused pomodoro alone while still within the abandon threshold", () => {
    const tPause = dayStartMs + 10_000;
    const run = baseRun({ phaseStartedAtMs: dayStartMs, openPauseStartMs: tPause });
    __injectPomodoroMinimalStateForTests({
      hydrated: true,
      dayKey: "2026-07-09",
      dayLog: { entries: [] },
      activePhaseRun: run,
    });

    __runPausedWorkAbandonCheckForTests(tPause + SHORT_BREAK_MS - 1);

    expect(__getPomodoroActivePhaseRunForTests()).toEqual(run);
  });
});
