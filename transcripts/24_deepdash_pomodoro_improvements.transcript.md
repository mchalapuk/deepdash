# Timer drift detection in Pomodoro
_Exported on 5/6/2026 at 21:05:07 GMT+2 from Cursor (3.2.16)_

---

**User**

in @app/_components/Pomodoro.tsx , let's play try to detect timer drift by measuring how much time have passed since we scheduled a timer. If we detect a drift 3 times in a row, let's pause the pomodoro.

Let's create new hook usePauseOnTimeDrift() and place it below usePomodoroMechanics.

---

**Cursor**

Reading `Pomodoro.tsx` to understand timer mechanics and how we can implement drift detection.



Inspecting the pomodoro store for how timers are scheduled.



Implementing `usePauseOnTimeDrift`: the store ticks every 100ms (`POMODORO_TIMER_INTERVAL_MS`). We'll mirror that interval, measure elapsed time between callbacks, treat consecutive late fires as drift, and call `pomodoroActions.pause()` after three consecutive drifts. Adding the hook below `usePomodoroMechanics` and invoking it from `Pomodoro`.



Here’s what was added.

### Behavior
- While the pomodoro is **running** (not paused), a `setInterval` runs every **100 ms**, matching `POMODORO_TIMER_INTERVAL_MS` in `pomodoroStore.ts`.
- On each tick, **elapsed time since the previous tick** is measured with `performance.now()`.
- If that gap is **more than 175 ms** (100 ms nominal + **75 ms** tolerance), that counts as one drift event.
- After **3 drift events in a row**, `pomodoroActions.pause()` runs and the streak resets.
- Any tick within the threshold resets the streak to 0. Leaving the running state or pausing clears the streak.

### Wiring
- `usePauseOnTimeDrift()` is defined **directly under** `usePomodoroMechanics`.
- `Pomodoro()` calls it right after `usePomodoroMechanics()` so drift handling is active whenever the panel is mounted.

The 75 ms threshold filters normal jitter; background tabs or heavy main-thread blocking tend to produce gaps well above 175 ms for several ticks in a row, which matches the “3 times in a row” intent.

```279:415:app/_components/Pomodoro.tsx
function usePomodoroMechanics(): [PomodoroPhase, boolean, boolean] {
  // ... existing code ...
  return [phase, running, paused];
}

/** Keep in sync with `POMODORO_TIMER_INTERVAL_MS` in `app/_stores/pomodoroStore.ts`. */
const POMODORO_TICK_MS = 100;
/** Consecutive interval fires later than this vs an ideal tick count toward pausing. */
const TICK_DRIFT_THRESHOLD_MS = 75;

function usePauseOnTimeDrift(): void {
  const running = useIsRunning();
  const paused = useIsPaused();
  const streakRef = useRef(0);
  const lastTickRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!running || paused) {
      streakRef.current = 0;
      return;
    }

    streakRef.current = 0;
    lastTickRef.current = performance.now();

    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;

      if (delta > POMODORO_TICK_MS + TICK_DRIFT_THRESHOLD_MS) {
        streakRef.current += 1;
        if (streakRef.current >= 3) {
          streakRef.current = 0;
          pomodoroActions.pause();
        }
      } else {
        streakRef.current = 0;
      }
    }, POMODORO_TICK_MS);

    return () => window.clearInterval(id);
  }, [running, paused]);
}
```

Jest still reports two failures in other suites (`dataExport`, `pomodoroIndexedDb`); they are unrelated to this file. If you want a different sensitivity (stricter looser threshold or counting cumulative drift), say how you’d like it to behave.

---

**User**

Please use setTimeout instead of setInterval.

---

**Cursor**

Replacing `setInterval` with chained `setTimeout` and skipping scheduling the next tick after auto-pause so we don't leave a stray timer.



Fixing a TypeScript mismatch between DOM (`number`) and Node (`Timeout`) typings:



Summary of changes:

- **Chained `setTimeout`**: The first tick is scheduled with `setTimeout(tick, POMODORO_TICK_MS)`; each `tick` schedules the next one at the end unless drift handling calls `pause()`.
- **No follow-up after auto-pause**: If three drifts trigger `pomodoroActions.pause()`, `tick` returns without scheduling another timeout so nothing keeps firing until React re-runs the effect.
- **Cleanup**: The effect’s cleanup still `clearTimeout`s the latest scheduled id (with a guard so typings stay valid).

Drift math is unchanged: each delay is still measured from the previous callback, including the gap from scheduling to the first `tick` (target ~100 ms).

---

**User**

It works. Let's also add logic for handling pomodoro sessions that cross over between days. When we move past midnight, the existing session should be closed exactly at 23:59:59.999 and a new session created exactly at 00:00. The new session should have the intended duration shorter than normal so that it finishes at the same time as the original would finish.

---

**Cursor**

Exploring how active sessions, finalization, and day rollover interact in the pomodoro store.



Implementing midnight split in the store: refactoring finalization, adding split logic to the timer engine, and updating the Pomodoro intro to respect `midnightSplitContinuation`.



Implementing midnight split with pause partitioning, refactoring finalization, and adding tests.



Here’s what was implemented.

### Behavior (`pomodoroStore.ts`)

1. **Detection** – On each pomodoro engine tick (100 ms), if the store is hydrated and there is an active run whose **local start date** is **before** “today”, and the phase hasn’t already hit the deadline notification, we split.

2. **First segment (previous calendar day)** – Logged with:
   - `endedAtMs` = **local** `23:59:59.999` for the day that contains `phaseStartedAtMs` (via `endOfLocalDayMs`).
   - Pauses: closed spans are **clipped** to that day; an **open** pause is closed in the log at `endedAtMs`.

3. **Continuation (new calendar day)** – New `activePhaseRun` with:
   - `phaseStartedAtMs` = **00:00:00.000** next local day (`endOfDay + 1`).
   - `intendedDurationMs` = `round(deadline − startOfNewDay)` where `deadline` is the same `flipClockEndsAtMs` as before the split (running or paused).
   - `pauses` = tails of any pause spans that continue past midnight.
   - `openPauseStartMs` = `00:00:00.000` if it was paused, else `null`.
   - `midnightSplitContinuation: true` so the UI can treat it as the same logical session.

4. **`finalizeActivePhase`** – Still uses “now”; it delegates to **`finalizeActivePhaseWithEndedAt(endedAtMs, opts?)`**, which supports a pre-built `pausesForEntry` for the midnight case.

### UI (`Pomodoro.tsx`)

- **`useActivePhaseMidnightContinuation()`** – When true, the intro chime effect only syncs the ref and **does not** play the intro again for the post-midnight segment.

### Tests (`__tests__/pomodoroMidnightSplit.test.ts`)

- Local bounds (end of day + next midnight).
- Pause partitioning across midnight.
- Full split: shortened duration + log `endedAtMs`.
- Paused continuation: open pause from midnight.

### Test-only exports

`__midnightSplitBoundsForTests`, `__partitionPausesForMidnightSplitForTests`, `__injectPomodoroMinimalStateForTests`, `__getPomodoroActivePhaseRunForTests`, `__getPomodoroDayLogEntriesForTests`, `__runMidnightSplitForTests`.

Active-session JSON stays compatible: `midnightSplitContinuation` is optional on parse; only `true` is persisted when set.

