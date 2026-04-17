# IndexedDB implementation for todo tasks
_Exported on 4/17/2026 at 14:17:58 GMT+2 from Cursor (2.6.21)_

---

**User**

We need to use IndexedDB instead of localStorage for storing tasks. All other data connected with the todo module should remain in the localStorage.

We want to store each task as a separate record in the IndexedDB and create an index on "day" field (which can be a day string or "backlog" for tasks which are in the backlog).

The @app/_stores/todoStore.ts should also be changed to be able to store each tasks one-by-one instead of all day's tasks. When the user is adding a new task, a single record should be added to the database and nothing else should change. When the user is modifying a task, also only a single record should be changed in the database.

Please ensure that all tasks currently stored in localStorage are properly migrated to the IndexedDB.

---

**Cursor**


Exploring the todo store, persistence layer, and any existing IndexedDB code to implement per-task IndexedDB storage with migration.




Checking tests, firstRunSeed, and package.json for IndexedDB setup.




Checking how other stores initialize relative to the seed:




Implementing the IndexedDB layer and refactoring the todo store. Creating files and applying changes.




Implementing the todo store refactor: updating imports and removing the subscription-based debounced persist.




Fixing `moveItemRelative` (capture neighbor id before splice) and stabilizing merge persistence.




Adding a `structuredClone` polyfill for Node, exposing a test helper to await hydration, and updating tests.




Here’s what was implemented:

### IndexedDB (`lib/todoIndexedDb.ts`)
- Database **`deepdash.todo.v1`**, object store **`tasks`** with `keyPath: "id"`.
- Index **`day`** on field `day` (values are `YYYY-MM-DD` or **`backlog`** via `TODO_IDB_BACKLOG_DAY`).
- Each row: `{ id, day, text, done, rank }` (`rank` is used for ordering within a day/backlog).
- Helpers: open DB, get/put/delete one task, list by day, full export/import replace, legacy **localStorage → IndexedDB** migration.

### `localStorage` (todo-related only)
- **Still used:** rollover markers (`TODO_AUTO_ROLLOVER_MARKER_PREFIX`), **`TODO_IDB_LEGACY_MIGRATED_KEY`** (one-time migration done), **`TODO_TASKS_ANY_FLAG_KEY`** (hint that tasks exist, for first-run seed before async IDB checks).
- **No longer used for task bodies:** per-day JSON (`TODO_DAY_*`) and **`TODO_BACKLOG_STORAGE_KEY`** are removed after migration (tasks live only in IDB).

### `app/_stores/todoStore.ts`
- Removed the Valtio **`subscribe` + debounced full-day write**.
- Each mutation **`enqueueTodoPersist`** runs **one (or a minimal number of) IndexedDB** operations (e.g. text/done → single `put`; add → single `put`; merge → delete + put; reorder → two `put`s for rank swap).
- Load is **`async`**: legacy merge → open IDB → **`migrateLegacyTodoLocalStorageToIndexedDb()`** → load today + backlog → rollover.
- **`exportData`** / **`importData`** are **`async`** (IndexedDB). **`flushTodoPersistToStorage`** awaits the persist queue.
- **`__awaitTodoStoreHydrationForTests`** (tests only) waits for the initial load.

### Other wiring
- **`lib/dataExport.ts`**: `collectDeepdashExport`, `runDeepdashJsonImportFromText`, `applyDeepdashImportWithRollback` are **`async`** and **`await`** todo flush/import.
- **`DataImportExport.tsx`**: `await collectDeepdashExport` / `await runDeepdashJsonImportFromText`.
- **`lib/firstRunSeed.ts`**: async seed; treats **`TODO_TASKS_ANY_FLAG_KEY`** and **`countAllTodoTaskRecords()`** as “has todo data”.
- **`AppProviders.tsx`**: waits for **`maybeApplyFirstRunSeedBundle()`** before rendering children so IDB + LS are ready.
- **`jest.setup.cjs`**: `fake-indexeddb/auto` + **`structuredClone`** polyfill for Node; **`jest.config.cjs`** uses `setupFilesAfterEnv`.

