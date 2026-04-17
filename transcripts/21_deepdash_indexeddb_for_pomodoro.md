# IndexedDB implementation for pomodoro logs
_Exported on 4/17/2026 at 15:42:16 GMT+2 from Cursor (2.6.21)_

---

**User**

We need to use IndexedDB instead of localStorage for storing work log. All other data connected with the pomodoro module should remain in the localStorage.

We want to store each pomodoro log as a separate record in the IndexedDB and create an index on "day" field (which should be a day string). Please use the same patterns and file layout as in @lib/todoIndexedDb.ts.

The @app/_stores/pomodoroStore.ts should also be changed to be able to store each tasks one-by-one instead of all day's tasks. When the user is adding a new task, a single record should be added to the database and nothing else should change. When the user is modifying a task, also only a single record should be changed in the database. Please use the same patterns for communication with the DB as in @app/_stores/todoStore.ts. Debouncing is not needed for pomodoro.

---

**Cursor**


Migrating the pomodoro work log to IndexedDB using patterns from `todoIndexedDb.ts` and `todoStore.ts`. Reading the relevant files.




Continuing to read `todoStore.ts` persistence patterns and export/import integration.




Implementing `lib/pomodoroIndexedDb.ts`, updating `persistKeys`, refactoring `pomodoroStore` for per-entry IDB writes and async load/export, and updating `dataExport` and tests.




Adding `getAllPomodoroLogRecordsGroupedByDay` to the IDB module and updating `pomodoroStore.ts`.




Updating `pomodoroStore.ts` in logical sections.




Adding a Jest test for legacy localStorage → IndexedDB migration.




Closing the cached DB connection before `deleteDatabase` so tests don't hang when connections stay open.




Here’s what was implemented.

### IndexedDB layer (`lib/pomodoroIndexedDb.ts`)
- Database `deepdash.pomodoro.v1`, store `workLogEntries`, `keyPath: "id"`, index **`day`** (calendar `YYYY-MM-DD`).
- Each row is one completed phase block: `id`, `day`, `phase`, `startedAtMs`, `endedAtMs`, `pauses`.
- Helpers aligned with `todoIndexedDb`: `applyPomodoroLogWrites`, `getSortedPomodoroLogRecordsForDay`, `getAllPomodoroLogRecordsGroupedByDay`, `collectPomodoroLogsForExport`, `replaceAllPomodoroLogsFromImport`, `migrateLegacyPomodoroLocalStorageToIndexedDb`, `__resetPomodoroDatabaseForTests` (closes the cached DB before `deleteDatabase` so Jest doesn’t hang).

### `persistKeys`
- `POMODORO_IDB_LEGACY_MIGRATED_KEY` — migration from the old `POMODORO_LOGS_KEY` blob is one-time; the legacy key is removed after a successful migration (same idea as todos).

### `pomodoroStore.ts`
- **Config** stays on **`localStorage`** (`POMODORO_CONFIG_KEY`); subscribe only runs `persistConfigIfChanged` (no log blob).
- In-memory **`dayLogs`** now use **`PomodoroLogEntryStored`** (`PomodoroLoggedPhase & { id: string }`).
- **`finalizeActivePhase`** appends one entry, then enqueues a **single** `applyPomodoroLogWrites({ putRecords: […] })` on a **`persistTail`** queue (same chaining idea as `todoStore`, no debouncing).
- **Load** is **`loadFromStorageAsync`** (migration + hydrate from IDB); **`init`** kicks it off like todos.
- **`exportData` / `importData`** are **async**; import calls `replaceAllPomodoroLogsFromImport` then **`hydrateDayLogsFromIndexedDb`**. Export JSON shape is unchanged (`logs.days` without per-entry ids).
- **`flushPomodoroPersistToStorage`** and **`__awaitPomodoroStoreHydrationForTests`** exported for export/tests.

### `lib/dataExport.ts`
- **`await pomodoroActions.exportData()`** and **`await pomodoroActions.importData(...)`** in the internal import path.

### Tests
- **`__tests__/pomodoroIndexedDb.test.ts`** — legacy `localStorage` migration + idempotent case.
- **`dataExport.test.ts`** — `await pomodoroActions.importData`, reset pomodoro IDB in `beforeEach`.

There is still no UI to **edit** a completed log line; when you add that, update the in-memory entry and call **`applyPomodoroLogWrites`** with a single **`putRecords`** for that `id` (same pattern as todo’s `persistTaskById`).

---

**User**

@app/_stores/pomodoroStore.ts:61 Shouldn't we have just a single day log?

---

**Cursor**


Tracing how `dayLogs` is used across the codebase to determine if we can keep only today's log in memory.




Using a single in-memory bucket (`dayKey` + `dayLog`), mirroring `todoStore`. Loading only today's rows from IndexedDB; adding a calendar-day sync when the local day changes.




Refactoring the store to `dayKey` + `dayLog` (today’s bucket only), hydrating with `getSortedPomodoroLogRecordsForDay`, adding calendar-day sync, and deferring `nextPhase` until after `persistTail` so long-break counting stays correct when the bucket switches.




Yes. The UI and timer logic only need **today’s** completed blocks in memory; older days live in IndexedDB and are still included in export via `collectPomodoroLogsForExport()`.

The store is now aligned with **`todoStore`**: **`dayKey`** (local `YYYY-MM-DD`) plus **`dayLog`** (`entries` for that day only). Initial load calls **`hydrateTodayLogFromIndexedDb()`** (IndexedDB read for **today** via `getSortedPomodoroLogRecordsForDay`). A **1s interval** and **visibility** handler run **`syncPomodoroCalendarDayIfNeededAsync`** so when the calendar day rolls over we flush the log queue and reload today’s rows.

