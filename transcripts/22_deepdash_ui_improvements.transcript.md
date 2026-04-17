# Pomodoro timer phase issue
_Exported on 4/17/2026 at 22:43:16 GMT+2 from Cursor (3.1.15)_

---

**User**

@app/_components/Pomodoro.tsx:97 When the page is loaded the currently active phase is always paused. But the secondsRemaining returned here behaves like the timer is still running. When coming back to the page after several hours it returns -several hours. It all comes back to normal after unpausing.

---

**Cursor**


Tracing how `useFlipSecondsRemaining` computes time and how it interacts with the paused state on load.




Identifying the issue: when paused, `phaseRunNeedsWallClock` is false, so `useWallNowMs` sets time once to `Date.now()` at load and doesn't tick. `flipClockEndsAtMsAt` ignores that `now` for `endsAt` (it uses pause anchor + remaining), but we still compute `endsAt - nowMs`, so `nowMs` must track wall time — using load time makes `endsAt - nowMs` wildly negative after a long absence. Fixing by computing remaining from frozen pause state (`remainingCountdownMs(r, r.openPauseStartMs)`) when paused. Checking `useCurrentPhaseExpired` and tests.




Implementing the fix: when paused, `flipClockEndsAtMsAt` ignores `nowMs` and returns `openPauseStartMs + remainingAtPause`, but `useFlipSecondsRemaining` subtracts `useWallNowMs(false)` — which is set once to `Date.now()` on load — so `endsAt - nowMs` shrinks as wall time passes after the pause. Using frozen `remainingCountdownMs(r, r.openPauseStartMs)` when `openPauseStartMs` is set.




Here’s what was going wrong and what we changed.

### Cause

For a **paused** run, `phaseRunNeedsWallClock` is false, so `useWallNowMs` only runs **`Date.now()` once** (in `useLayoutEffect`) and does not advance.

`flipClockEndsAtMsAt` in the paused branch **does not use that `now` for the deadline** — it returns  
`openPauseStartMs + remainingCountdownMs(r, openPauseStartMs)`, i.e. a fixed instant from when you paused.

The hooks still did **`endsAt - nowMs`** with `nowMs` = time at **page load**. So after a long absence, `nowMs` was “now” but `endsAt` was still “shortly after the pause”, which makes the difference **large and negative** — as if the timer had kept running in real time while it was paused.

Unpausing fixes it because you close the open pause, `needsWallClock` becomes true again, and `nowMs` tracks wall time in a way that matches `runEndWallMs` again.

### Fix

When `openPauseStartMs != null`, **`useSecondsRemaining`**, **`useFlipSecondsRemaining`**, and **`useCurrentPhaseExpired`** now use **`remainingCountdownMs(r, r.openPauseStartMs)`** (same frozen remaining as the rest of the model) instead of `endsAt - nowMs`.

Hooks still call `useWallNowMs(needsWallClock)` unconditionally so the rules of hooks stay valid.

```177:218:app/_stores/pomodoroStore.ts
export function useCurrentPhaseExpired(): boolean {
  const snap = useSnapshot(pomodoroStore);
  const needsWallClock = phaseRunNeedsWallClock(snap.activePhaseRun);
  const nowMs = useWallNowMs(needsWallClock);
  const r = snap.activePhaseRun;
  if (r?.openPauseStartMs != null) {
    return remainingCountdownMs(r, r.openPauseStartMs) <= 0;
  }
  return nowMs >= flipClockEndsAtMsAt(snap, nowMs);
}

/** Seconds until the deadline; negative after the wall-clock deadline while the phase stays active. */
export function useSecondsRemaining(): number {
  const snap = useSnapshot(pomodoroStore);
  const needsWallClock = phaseRunNeedsWallClock(snap.activePhaseRun);
  const nowMs = useWallNowMs(needsWallClock);
  const r = snap.activePhaseRun;
  if (r?.openPauseStartMs != null) {
    return Math.ceil(remainingCountdownMs(r, r.openPauseStartMs) / 1000);
  }
  const endsAt = flipClockEndsAtMsAt(snap, nowMs);
  return Math.ceil((endsAt - nowMs) / 1000);
}

/**
 * Same source as {@link useSecondsRemaining}: wall clock while running, frozen remaining while
 * paused. When running, flips lead by ~{@link FLIP_DISPLAY_LEAD_MS} so the animation finishes
 * closer to the real second boundary.
 */
export function useFlipSecondsRemaining(): number {
  const snap = useSnapshot(pomodoroStore);
  const needsWallClock = phaseRunNeedsWallClock(snap.activePhaseRun);
  const nowMs = useWallNowMs(needsWallClock);
  const r = snap.activePhaseRun;
  if (r?.openPauseStartMs != null) {
    const remMs = remainingCountdownMs(r, r.openPauseStartMs);
    return Math.ceil((remMs - FLIP_DISPLAY_LEAD_MS) / 1000);
  }
  const endsAt = flipClockEndsAtMsAt(snap, nowMs);
  const remMs = endsAt - nowMs;
  return Math.ceil((remMs - FLIP_DISPLAY_LEAD_MS) / 1000);
}
```