### Migration
On first load after upgrade, **`migrateLegacyTodoLocalStorageToIndexedDb`** reads all legacy day blobs and the global backlog key, writes **one IDB record per task**, then **removes** those `localStorage` keys and sets the migration marker.

All **20** Jest tests pass, and **`tsc --noEmit`** is clean.

---

**User**

Good but I don't like that we're exporting functions on multiple levels of abstractions in @lib/todoIndexedDb.ts .

- @lib/todoIndexedDb.ts:50 We could refactor so that this function is not exported.
- @lib/todoIndexedDb.ts:78 And this one.
- @lib/todoIndexedDb.ts:111 And this one.

---

**Cursor**


Searching for usages of those exports so we can make them module-private.




Reading `todoIndexedDb.ts` and `todoStore.ts` to implement internal helpers and update call sites.




Making the three functions module-private and exposing higher-level operations used by `todoStore`. Merging test DB reset into a single async `__resetTodoDatabaseForTests`.




Here’s what changed:

### `lib/todoIndexedDb.ts`
- **`openTodoDatabase`** – module-private (no `export`).
- **`deleteTodoDatabase`** – removed; **`__resetTodoDatabaseForTests`** is now **`async`**, clears `dbPromise`, and runs **`deleteDatabase`** (tests call this one helper only).
- **`getSortedTodoRecordsForDay`** – module-private.

New **exported** helpers that encode the behaviors `todoStore` needed:
- **`getAppendRankForDay(day)`** – rank for a new row at the **end** of a day/backlog list.
- **`getUnshiftRankForDay(day)`** – rank for a new row at the **front** (backlog / today unshift).
- **`stripPendingIncompleteTasksForDay(day)`** – removes non-empty, incomplete tasks for rollover cleanup (replaces the old local `stripPendingFromDayBucketIdb` in `todoStore`).

### `app/_stores/todoStore.ts`
- Imports updated to use the new helpers; **`openTodoDatabase`** / **`getSortedTodoRecordsForDay`** are no longer imported.
- **`loadFromStorageAsync`** no longer calls `openTodoDatabase()`; **`migrateLegacyTodoLocalStorageToIndexedDb`** opens the DB internally.

### `__tests__/dataExport.test.ts`
- Uses only **`await __resetTodoDatabaseForTests()`** in `beforeEach` (no `deleteTodoDatabase`).

All 20 tests pass and `tsc --noEmit` is clean.

---

**User**

All right. Please also change the file layout for readability:
1. exported constants (sort by importance)
2. private constants (sort by importance)
3. exported types (by abstraction level descending)
4. private types (by abstraction level descending)
5. exported functions (by life-cycle of the app, then a record)
6. private functions (by importance)

---

**Cursor**


Reading `lib/todoIndexedDb.ts` to reorganize it per your layout.




Reorganizing the file into the requested sections with clear separators. Writing the full file.




Reordering private functions by importance (core IDB first, validation helpers last).




Summary of the new layout for `lib/todoIndexedDb.ts`:

### 1. Exported constants (most → least central)
- `TODO_IDB_NAME`, `TODO_IDB_VERSION`, `TODO_IDB_STORE`, `TODO_IDB_BACKLOG_DAY`  
- Short comments on each.

### 2. Private constants
- `CALENDAR_DAY_KEY_RE` — shared validation for calendar day strings (replaces repeated `/^\d{4}-\d{2}-\d{2}$/`).

### 3. Module state
- `dbPromise` — singleton connection cache (called out separately from constants).

### 4. Exported types (high → low abstraction)
- `TodoExportBuckets` — bundle/export view  
- `TodoTaskRecord` — persisted row  
- `TodoItemShape` — plain task row  

### 5. Private types
- `LegacyDayDocV3` — normalized legacy per-day JSON; `parseDayDocV3` now returns this type.

