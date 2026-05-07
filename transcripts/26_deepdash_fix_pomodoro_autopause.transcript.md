# Audio-based pomodoro session management
_Exported on 5/7/2026 at 09:12:27 GMT+2 from Cursor (3.2.16)_

---

**User**

@app/_components/Pomodoro.tsx:406-429 This works but generates a lot of false positives. We'll implement an audio playback-based solution instead.

Let's remove usePauseOnTimeDrift and implement usePauseOnAudioPause. The hook should start playing @public/silence.mp3 in a loop when a new pomodoro session or rest session is started. When the playbak is paused, the hook should also pause the running session.

That's the whole logic. It's really simple. It relies on the fact that the browser stops all audio/video playback when laptops lid is closed. I think it will generate far less false-positives than what we have now.

---

**Cursor**

Now I have enough context. Let me implement the change.

The replacement is in place. Here's a summary of the change:

- Removed `usePauseOnTimeDrift` along with its `POMODORO_TICK_MS`, `TICK_DRIFT_THRESHOLD_MS`, and `PAUSE_STREAK_THRESHOLD` constants and the `console.log` debug calls.
- Added `usePauseOnAudioPause`, which mirrors the same `running`/`paused` gating pattern.

The new hook:

```380:412:app/_components/Pomodoro.tsx
function usePauseOnAudioPause(): void {
  // Browsers stop all audio playback when the laptop lid is closed (and in some
  // similar suspend-like situations). We piggy-back on that by looping a silent
  // track for the duration of an active phase: if the audio gets paused while
  // the phase is still supposed to be running, we treat it as a signal to pause
  // the pomodoro session too.
  const running = useIsRunning();
  const paused = useIsPaused();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!running || paused) return;

    const audio = new Audio(POMODORO_SILENCE_MP3);
    audio.loop = true;
    audio.preload = "auto";

    const handlePause = (): void => {
      pomodoroActions.pause();
    };
    audio.addEventListener("pause", handlePause);

    void audio.play().catch((err: unknown) => {
      log.error("pomodoro: failed to play silence loop", err);
    });

    return () => {
      audio.removeEventListener("pause", handlePause);
      audio.pause();
      audio.src = "";
    };
  }, [running, paused]);
}
```

A few notes on behavior:

- The effect only attaches when there's a phase that's actively running (not paused). When the user pauses or the phase ends, cleanup runs first — we remove the listener before calling `audio.pause()`, so cleaning up doesn't fire a recursive `pomodoroActions.pause()`.
- `play()` requires a user gesture in most browsers. Since `running` flips to `true` from a click on Start/Resume, that's fine. If the page boots with a persisted running session and there's no gesture yet, `play()` rejects, we just log it, and no spurious `pause` event fires (the audio never started). The session keeps ticking — the user can simply pause/resume to re-arm the watchdog.
- `silence.mp3` already existed in `public/`.
- `useRef` is still imported and used elsewhere in the file, so no import cleanup needed. Linter is clean.

---

**User**

It works.

I think we should also extract the sound playing logic from usePomodoroMechanics and create another hook named usePomodoroSounds.

---

**Cursor**

Let me look at the rest of the file to fully plan the extraction.

Now I'll do the extraction. The trick is that the existing main-chime "play" trigger flows through `pomodoroActions.init`'s `onPhaseDeadlineCrossed` callback. To keep init in the mechanics hook and move the audio entirely out, I'll detect the transition into `deadlineCrossed` via a "previous value" ref — this preserves the existing behavior of not auto-playing the main chime when the page loads with an already-crossed phase.

Done. Here's what changed:

- `Pomodoro` now calls three sibling hooks: `usePomodoroMechanics()`, `usePomodoroSounds()`, `usePauseOnAudioPause()`.
- `usePomodoroMechanics` is now lean — it owns store init (passing `phaseCompleteNotification` as the only `onPhaseDeadlineCrossed` callback), notification permission, and returns `[phase, running, paused]`.
- `usePomodoroSounds` owns all chime audio: the audio element refs, intro/main `Audio` lifecycle, the intro chime trigger (1–4s before deadline, with the existing `runStartedAt` debounce), and the main chime start/stop driven by `deadlineCrossed`.

Notable detail in the refactor: the previous code started the main chime from inside `pomodoroActions.init`'s `onPhaseDeadlineCrossed` callback, which fires exactly once per real-time deadline crossing. To preserve that behavior without keeping the audio coupled to the init callback, the sounds hook now watches `deadlineCrossed` and uses a `prevDeadlineCrossedRef` initialized to the current value:

```369:388:app/_components/Pomodoro.tsx
  useEffect(() => {
    const mainEl = mainAudioRef.current;
    if (!mainEl) return;
    const justCrossed = deadlineCrossed && !prevDeadlineCrossedRef.current;
    prevDeadlineCrossedRef.current = deadlineCrossed;
    if (justCrossed) {
      const introEl = introAudioRef.current;
      if (introEl) {
        introEl.pause();
        introEl.currentTime = 0;
      }
      mainEl.currentTime = 0;
      void mainEl.play().catch((err: unknown) => {
        log.error("pomodoro: failed to play main chime loop", err);
      });
    } else if (!deadlineCrossed) {
      mainEl.pause();
      mainEl.currentTime = 0;
    }
  }, [deadlineCrossed]);
```

This means:
- A real-time false → true transition still kicks off the main chime (and stops any tail of the intro chime, matching the old callback's behavior).
- Mounting with `deadlineCrossed` already true (e.g. after a refresh on a phase whose deadline already passed) does not auto-replay the chime, which matches the previous semantics where the init callback only fired during real-time crossings.
- A true → false transition (e.g. user advanced to next phase) still stops and resets the loop.

Linter is clean; no unused imports left over since the selectors moved with the audio logic.

