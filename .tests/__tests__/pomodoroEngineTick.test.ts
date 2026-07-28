/** @jest-environment jsdom */

import {
  __getPomodoroActivePhaseRunForTests,
  __getPomodoroDayLogEntriesForTests,
  __getPomodoroPhaseForTests,
  __injectPomodoroMinimalStateForTests,
  __remainingCountdownMsForTests,
  __runPomodoroEngineTickForTests,
  __setPomodoroClockForTests,
  __setSleepDriftProviderForTests,
  localDayKey,
  type ActivePhaseRun,
} from "@/app/_stores/pomodoroStore";

const WORK_MS = 25 * 60 * 1000;
const SHORT_BREAK_MS = 5 * 60 * 1000;

function baseRun(over: Partial<ActivePhaseRun> = {}): ActivePhaseRun {
  return {
    phase: "work",
    phaseStartedAtMs: 1_000_000,
    intendedDurationMs: WORK_MS,
    pauses: [],
    openPauseStartMs: null,
    deadlineCrossedNotified: false,
    ...over,
  };
}

describe("runEngineTick", () => {
  afterEach(() => {
    __setPomodoroClockForTests(null);
    __setSleepDriftProviderForTests(null);
    __injectPomodoroMinimalStateForTests({
      hydrated: false,
      dayKey: "",
      phase: "work",
      activePhaseRun: null,
      dayLog: { entries: [] },
    });
  });

  it("crosses the work deadline once, notifying exactly once across repeated ticks", () => {
    const tStart = 1_000_000;
    const nowMs = tStart + WORK_MS + 1000;
    __setSleepDriftProviderForTests(() => 0);
    __setPomodoroClockForTests(() => nowMs);
    __injectPomodoroMinimalStateForTests({
      hydrated: true,
      dayKey: localDayKey(new Date(nowMs)),
      dayLog: { entries: [] },
      activePhaseRun: baseRun({ phaseStartedAtMs: tStart }),
    });

    const onPhaseDeadlineCrossed = jest.fn();
    __runPomodoroEngineTickForTests({ onPhaseDeadlineCrossed });
    __runPomodoroEngineTickForTests({ onPhaseDeadlineCrossed });

    expect(onPhaseDeadlineCrossed).toHaveBeenCalledTimes(1);
    const run = __getPomodoroActivePhaseRunForTests();
    expect(run).not.toBeNull();
    expect(run!.deadlineCrossedNotified).toBe(true);
  });

  it("finalizes a running break past its deadline and calls onBreakPhaseCompleted", () => {
    const tStart = 1_000_000;
    const nowMs = tStart + SHORT_BREAK_MS + 1000;
    __setSleepDriftProviderForTests(() => 0);
    __setPomodoroClockForTests(() => nowMs);
    __injectPomodoroMinimalStateForTests({
      hydrated: true,
      dayKey: localDayKey(new Date(nowMs)),
      dayLog: { entries: [] },
      activePhaseRun: baseRun({
        phase: "shortBreak",
        phaseStartedAtMs: tStart,
        intendedDurationMs: SHORT_BREAK_MS,
      }),
    });

    const onBreakPhaseCompleted = jest.fn();
    __runPomodoroEngineTickForTests({ onBreakPhaseCompleted });

    expect(onBreakPhaseCompleted).toHaveBeenCalledTimes(1);
    expect(onBreakPhaseCompleted).toHaveBeenCalledWith("shortBreak");
    expect(__getPomodoroActivePhaseRunForTests()).toBeNull();
    const entries = __getPomodoroDayLogEntriesForTests();
    expect(entries).toHaveLength(1);
    expect(entries[0].phase).toBe("shortBreak");
  });

  it("backdates the pause start when audio-clock drift exceeds the sleep threshold", () => {
    const tStart = 1_000_000;
    const nowMs = tStart + 60_000;
    const driftMs = 20_000;
    __setSleepDriftProviderForTests(() => driftMs);
    __setPomodoroClockForTests(() => nowMs);
    __injectPomodoroMinimalStateForTests({
      hydrated: true,
      dayKey: localDayKey(new Date(nowMs)),
      dayLog: { entries: [] },
      activePhaseRun: baseRun({ phaseStartedAtMs: tStart }),
    });

    __runPomodoroEngineTickForTests();

    const run = __getPomodoroActivePhaseRunForTests();
    expect(run!.openPauseStartMs).toBe(nowMs - driftMs);
  });

  it("clamps the backdated pause start to the run's start time", () => {
    const tStart = 1_000_000;
    const nowMs = tStart + 5000;
    const driftMs = 20_000; // now - drift would land before phaseStartedAtMs
    __setSleepDriftProviderForTests(() => driftMs);
    __setPomodoroClockForTests(() => nowMs);
    __injectPomodoroMinimalStateForTests({
      hydrated: true,
      dayKey: localDayKey(new Date(nowMs)),
      dayLog: { entries: [] },
      activePhaseRun: baseRun({ phaseStartedAtMs: tStart }),
    });

    __runPomodoroEngineTickForTests();

    const run = __getPomodoroActivePhaseRunForTests();
    expect(run!.openPauseStartMs).toBe(tStart);
  });

  it("does not pause when drift stays below the sleep threshold", () => {
    const tStart = 1_000_000;
    const nowMs = tStart + 60_000;
    __setSleepDriftProviderForTests(() => 5000);
    __setPomodoroClockForTests(() => nowMs);
    __injectPomodoroMinimalStateForTests({
      hydrated: true,
      dayKey: localDayKey(new Date(nowMs)),
      dayLog: { entries: [] },
      activePhaseRun: baseRun({ phaseStartedAtMs: tStart }),
    });

    __runPomodoroEngineTickForTests();

    const run = __getPomodoroActivePhaseRunForTests();
    expect(run!.openPauseStartMs).toBeNull();
  });

  it("pauses rather than completes a work run when sleep drift spans the deadline", () => {
    const tStart = 1_000_000;
    const deadlineMs = tStart + WORK_MS;
    const nowMs = deadlineMs + 5000;
    const driftMs = 20_000; // sleep started before the deadline, tab woke up after it
    __setSleepDriftProviderForTests(() => driftMs);
    __setPomodoroClockForTests(() => nowMs);
    __injectPomodoroMinimalStateForTests({
      hydrated: true,
      dayKey: localDayKey(new Date(nowMs)),
      dayLog: { entries: [] },
      activePhaseRun: baseRun({ phaseStartedAtMs: tStart }),
    });

    const onPhaseDeadlineCrossed = jest.fn();
    __runPomodoroEngineTickForTests({ onPhaseDeadlineCrossed });

    expect(onPhaseDeadlineCrossed).not.toHaveBeenCalled();
    const run = __getPomodoroActivePhaseRunForTests();
    expect(run).not.toBeNull();
    expect(run!.deadlineCrossedNotified).toBe(false);
    expect(run!.openPauseStartMs).toBe(nowMs - driftMs);
  });

  it("completes a break whose sleep-drift pause outlasted the countdown, without chiming", () => {
    // Regression: closing the lid mid-break left the break paused at 00:00 after waking up; the
    // break only completed (chiming, then resetting to work) on the next Resume.
    const tStart = 1_000_000;
    const lidCloseMs = tStart + 60_000; // one minute into a five-minute break
    const sleptMs = 60 * 60 * 1000;
    const nowMs = lidCloseMs + sleptMs;
    __setSleepDriftProviderForTests(() => sleptMs);
    __setPomodoroClockForTests(() => nowMs);
    __injectPomodoroMinimalStateForTests({
      hydrated: true,
      dayKey: localDayKey(new Date(nowMs)),
      phase: "shortBreak",
      dayLog: { entries: [] },
      activePhaseRun: baseRun({
        phase: "shortBreak",
        phaseStartedAtMs: tStart,
        intendedDurationMs: SHORT_BREAK_MS,
      }),
    });

    const onBreakPhaseCompleted = jest.fn();
    __runPomodoroEngineTickForTests({ onBreakPhaseCompleted });

    expect(onBreakPhaseCompleted).not.toHaveBeenCalled();
    expect(__getPomodoroActivePhaseRunForTests()).toBeNull();
    expect(__getPomodoroPhaseForTests()).toBe("work");
    const entries = __getPomodoroDayLogEntriesForTests();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      phase: "shortBreak",
      startedAtMs: tStart,
      endedAtMs: tStart + SHORT_BREAK_MS,
      pauses: [{ startMs: lidCloseMs, endMs: tStart + SHORT_BREAK_MS }],
    });
  });

  it("keeps showing overtime (not 00:00) after a sleep-drift pause spans the deadline", () => {
    // Regression: closing the lid mid-overtime used to freeze the display at 00:00 until Resume
    // recomputed against the live clock, because remainingCountdownMs clamped negative to 0.
    const tStart = 1_000_000;
    const overtimeMs = 45_000;
    const deadlineMs = tStart + WORK_MS;
    const nowMs = deadlineMs + overtimeMs;
    const driftMs = 20_000; // sleep started before the deadline, tab woke up well after it
    __setSleepDriftProviderForTests(() => driftMs);
    __setPomodoroClockForTests(() => nowMs);
    __injectPomodoroMinimalStateForTests({
      hydrated: true,
      dayKey: localDayKey(new Date(nowMs)),
      dayLog: { entries: [] },
      activePhaseRun: baseRun({ phaseStartedAtMs: tStart }),
    });

    __runPomodoroEngineTickForTests();

    const run = __getPomodoroActivePhaseRunForTests();
    expect(run!.openPauseStartMs).not.toBeNull();
    // The retroactive pause lands `driftMs` before `nowMs`, so overtime-at-pause is less than
    // overtimeMs by that same drift.
    const overtimeAtPauseMs = overtimeMs - driftMs;
    const remainingMs = __remainingCountdownMsForTests(run!, run!.openPauseStartMs!);
    expect(remainingMs).toBeLessThan(0);
    expect(Math.ceil(remainingMs / 1000)).toBe(-Math.ceil(overtimeAtPauseMs / 1000));
  });
});