### 6. Exported functions (lifecycle, then reads, then record CRUD, then bulk, then flags, then tests)
1. `migrateLegacyTodoLocalStorageToIndexedDb`  
2. `getSortedTodoItemsForDay`  
3. `collectTodoTasksForExport`  
4. `collectTodoRolloverMarkersFromLocalStorage`  
5. `getTodoTaskRecord` / `putTodoTaskRecord` / `deleteTodoTaskRecord`  
6. `getAppendRankForDay` / `getUnshiftRankForDay` / `stripPendingIncompleteTasksForDay`  
7. `countAllTodoTaskRecords`  
8. `replaceAllTodoTasksFromImport` / `clearAllTodoTaskRecords`  
9. `syncTodoTasksAnyFlagFromCount`  
10. `__resetTodoDatabaseForTests`  

### 7. Private functions (importance)
`openTodoDatabase` → `getSortedTodoRecordsForDay` → `requestToPromise` / `txDone` → `listLocalStorageKeys` → `readLegacyBacklogItems` → `parseDayDocV3` → `isTodoItem` / `todoRowHasVisibleText`.

Section headers use `// --- … ---` so you can scan the file quickly. All tests pass and `tsc --noEmit` is clean.

---

**User**

@lib/todoIndexedDb.ts:295-301 Why do we need this function?

---

**Cursor**


It exists so **JSON import can reset the todo slice safely**.

`clearTodoRelatedStorageKeysAsync` (used at the start of `todoActions.importData`) does two things:

1. **`await clearAllTodoTaskRecords()`** — removes every row in the IndexedDB `tasks` store so old tasks don’t linger when the import brings a **new** full set (different ids/days/count).
2. **Remove the relevant `localStorage` keys** — clears legacy day/backlog blobs and rollover markers so import can rewrite them.

Without clearing IndexedDB first, you could keep **orphan tasks** or **stale rows** that aren’t in the imported JSON. `replaceAllTodoTasksFromImport` could theoretically overwrite by id, but a full **clear + replace** matches “import replaces my todo data” and avoids leftovers when the incoming bundle has fewer tasks or different ids.

So: **`clearAllTodoTaskRecords` is the IndexedDB half of “wipe todo persistence before applying an import.”** It isn’t used for normal single-task edits.

---

**User**

Why can't it be called from replaceAllTodoTasksFromImport? 

---

**Cursor**


Checking `replaceAllTodoTasksFromImport` — it may already clear the store.




Noting `replaceAllTodoTasksFromImport` already calls `store.clear()` before inserts — the prior `clearAllTodoTaskRecords()` is redundant. Removing the redundant function and its import.




It **can** live there — and it already did.

`replaceAllTodoTasksFromImport` opens a single read/write transaction, runs **`store.clear()`**, then **`put`s** every task from the bundle. That **is** a full replace: old rows are removed in the same transaction before new ones are written.

The separate **`clearAllTodoTaskRecords`** was only doing another **`clear()`** in a **second** transaction before import. That was redundant with the clear inside `replaceAllTodoTasksFromImport`, so it didn’t add behavior — only an extra round-trip.

`clearTodoRelatedStorageKeysAsync` still only clears **localStorage** keys (markers, legacy day/backlog keys); IndexedDB is reset when **`replaceAllTodoTasksFromImport`** runs.

I removed **`clearAllTodoTaskRecords`** and documented **`replaceAllTodoTasksFromImport`** so the “wipe then write” contract is obvious. Tests still pass.

---

**User**

Please also remove the todo task any flag mechanism. It's too much of a complexity/readability cost for a few milliseconds saved only once for each user (it's only relevant when migrating from localStorage).

---

**Cursor**


Removing the flag key, `syncTodoTasksAnyFlagFromCount`, migration writes to that key, `refreshTodoTasksAnyFlag`, and all its call sites.





Summary of what changed:

