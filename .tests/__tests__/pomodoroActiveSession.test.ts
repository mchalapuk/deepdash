/** @jest-environment jsdom */

import {
  __reconcileActiveSessionAfterLoadForTests,
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

describe("reconcileActiveSessionAfterLoad", () => {
  it("keeps a paused session as-is", () => {
    const run = baseRun({
      openPauseStartMs: 5000,
      pauses: [{ startMs: 2000, endMs: 3000 }],
    });
    expect(__reconcileActiveSessionAfterLoadForTests(run)).toEqual(run);
  });

  it("when running with prior pauses, forces a pause at now", () => {
    const before = Date.now();
    const run = baseRun({
      pauses: [{ startMs: 2000, endMs: 3000 }],
      openPauseStartMs: null,
    });
    const out = __reconcileActiveSessionAfterLoadForTests(run);
    expect(out).not.toBeNull();
    expect(out!.openPauseStartMs).not.toBeNull();
    expect(out!.openPauseStartMs!).toBeGreaterThanOrEqual(before);
    expect(out!.pauses).toEqual(run.pauses);
  });

  it("when running with no pauses, drops the session", () => {
    const run = baseRun({ pauses: [], openPauseStartMs: null });
    expect(__reconcileActiveSessionAfterLoadForTests(run)).toBeNull();
  });
});
