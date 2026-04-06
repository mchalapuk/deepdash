# Today's work component design
_Exported on 4/3/2026 at 22:25:45 GMT+2 from Cursor (2.6.21)_

---

**User**

Please create a TodaysWork component that displays total time of today's pomodoro sessions and a list of all pomodoro sessions from today (with sublists of pauses).

This should be a new component, separate from @app/_components/Pomodoro.tsx.

Please use the component on @app/page.tsx .

---

**Cursor**


Exploring the pomodoro store and components to learn how sessions and pauses are modeled, then implementing TodaysWork and adding it to the page.




Implementing `TodaysWork`: using `dayLogs` + `localDayKey`, `useTodayWorkMsDisplay` for totals, and listing work entries with nested pauses. Adding a live clock tick when a work session is active so totals and in-progress pauses update.




Fixing malformed JSX in the active-session header and correcting PauseSublist: show "(ongoing)" only when the last pause is the open pause.




Exporting `pomodoroStore` so the component can subscribe with `useSnapshot`.




Fixing readonly snapshot types from Valtio:




Here’s what was added and changed.

### `TodaysWork` (`app/_components/TodaysWork.tsx`)
- **Total:** Uses `useTodayWorkMsDisplay()` so the headline matches the store (completed work today + focused time in an active work run).
- **Sessions:** Lists **work** phases for the local calendar day (`localDayKey()`), in order: completed entries from `dayLogs`, then an extra **in progress** row when `activePhaseRun` is work.
- **Pauses:** Nested list per session with start–end times, duration, and **(ongoing)** on the last pause when the timer is paused mid-session.
- **Live updates:** `useLiveNowMs` runs a 1s tick while a work phase is active so in-progress duration and open pauses stay current (and re-renders refresh `useTodayWorkMsDisplay()`’s active-work slice).

### `app/page.tsx`
- Renders `<TodaysWork />` under `<Pomodoro />`.

### `app/_stores/pomodoroStore.ts`
- **`pomodoroStore` is exported** so `TodaysWork` can `useSnapshot` it. Mutations should still go through `pomodoroActions`.

Styling follows the same dark `Paper` treatment as `Pomodoro`. Breaks are **not** listed here—only **pomodoro (work)** sessions, as in “today’s pomodoro sessions.”

---

**User**

@app/_stores/pomodoroStore.ts:27-28 This is not compliant with the style guide.

---

**Cursor**


Reverting the proxy to private per STORE_STYLEGUIDE.md (“Never export the proxy”) and adding a store hook that exposes today’s entries and `activePhaseRun` for `TodaysWork`.




Here’s what was wrong and what we changed.

**[STORE_STYLEGUIDE.md](STORE_STYLEGUIDE.md)** says the proxy must stay private: *“Never export the proxy. Use it only in exported reactive hooks … and inside action methods.”*

**Updates:**
1. **`pomodoroStore.ts`** — `export const pomodoroStore` is now **`const pomodoroStore`** again (module-private).
2. **`useTodayPomodoroDaySlice()`** — New hook that returns `{ todayEntries, activePhaseRun }` from a single `useSnapshot(pomodoroStore)` so UI can subscribe without touching the proxy.
3. **`TodaysWork.tsx`** — Uses `useTodayPomodoroDaySlice()` and drops the `pomodoroStore` / `useSnapshot` import.

`subscribe(pomodoroStore, …)` and direct proxy access inside `pomodoroActions` are unchanged and still match the guide.