### Removed
- **`TODO_TASKS_ANY_FLAG_KEY`** in `lib/persistKeys.ts`
- **`syncTodoTasksAnyFlagFromCount`** in `lib/todoIndexedDb.ts`
- Migration logic that set the flag after moving tasks from `localStorage`
- **`anyTask`** tracking in that migration (only used for the flag)
- **`refreshTodoTasksAnyFlag`** and every **`await refreshTodoTasksAnyFlag()`** in `todoStore` (add/split/merge/remove/import/rollover)
- The sync check on that key in **`hasAnyPersistedDeepdashData`** in `lib/firstRunSeed.ts`

### Unchanged
- **`countAllTodoTaskRecords`** stays in `todoIndexedDb` and is still used by **`hasIndexedDbTodoTasks()`** in first-run seed so a profile with **only** IndexedDB todos (and no other `localStorage` keys) is still treated as non-blank without the extra flag.

So first-run seed still does: synchronous “any other module data?” → then **`await countAllTodoTaskRecords() > 0`** when needed, at the cost of one async IDB read on a truly empty profile.

All tests pass and `tsc --noEmit` is clean.

---

**User**

Let's also remove the rollover markers mechanism. Same deal. It's relevant only when page loads.

We need an index on the "done" field to make the rollover performat. No need to creat another version of the export (let;s just modify v3) or new version of IDB (we want it to be version 1) since the app was not deployed with IndexedDB yet. 

Also, please make sure to not create new records when doing rollover. Just changing the "day" field is enough.

---

**Cursor**


Implementing removal of rollover markers, adding IndexedDB indexes (including `done`), and changing rollover to update `day` on existing records. Reading the codebase.




Implementing: updating the IDB schema, adding rollover via `day` updates, and removing marker-related code across the repo.




Implementing: updating `todoIndexedDb.ts` (schema, rollover, remove marker/strip helpers), then updating `todoStore`, `persistKeys`, fixtures, and tests.




Applying changes systematically.




Investigating: IndexedDB keys can't be booleans — `IDBKeyRange.only([fromDay, false])` fails. Checking the schema and fixing it.




IndexedDB keys can't be booleans. Adding a `0 | 1` `doneKey` field (mirroring `done`), indexing it, and normalizing every write.




Implementing `doneKey` and normalizing writes. Updating `putTodoTaskRecord` to accept records without `doneKey` and always compute it.




Normalizing reads so rows always include `doneKey` (handles any legacy rows missing it):




Here’s what was finished:

### `__tests__/dataExport.test.ts`
- Removed `todoRolloverMarkers` from all **expected** shapes and from the rollback **seed** `todo` slice.
- Left `todoRolloverMarkers` in the **input** to `migrateTodoSliceToLatest` in one test so we still prove **legacy JSON with markers imports cleanly** while the migrated result has no marker field.

### IndexedDB: boolean keys are invalid
`IDBKeyRange.only([fromDay, false])` fails under **fake-indexeddb** (and in real IndexedDB booleans are not valid keys). The schema now uses:

- **`doneKey: 0 | 1`** on each row, always kept in sync with **`done`**.
- Indexes on **`doneKey`** and **`["day", "doneKey"]`**.
- **`todoRecordForStore`** sets `doneKey` on every write; **`putTodoTaskRecord`** always persists via that helper (callers can keep passing `{ id, day, text, done, rank }`).
- Reads **`getTodoTaskRecord`**, **`getSortedTodoRecordsForDay`**, and **`collectTodoTasksForExport`** normalize rows with `todoRecordForStore` so missing `doneKey` is harmless.

Rollover still only **updates** existing rows (`day` + `rank`), no new ids.

`npx tsc --noEmit` and **`npm test`** (20 tests) both pass.

---

**User**

- @lib/todoIndexedDb.ts:357-359 Let's remove the second index ("doneKey") as it's not used anywhere. We should have two indexes.
- @lib/todoIndexedDb.ts:52-57 Let's just make "done" an integer instead of having two fields.
- @lib/todoIndexedDb.ts:254 The query is too narrow. It should fetch all tasks which are not done and not in the backlog, regardless of the day. Use the compound index for that.

---

**Cursor**