`nextPhase` defers choosing short vs long break to **`persistTail.then(...)`** so:

1. If the completed phase lands on a **different** day than the in-memory bucket, the async branch can load that day from IndexedDB and append first.  
2. **`countPomodoroSessions`** / **`nextBreakType`** run after that work, so long-break cadence stays correct.

`getAllPomodoroLogRecordsGroupedByDay` was removed from `pomodoroIndexedDb.ts` as it’s no longer needed for hydration.

---

**User**

@app/_stores/pomodoroStore.ts:245 This could result in a flash of a placeholder in the UI. We probably should rollover if the day key is wrong before taking a snapshot just return the data we have in the store. It will rollover at some point.

---

**Cursor**


Showing the in-memory `dayLog` until calendar sync updates `dayKey`, avoiding an empty flash. Updating `useTodayWorkMsDisplay` if it uses the same guard.




Here’s what changed:

1. **`useTodayPomodoroDaySlice`** — Always returns `snap.dayLog.entries` (whatever bucket is loaded). No more `[]` when `dayKey` lags behind `localDayKey()` after midnight.

2. **`useTodayWorkMsDisplay`** — Sums work time from `snap.dayLog.entries` the same way, without the `dayKey === day` check, so totals don’t drop to zero during that gap.

The JSDoc on `useTodayPomodoroDaySlice` now states that, until `syncPomodoroCalendarDayIfNeededAsync` runs, the list can still be the previous calendar day’s data, which avoids the empty placeholder flash.

---

**User**

Currently, we don't store the active session. We should change that.

I'm thinking that we could use localStorage to store the currently active session.

Also:
1. When the user leaves the page we should pause the active session and store it.
2. Just in case if 1 failed, when loading we could check if the loaded active session is paused, if not then modify the history by either reopening last pause or removing the active session if there was no pause.

---

**Cursor**


Exploring how the active phase run is structured and where persistence hooks belong.




Implementing localStorage persistence for the active session, pausing and saving on page leave, and reconciling a “running” session on load when unload-save didn’t run.




Adding the persist key and implementing active-session load/save, pause-on-leave, and load reconciliation.




Here’s what was implemented.

### `lib/persistKeys.ts`
- **`POMODORO_ACTIVE_SESSION_KEY`** (`deepdash.pomodoro.activeSession.v1`)
- Legacy migration from `worktools.pomodoro.activeSession.v1` when present

### `app/_stores/pomodoroStore.ts`
- **`PomodoroActiveSessionFileV1`** — `{ version: 1, phase, activePhaseRun }` written to localStorage whenever there is an active run; **key removed** when idle (same pattern as “no blob when empty”).
- **`subscribe`** — after hydration, **`persistActiveSessionIfChanged()`** runs next to config (dirty JSON compare via `lastActiveJson`).
- **`pagehide` / `beforeunload` / init cleanup** — **`pauseActiveSessionForUnload()`** (if the timer is running, set `openPauseStartMs = Date.now()`), then **`writeActiveSessionFileToLocalStorage()`**, then IndexedDB flush — so leaving the page prefers a **paused** snapshot.
- **`visibilitychange` (hidden)** — **no pause** (tab switch only): save current active session + IDB flush so a running session can be restored if the tab is killed without `pagehide`.
- **Load** — after day log hydration, **`loadActiveSessionFromStorage()`** parses the file; then **`reconcileActiveSessionAfterLoad`**:
  - Already **paused** (`openPauseStartMs != null`) → keep as-is  
  - **Running** and **`pauses.length > 0`** → treat as unsafe after possible crash → **pause now** (`openPauseStartMs = Date.now()`)  
  - **Running** and **no pauses** → **drop** active session (clear storage)
- **`importData`** — **`clearActiveSessionStorage()`** so imports don’t revive an old in-flight session.

### Tests
- **`__tests__/pomodoroActiveSession.test.ts`** — three cases for **`__reconcileActiveSessionAfterLoadForTests`**

Full history export is unchanged; the active session stays **out of** the JSON bundle and only lives under **`POMODORO_ACTIVE_SESSION_KEY`**.

---

**User**

- @app/_stores/pomodoroStore.ts:117 Should be at the top with other constants.
- @app/_stores/pomodoroStore.ts:137 Same.
- @app/_stores/pomodoroStore.ts:876-883 Create a completely separate try catch for loading active session instead of loading in two places in the code.

---

**Cursor**


Moving both version constants to the top constants block and consolidating active-session loading into a single try/catch after the main load.




Summary of changes:

### Version constants
- **`POMODORO_EXPORT_VERSION`** and **`POMODORO_ACTIVE_SESSION_FILE_VERSION`** are declared together in the top constants section (right after `DAY_CHECK_INTERVAL_MS`), each with a short comment.
- The duplicate declarations next to the types were removed. **`PomodoroExportV1`** and **`PomodoroActiveSessionFileV1`** are unchanged and still use `typeof` those constants.

### `loadFromStorageAsync`
- The first **`try` / `catch`** only handles config + IndexedDB migration + today’s day log.
- A **second, separate `try` / `catch`** always runs **`loadActiveSessionFromStorage()`** (whether the first block succeeded or failed), so active session loading lives in one place.
- On failure it logs **`pomodoro: failed to load active session from storage`**, clears the run, storage, and `lastActiveJson`.

