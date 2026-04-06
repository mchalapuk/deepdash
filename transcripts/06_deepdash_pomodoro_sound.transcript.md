# Pomodoro sound implementation
_Exported on 4/3/2026 at 16:03:08 GMT+2 from Cursor (2.6.21)_

---

**User**

We need to play actual sounds in the @app/_components/Pomodoro.tsx component.

What needs to happen:
1. 4 seconds before the deadline, we need to play @public/PomodoroChime_intro.wav 
2. Exactly on the deadline we start playing @public/PomodoroChime_main.wav in a loop until the user moves to the next phase.

The sound files are quite large so they need to start downloading right after the page loads.


---

**Cursor**


Implementing Pomodoro sound playback with preloading. Reading the component and store to see how timing and phase transitions work.




Checking whether the store is exported and reviewing REACT_STYLEGUIDE for patterns.




Adding two small store hooks for stable run identity and deadline state, then implementing preloaded HTMLAudio playback in `Pomodoro.tsx`. Replacing the oscillator chime with WAV intro (once in the last 4s) and looping main (from deadline until phase change).




Removing redundant `fetch` calls to avoid duplicate downloads; `preload="auto"` and `load()` start the download.




Here is what was implemented.

### Behavior
- **Preload:** On mount, two `HTMLAudioElement` instances are created with `preload="auto"` and `.load()` so the browser starts fetching `/PomodoroChime_intro.wav` and `/PomodoroChime_main.wav` as soon as `Pomodoro` mounts (same-origin static files under `public/`).
- **Intro:** While the timer is **running** and **not paused**, when the flip countdown first enters the last four seconds (`useSecondsRemaining()` in 1–4, i.e. aligned with the ceil-based display), the intro plays **once** per run (keyed by `phaseStartedAtMs`).
- **Main loop:** When the store fires `onPhaseDeadlineCrossed`, any intro playback is stopped, `PomodoroChime_main.wav` is started from the beginning with `loop = true`, and the desktop notification still runs.
- **Stop:** When `deadlineCrossedNotified` goes back to false (next phase, skip, tab change, reset), the main clip is paused and rewound.

### Code changes
- **`pomodoroStore.ts`:** Exported `useActivePhaseRunStartedAt()` and `useActivePhaseDeadlineCrossed()` so the UI can key the intro and stop the loop without touching the proxy from outside.
- **`Pomodoro.tsx`:** Replaced the Web Audio oscillator with the WAV flow above; removed `AudioContext` / `playPhaseChime`.

### Note
Intro timing follows **`Math.ceil` seconds remaining** (same idea as the flip timer), so the intro starts when the UI first shows **4** and won’t repeat for that run. Browsers may still block `play()` until there has been a user gesture (e.g. **Start**); errors from that are ignored so the app doesn’t break.

---

**User**

@app/_components/Pomodoro.tsx:273 Please log an error here.
@app/_components/Pomodoro.tsx:304 And here.
 
Also, please play the audio at 50% volume.

---

**Cursor**


Adding the logger import, setting `volume = 0.5` on both audio elements, and logging errors in both `.catch()` handlers.




Here’s what changed:

1. **`import log from "@/lib/logger"`** — same logger as the stores (`loglevel`, default level `warn`; **`error` still prints**).

2. **Volume** — right after creating the elements: `intro.volume = 0.5` and `main.volume = 0.5`.

3. **Catch handlers** — `log.error("pomodoro: failed to play main chime loop", err)` and `log.error("pomodoro: failed to play intro chime", err)` so failures (autoplay, decode, etc.) are recorded with context.

---

**User**

The audio seems a little bit out of sync with the clock. It's because the animation takes 0.7 seconds. It's probably a good idea to trigger every clock amination 400ms early.

---

**Cursor**


Inspecting how the flip timer receives time and animates so we can offset it by 400ms.




Adding a store hook that applies a 400ms lead to the remaining-time calculation (same as subtracting 400ms from remaining before `ceil`), and using it only for `FlipTimer` so audio and engine logic stay wall-clock based.




Here’s what changed:

### `pomodoroStore.ts`
- **`FLIP_DISPLAY_LEAD_MS = 400`** — single place to tune the lead.
- **`useFlipSecondsRemaining()`** — same deadline and wall clock as `useSecondsRemaining()`, but uses  
  `Math.ceil((remMs - FLIP_DISPLAY_LEAD_MS) / 1000)`  
  so each flip is triggered **400ms sooner** than the strict wall-clock second.

### `Pomodoro.tsx`
- **`Countdown`** now passes **`useFlipSecondsRemaining()`** into **`FlipTimer`** instead of **`useSecondsRemaining()`**.

Intro chime, deadline engine, and **`usePomodoroMechanics`** still use **`useSecondsRemaining()`**, so audio and notifications stay on real time; only the flip UI is shifted early so the ~0.7s animation finishes closer to the real second. If you want cues tied to what’s on the dial, we can switch those to **`useFlipSecondsRemaining()`** as well.