Reading the rollover implementation and all uses of `done` / indexes across the codebase.




Implementing: use a single integer `done` (0|1), keep two indexes (`day` and compound `["done", "day"]`), and query incomplete calendar-day tasks with a compound range, then filter to `fromDay` for rollover.




Here’s what changed:

### Two indexes only
- **`day`**
- **`doneAndDay`** on `["done", "day"]` (replaces both the old standalone `doneKey` index and `["day", "doneKey"]`)

### Single field `done: 0 | 1`
- Removed `doneKey`. Stored tasks use **`done` as `0 | 1`** (valid IndexedDB keys).
- **`normalizeDone`** / **`todoRecordForStore`** still accept **`boolean | 0 | 1`** at write time so **`putTodoTaskRecord`** and migrations can keep taking booleans from the UI / JSON.
- Reads that produce **`TodoItemShape`** (`done: boolean`) map with **`done: r.done !== 0`**.

### Rollover query
- Uses the compound index with  
  `IDBKeyRange.bound([0, "0000-01-01"], [0, "9999-12-31"])`  
  so you load **all incomplete rows whose `day` sorts as an ISO date** — **not** `"backlog"` (it sorts above `"9999-12-31"`).
- Then **`filter((r) => r.day === fromDay && …)`** so only **yesterday’s** visible incomplete rows are moved (same behavior as before, wider index read as requested).

Renamed export: **`TODO_IDB_INDEX_DONE_AND_DAY`** (replaces **`TODO_IDB_INDEX_DAY_AND_DONE`** / **`TODO_IDB_INDEX_DONE`**).

`npx tsc --noEmit` and **`npm test`** both pass.

---

**User**

@lib/todoIndexedDb.ts:90-102 It's better to just return rank with todo items to the store instead of having those two functions.

---

**Cursor**


Tracing how todos load into the store and where those rank helpers are used.




Implementing: extending the IDB getter to return `rank`, removing the two IDB rank helpers, and adding `TodoItem` + local rank helpers in the store.




Implementing: introducing `TodoItemPublic` for JSON/export and `TodoItem` with required `rank` for the live store; updating `todoIndexedDb` and refactoring `todoStore`.




Here’s what changed:

### `lib/todoIndexedDb.ts`
- Removed **`getAppendRankForDay`** and **`getUnshiftRankForDay`**.
- Exported **`TodoItemWithRank`** (`TodoItemShape & { rank: number }`).
- **`getSortedTodoItemsForDay`** now returns **`TodoItemWithRank[]`** (includes **`rank`**).

### `app/_stores/todoStore.ts`
- **`TodoItemPublic`** — JSON/export row: `{ id, text, done }` (no `rank`).
- **`TodoItem`** — **`TodoItemWithRank`** (live lists always carry **`rank`** from IDB).
- **`TodoDayDocumentV3`** / **`TodoExportV3`** use **`TodoItemPublic`** where the bundle has no ranks.
- **`applyLoadedDay`** takes **`{ items: TodoItem[] }`** (rows with **`rank`**).
- Local helpers **`appendRankForList`** / **`unshiftRankForList`** derive the next rank from the **current in-memory list** (same `+1000` / `-1000` rules as before).
- **`getTodoTaskRecord`** removed from the store: persist uses **`{ id, day, text, done, rank }`** from memory (or computed inline for merges/splits).
- **`insertEmptyAt`**, **`splitItemAt`**, **`moveItemRelative`**, moves today ↔ backlog use **neighbor ranks** from the arrays instead of extra IDB reads.
- Backlog load / **`importData`**: assign **`todoStore.backlogItems`** from **`getSortedTodoItemsForDay(TODO_IDB_BACKLOG_DAY)`** so **`rank`** stays in sync with IDB.
- Renamed **`isTodoItem`** → **`isTodoItemJson`** for the public JSON shape.

`npx tsc --noEmit` and **`npm test`** both pass. UI code can ignore **`rank`** on **`TodoItem`**; it’s there for ordering and persistence.

---

**User**