Pomodoro-related Jest tests still pass.

---

**User**

@app/_components/TodaysTodo/TodoPersistedRow.tsx:152-196 We want to wrap each of those ActionIcons in a Tooltip that says th same thing as aria-label. we want it to appear on top right and have an arrow.

---

**Cursor**


Adding Mantine `Tooltip` with `position="top-end"` (top-aligned, toward the end/right) and `withArrow`.




Here’s what changed:

### Updates
- Imported **`Tooltip`** from `@mantine/core`.
- Introduced **`moveLabel`** and **`reorderLabel`** so the tooltip **`label`** matches **`aria-label`** (same strings as before).
- Wrapped both **`ActionIcon`**s in **`Tooltip`** with:
  - **`position="top-end"`** — above the control, aligned to the end (top-right in LTR).
  - **`withArrow`** — shows the arrow.
- Set **`events={{ hover: true, focus: true, touch: true }}`** so the hint shows on hover, keyboard focus, and touch; say if you want hover-only.

Mantine’s `top-end` placement is the usual way to get a top + right-aligned tooltip with the arrow on that side.

---

**User**

@app/_components/WorldClocks.tsx:217-226 Let's do the same for this icon.

---

**Cursor**


Updates in `WorldClocks.tsx`:

- Importing **`Tooltip`**.
- **`removeLabel`** holds `Remove clock ${timeZone}` and is used for both **`label`** and **`aria-label`**.
- **`Tooltip`** wraps the trash **`ActionIcon`** with **`position="top-end"`**, **`withArrow`**, and the same **`events`** as in `TodoPersistedRow`.

---

**User**

@app/_components/WorldClocks.tsx:342-351 And this one.

---

**Cursor**


Wrapping the add-column `ActionIcon` with `Tooltip`. `Tooltip` is already imported.




Update applied: the expand **`ActionIcon`** is wrapped in **`Tooltip`** with **`label={addAriaLabel}`** (same as **`aria-label`**), **`position="top-end"`**, **`withArrow`**, and the same **`events`** as the other world-clock tooltips. No new import was required.

---

**User**

@app/_components/WorldClocks.tsx:329-338 And this one.

---

**Cursor**


Update applied: the cancel **`ActionIcon`** in the Autocomplete **`rightSection`** is wrapped in **`Tooltip`** with **`label={cancelAriaLabel}`**, **`position="top-end"`**, **`withArrow`**, and the same **`events`** as the other icons.

---

**User**

@app/_components/Pomodoro.tsx:222-232 And this one.

---

**Cursor**


Summary of changes:

- Imported **`Tooltip`** from `@mantine/core`** (imports sorted with **`Paper`** before **`Stack`**).
- Added **`skipLabel`** and wired it to **`Tooltip`**, **`aria-label`**, and the icon **`title`**.
- Wrapped the skip **`ActionIcon`** with **`position="top-end"`**, **`withArrow`**, and the same **`events`** as your other tooltips.

---

**User**

@app/_components/Pomodoro.tsx:134-152 And those two

---

**Cursor**


Wrapping both stepper `ActionIcon`s in `Tooltip`. `Tooltip` is already imported.




Update complete. In `Countdown`, **`addMinuteLabel`** and **`removeMinuteLabel`** mirror the previous **`aria-label`** strings, and each stepper **`ActionIcon`** is wrapped in **`Tooltip`** with **`position="top-end"`**, **`withArrow`**, and the same **`events`** as your other tooltips. **`Tooltip`** was already imported from the skip-button change.