@lib/firstRunSeed.ts:87 This function does too much. Just checking one of the localStorage keys is enough.

@lib/todoIndexedDb.ts:98-105 Which means that we can also delete this function.

---

**Cursor**


Simplifying first-run detection to a single `localStorage` check, removing the IndexedDB todo count path, and deleting `countAllTodoTaskRecords`.




Here’s what changed:

### `lib/firstRunSeed.ts`
- **`hasAnyPersistedDeepdashData`** now only checks **`WORLD_CLOCK_STORAGE_KEY`** (any non-null value ⇒ treat as already having data).
- Removed **`hasIndexedDbTodoTasks`** and the **`countAllTodoTaskRecords`** import.
- Dropped unused `persistKeys` imports (`CALCULATOR_*`, `POMODORO_*`, todo day/backlog prefixes).

### `lib/todoIndexedDb.ts`
- Removed **`countAllTodoTaskRecords`** (it was only used for first-run detection).

`npx tsc --noEmit` and **`npm test`** both pass.

**Note:** A profile that only has IndexedDB todos and no world-clock row could still get the seed bundle applied. If that edge case matters, we can document it or use a different single key you prefer as the sentinel.

---

**User**

@lib/persistKeys.ts:59 Are you sure that it's safe to just remove item here? Do we know that those records are already migrated to indexedDB?

---

**Cursor**


Checking how rollover keys relate to the IDB migration:




Confirming: those keys aren't task data. They're obsolete auto-rollover idempotency markers (`worktools.todo.autoRolloverFrom.*` and `deepdash.todo.autoRolloverFrom.*`). Task payloads live under `worktools.todo.day.*` / `TODO_BACKLOG_*`, which `migratePair` copies to `deepdash.todo.day.*` before removal. IndexedDB migration reads those `deepdash` day/backlog keys in `migrateLegacyTodoLocalStorageToIndexedDb` — rollover markers were never part of that pipeline. Adding a short comment in code so this stays obvious.





**Short answer:** Yes — for those keys it’s safe. Nothing in that branch is supposed to end up in IndexedDB.

- **`worktools.todo.day.*`** → handled by `migratePair` into **`deepdash.todo.day.*`**. That JSON is what **`migrateLegacyTodoLocalStorageToIndexedDb`** later reads and writes into IDB, then deletes from `localStorage`.
- **`worktools.todo.autoRolloverFrom.*` / `deepdash.todo.autoRolloverFrom.*`** → only stored which day had already been rolled for idempotency. They are **not** todo rows and were **never** part of the IDB export/import model; the app no longer uses them.

So `removeItem` there only drops obsolete metadata, not migrated task payloads. A comment was added in `persistKeys.ts` next to that removal so this stays clear for future readers.

---

**User**

@app/_components/AppProviders.tsx:43 This firstRunSeedReady condition doesn't make any sense. We want to render the app without data to show placeholders.

---

**Cursor**


Rendering children immediately and running first-run seed in the background without gating the tree.




Update applied.

**Changes:** Dropped `firstRunSeedReady` state and the `null` branch. `maybeApplyFirstRunSeedBundle()` still runs in `useLayoutEffect`, but it no longer blocks the tree—`children` always render.

Feature UI can keep using existing **hydrated / loading** flags (e.g. todo’s `hydrated`) so lists show empty or skeleton state until storage and optional seeding finish.

---

**User**

@app/_stores/todoStore.ts:27-34 We need a smarter mechanism for updating the db.

Given what we know about how the app is used:
- The user always updates one tasks at a time.
- When editing a task, the user update its "text" multiple times (keystrokes) before the interaction is done.

It's probably a good idea to:
1. Debounce the db write for 1s.
2. Trigger db write for previously modified task immediately if the user started modifying another task.
3. Do a single batch db write if multiple tasks are to be updated.

---

**Cursor**


Implementing `applyTodoTaskWrites` in `todoIndexedDb.ts`, then updating persistence logic in `todoStore.ts`.




Here’s what was implemented:

### 1. Debounced text (1s)
- `setItemText` only updates memory and calls `scheduleDebouncedTextPersist(id)`.
- A timer fires after **`TEXT_PERSIST_DEBOUNCE_MS` (1000)** and queues a single `persistTaskById` on `persistTail`.
- Each new keystroke on the **same** task resets that timer.

### 2. Flush previous task when switching rows
- If `scheduleDebouncedTextPersist` runs for a **different** `id` while another task still has a pending debounce, the timer is cleared and the **previous** id is written immediately via `persistTail.then(() => persistTaskById(prevId))`.

### 3. Other actions wait on pending text, then run
- `enqueueTodoPersist` now does  
  `persistTail → flushPendingTextDebounced() → your fn`  
  so any non-text action (toggle, add, merge, split, delete, move, …) **persists in-flight text first**, then the structural write.

### 4. Single batched IDB transaction for multi-row updates
- `lib/todoIndexedDb.ts`: **`applyTodoTaskWrites({ deleteIds?, putRecords? })`** — one transaction, deletes in order then puts.
- Used for **split** (2 puts), **merge** (delete + put), **reorder** (2 puts), **remove** (delete only).

### 5. Export / unload
- **`flushTodoPersistToStorage`** now **`await`s `flushPendingTextDebounced()`** before **`persistTail`**, so export and `beforeunload`/`pagehide` flush pending typed text too.

`deleteTodoTaskRecord` was removed from the store in favor of `applyTodoTaskWrites({ deleteIds: [...] })` where needed.

---

**User**

@app/_stores/todoStore.ts:83-90 Could this function take just id as argument and use persistTaskById internally?

---

**Cursor**


Refactoring: single-task updates can use `enqueueTodoPersist(id)` → `persistTaskById`. Operations that need `applyTodoTaskWrites` (multiple ids or deletes) require a separate helper — adding `enqueueTodoPersistWork` for those.




Here’s what changed:

### `enqueueTodoPersist(id: string)`
- Runs `flushPendingTextDebounced()` then **`persistTaskById(id)`** (no duplicated `putTodoTaskRecord` in actions).
- Used for: **toggleDone**, **addItem**, **insertEmptyAt**, **moveItemToBacklog**, **moveItemToToday**.

### `enqueueTodoPersistWork(fn)`
- Same flush-then-run pattern, but **`fn`** can call **`applyTodoTaskWrites`** (splits, merges, deletes, two-row reorders).
- Single-task updates can’t be expressed as one `id`, so they stay on this path.

So the “take only `id`” API applies everywhere it’s valid; the rest still needs an explicit work callback.

---

**User**

@app/_stores/todoStore.ts:94-102 Can't we just have enqueueTodoPersist take a list of task ids as argument instead of this second function?

---

**Cursor**


Replacing both helpers with a single `enqueueTodoPersist(writeIds, deleteIds?)` that builds records from the store and uses `applyTodoTaskWrites` when needed.




Replacing both functions with `enqueueTodoPersist(writeIds, deleteIds?)` that builds puts from the store via `recordsForTaskIds`.




Here’s what changed:

### Single API: `enqueueTodoPersist(writeIds, deleteIds?)`
- **`writeIds`** — ids to **upsert** from the current store (via new **`recordsForTaskIds`**).
- **`deleteIds`** — optional ids to **remove** from IndexedDB (removes, or the merged-away row).

### Behavior
- **`deleteIds.length === 0 && writeIds.length === 1`** — still uses **`persistTaskById`** (same fast path as before).
- **Everything else** — **`applyTodoTaskWrites({ deleteIds, putRecords: recordsForTaskIds(writeIds) })`**.
- **Delete-only** — `enqueueTodoPersist([], [id])`.

### Call sites
| Action | Call |
|--------|------|
| toggle / add / insert / moves | `enqueueTodoPersist([id])` |
| split | `enqueueTodoPersist([id, newId])` |
| merge next | `enqueueTodoPersist([mergedId], [nextId])` |
| merge prev | `enqueueTodoPersist([mergedId], [curId])` |
| remove | `enqueueTodoPersist([], [id])` |
| reorder | `enqueueTodoPersist([itemA.id, itemB.id])` |

`enqueueTodoPersistWork` is removed; **`applyTodoTaskWrites`** is only used inside **`enqueueTodoPersist`**.

---

**User**

@lib/todoIndexedDb.ts:98-110 Those two functions are not needed if we have batch function.

---

**Cursor**


Summary of changes:

### `lib/todoIndexedDb.ts`
- Removed **`putTodoTaskRecord`** and **`deleteTodoTaskRecord`**.
- All writes/deletes go through **`applyTodoTaskWrites`** (internal `store.put` / `store.delete` in migration/rollover/replace paths are unchanged).

### `app/_stores/todoStore.ts`
- Dropped the **`putTodoTaskRecord`** import.
- **`persistTaskById`** now calls  
  `applyTodoTaskWrites({ putRecords: [{ id, day, text, done, rank }] })`.

`tsc` and tests are green.

---

**User**

@app/_stores/todoStore.ts:606 Should be named moveAllPendingIntoTodayAsync

---

**Cursor**


Updating the JSDoc to match the new name and implementation.




Rename is done: **`moveYesterdayPendingIntoTodayAsync`** → **`moveAllPendingIntoTodayAsync`** in all four places in `todoStore.ts`, and the function comment is updated so it still matches behavior (rollover from **`previousLocalDayKey()`** into today).

---

**User**

@lib/todoIndexedDb.ts:358-359 I'm wondering if we could have just a single compound index first on day, then "done" field. Would it impact performance of any queries?

---

**Cursor**


Here’s how this breaks down in IndexedDB terms.

### How compound keys are used

Indexes are **left‑to‑right**. You can efficiently:

- range on **prefix** (e.g. all keys with the same `day`), then narrow on `done`, or  
- range on **both** parts.

So **`["day", "done"]`** is a good fit when the main access pattern is “**per calendar day**” (and optionally “only incomplete for that day”).

### What you have now

- **`day`** alone: `getAll(day)` — all tasks for that list/day (today/backlog).
- **`["done", "day"]`**: a wide range on `done === 0` and `day` in an ISO band, then **JS filter** `day === fromDay` for rollover.

That compound order is optimized for “**all incomplete, many days**,” not “**one day**.”

### If you used only `["day", "done"]` (day first)

You can still get **all tasks for one day** with something like:

`IDBKeyRange.bound([day, 0], [day, 1])`

So the **standalone `day` index is not strictly required** for that pattern; the compound index can do the same work with one extra bound on `done`.

**Rollover** can be **tighter** with day first: e.g. only incomplete for **yesterday** is naturally:

`IDBKeyRange.only([fromDay, 0])`  
(or the same as a degenerate bound)

That avoids scanning **every** incomplete row in the DB and then filtering — so for rollover, **`["day", "done"]` is usually better** than the current wide `done`‑first scan **if** you rewrite the query that way.

### Tradeoffs

| Topic | Effect |
|--------|--------|
| **Drop `day` index, keep only `["day", "done"]`** | Fewer indexes to update on each `put`. Per‑day reads use `bound([day,0],[day,1])` — still index‑backed, same ballpark as `getAll(day)` for “all rows that day.” |
| **`["done", "day"]` → `["day", "done"]`** | Loses the current “all incomplete everywhere in one range” shape; **gain** is cheap **per‑day** incomplete queries, which matches rollover better. |
| **Export `getAll()`** | Unchanged (object store scan). |

**Bottom line:** Yes — a **single compound index `["day", "done"]`** can replace the separate **`day`** index for the queries you care about, with **no real downside** for per‑day listing if you use a full `done` range. **`["day", "done"]`** is **more natural** for rollover once you query **`[fromDay, 0]`** instead of scanning all incomplete rows. The important part is aligning **index order** with **how you range** (day‑scoped vs global‑incomplete).

