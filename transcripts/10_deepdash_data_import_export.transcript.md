# Data import/export to-do implementation
_Exported on 4/4/2026 at 15:28:42 GMT+2 from Cursor (2.6.21)_

---

**User**

Implement the following to-dos from the plan (the plan is attached for your reference). Do NOT edit the plan file itself.

You have been assigned the following 1 to-do(s) with IDs: data-import-export

1. [data-import-export] Bottom-right Import/Export; versioned JSON + migrations; new Jest test per schema change (AGENTS.md)

These to-dos have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the assigned to-dos.

---

**Cursor**


Implementing versioned import/export with migrations, UI controls, and Jest tests. Exploring the codebase for existing stores and patterns.




Implementing central persist keys, `lib/dataExport.ts` with migration pipeline, UI component, todo flush export, tests, and store key updates.




Writing `lib/dataExport.ts` with parsing, migration, collect, and apply.




Here is what was implemented.

### Import / export (versioned JSON)
- **`lib/persistKeys.ts`** — shared `localStorage` key strings used by stores and export logic.
- **`lib/dataExport.ts`** — `CURRENT_WORKTOOLS_EXPORT_VERSION` (1), `WorktoolsExportV1` snapshot (clocks, pomodoro config + logs, todos by day, rollover markers, calculator), `migrateImportToLatest`, `collectWorktoolsExport`, `applyWorktoolsImport`, and `downloadWorktoolsJson`. Import clears existing todo day + rollover keys, then writes the imported buckets. **Unsupported `version` values throw** with a clear message (extension point for future `v2` migrations).
- Stores now import keys from **`persistKeys`** (`worldClockStore`, `calculatorStore`, `pomodoroStore`, `todoStore`).

### UI (bottom-right)
- **`app/_components/DataImportExport.tsx`** — fixed **Export** / **Import** controls; export calls **`flushTodoPersistToStorage()`** from **`app/_stores/todoStore.ts`** so today’s list is flushed before reading `localStorage`; import migrates, applies, notifies, then reloads the page.
- **`app/page.tsx`** — renders `DataImportExport` inside `PhaseBackdrop`.
- **`@mantine/notifications`**: `Notifications` in **`AppProviders.tsx`**, styles import in **`app/layout.tsx`**.

### Tests + AGENTS.md
- **`__fixtures__/export-v1.json`** — sample v1 export.
- **`__tests__/dataExport.test.ts`** — fixture migration to canonical shape, unsupported version, non-object input, minimal v1 defaults.
- **`AGENTS.md`** — points to `lib/dataExport.ts` and `DataImportExport.tsx` (existing schema/migration rules kept).

`npm test` and `npm run build` both succeed. Full-repo `npm run lint` still reports existing issues in other files; the files touched for this task are clean under ESLint.

---

**User**

I think it would be much better to encapsulate import/export logic of each functionality in their respective stores.

Let each store export importData(data: any) and exportData(): any. The store can remember all versions of the data structure V1 V2 etc and have version recognition logic in the importData function. Please modify each store and also add this information to @STORE_STYLEGUIDE.md .

---

**Cursor**


Refactoring so each store owns versioned `exportData` / `importData`, with `lib/dataExport.ts` orchestrating the combined file. Reading the current implementations.




Implementing per-store `exportData` / `importData` with versioned slice payloads, slimming `lib/dataExport.ts` to orchestrate the bundle (including legacy flat layout), and updating the style guide and tests.




Implementing store-level migration helpers and slice types, then slimming the bundle orchestrator.




Implementing todo store: adding `isRecord`, `listLocalStorageKeys`, `readJsonFromLocalStorage`, `clearTodoRelatedKeys`, `migrateTodoSliceToLatest`, and `exportData` / `importData`.




Rewriting `lib/dataExport.ts` and updating tests, AGENTS.md, and STORE_STYLEGUIDE.md.




Moving export/import helpers to the end of `todoStore.ts` so persistence stays grouped per the style guide.





Here is what changed.

### Per-store API
Each persisted feature store now has:

- **`exportData()`** — returns a versioned slice (`{ version: 1, … }`) plus **`FEATURE_EXPORT_VERSION`** and **`FeatureExportV1`** types where relevant.
- **`importData(data: unknown)`** — parses/migrates the slice, updates the **Valtio** proxy, **`localStorage`**, and **`last…Json`** caches so persistence stays aligned.
- **`migrate*SliceToLatest(data: unknown)`** — **exported**, pure normalization (no I/O) for **`importData`**, **`lib/dataExport.ts`**, and tests.

| Store | Slice migrator |
|--------|----------------|
| `worldClockStore` | `migrateWorldClockSliceToLatest` — accepts `{ version, clocks }` or a **legacy bare array** |
| `pomodoroStore` | `migratePomodoroSliceToLatest` — `{ version, config, logs }` or **legacy `{ config, logs }`** |
| `todoStore` | `migrateTodoSliceToLatest` — `{ version, todosByDay, todoRolloverMarkers }` or legacy fields |
| `calculatorStore` | `migrateCalculatorSliceToLatest` — `{ version, expression, history }` or **legacy** without `version` |

### `lib/dataExport.ts`
Only handles the **bundle**: `version`, `exportedAt`, legacy **flat** v1 (`worldClocks`, `todosByDay`, …), and delegates to the store migrators + `exportData` / `importData`. **`collectWorktoolsExport`** calls **`flushTodoPersistToStorage()`** internally (duplicate flush removed from **`DataImportExport`**).

### Fixtures / tests
- **`__fixtures__/export-v1.json`** uses the **nested** canonical shape (`worldClock`, `todo`, …).
- Tests cover that fixture plus a **legacy flat** bundle object.

### Docs
- **`STORE_STYLEGUIDE.md`** — new subsection under **`init`** describing **`exportData` / `importData`**, **`migrate*SliceToLatest`**, and where the code lives.
- **`AGENTS.md`** — clarifies bundle vs per-store responsibility.

TypeScript uses **`unknown`** for import payloads (untrusted JSON); the guide describes that explicitly instead of `any`.

---

**User**

@app/_components/DataImportExport.tsx:15-52 Please make a custom hook for all this as per @REACT_STYLEGUIDE.md .

---

**Cursor**


Extracting logic into `useDataImportExport` with an explicit tuple return per the style guide, placing the hook after the main component in the same file.




Here’s what changed:

### `DataImportExport.tsx` (per **REACT_STYLEGUIDE.md**)
- **`export function DataImportExport()`** is still the first thing after imports and only wires JSX to the hook.
- **`useDataImportExport()`** is a **file-private** hook below the component in the “Custom hooks” area.
- Return type is an **explicit tuple**:  
  `[RefObject<HTMLInputElement | null>, onExport, onPickImportFile, onFileChange]`  
  so the contract is fixed without a large props object.
- **`onFileChange`** stays **synchronous** for `onChange` typing (`(e) => void`); the async work runs inside `void (async () => { … })()` so you don’t get a `Promise`-returning handler.

Import order stays: Mantine → `@mantine/notifications` → React → `@/` modules.

---

**User**

OK. It works great but we also need to add a good error handling logic to the import functionality.

We have two main phases in the process.
1. Migration. Let's maybe run all migrations, gather results and report which modules didn't migrate properly in an error message. Also please add detailed logging to migration logic in all modules.
2. Import. Same strategy but also with rollback of all modules to the state before migration.

---

**Cursor**


Implementing two-phase migration (collect per-module results + logging) and transactional import with backup + rollback. Reviewing the current implementation.




Implementing `tryMigrateWorktoolsBundle`, `applyWorktoolsImportWithRollback`, strict storage writes for `importData`, migration logging in stores, and updating the UI hook.




Writing the expanded `lib/dataExport.ts` and updating the component hook.




Here’s what was implemented.

### 1. Migration phase (`lib/dataExport.ts`)
- **`tryMigrateWorktoolsBundle(raw)`** — Validates the bundle, then runs **all four** slice migrators. Failures are **accumulated** (no early exit), so the user can see every bad module.
- **`formatWorktoolsImportErrorsForUser(errors)`** — Builds a multi-line message (`migration — worldClock: …`, etc.).
- **`migrateImportToLatest`** — Unchanged behavior for callers/tests: still throws a single `Error` whose message is the formatted list.

**Logging:** `log.debug` / `log.warn` / `log.error` around validation, payload extraction, per-slice runs, and the final summary. (Default logger level is still **`warn`**, so turn on **`debug`** locally to see migration traces.)

### 2. Per-store migration logging & stricter import writes
Each **`migrate*SliceToLatest`** now logs:
- start + input shape hints  
- success + counts (clocks, days, history entries, …)  
- **`log.error`** before throwing  

Each store’s **`importData`** path uses **`storageSetItemStrict`**: failed `localStorage.setItem` **throws** with a clear prefix (`worldClock:`, `todo:`, …) so the import phase can detect failure and roll back.

### 3. Import phase + rollback (`lib/dataExport.ts`)
- **`applyWorktoolsImportWithRollback(data)`** —  
  1. **`collectWorktoolsExport()`** as backup (still flushes todos first).  
  2. Applies **worldClock → pomodoro → todo → calculator** in order.  
  3. On first error: **`applyWorktoolsImport(backup)`**.  
  4. If rollback throws, returns **two** errors: failed **import** module + **rollback** message warning about possible inconsistency.

**Logging:** debug per step, `error` on failure, `warn` around rollback.

### 4. End-to-end entry point
- **`runWorktoolsJsonImportFromText(text)`** — `JSON.parse` (bundle-level error) → **`tryMigrateWorktoolsBundle`** → **`applyWorktoolsImportWithRollback`**.

### 5. UI (`DataImportExport.tsx`)
Uses **`runWorktoolsJsonImportFromText`** and shows **`formatWorktoolsImportErrorsForUser(result.errors)`** when `ok` is false.

### 6. Tests
- **`tryMigrateWorktoolsBundle`** with bad **worldClock** and **calculator** versions → two migration errors.  
- **`runWorktoolsJsonImportFromText("{")`** → bundle / invalid JSON error.

To **see migration debug lines** in the console during development, run e.g. `log.setLevel("debug")` once (e.g. in the import component `useEffect` or dev-only bootstrap).

---

**User**

Please also remove all functions from @lib/dataExport.ts which are not used any more.

---

**Cursor**


Removing `migrateImportToLatest` (only used by tests; pipeline uses `tryMigrateWorktoolsBundle` + `runWorktoolsJsonImportFromText`). Making `applyWorktoolsImport` and `applyWorktoolsImportWithRollback` private. Updating tests and docs.




Inlining the single-use `buildLatestFromMigrated` helper to remove an extra function.




Here’s what changed in `lib/dataExport.ts` and the repo:

### Removed
- **`migrateImportToLatest`** — nothing outside tests used it; the UI goes through **`runWorktoolsJsonImportFromText`**. Tests now use a local **`expectMigratedBundle`** helper built from **`tryMigrateWorktoolsBundle`** + **`formatWorktoolsImportErrorsForUser`**.
- **`buildLatestFromMigrated`** — only used once; logic is inlined in **`runWorktoolsJsonImportFromText`**.

### No longer exported (still used inside the module)
- **`applyWorktoolsImport`** — only used for rollback replay.
- **`applyWorktoolsImportWithRollback`** — only used from **`runWorktoolsJsonImportFromText`**.

### Types tightened
- Dropped **`WorktoolsExportV1`**; **`WorktoolsExportLatest`** is the single exported bundle type.
- **`WorktoolsImportModuleId`**, **`WorktoolsImportErrorPhase`**, and **`TryMigrateWorktoolsBundleResult`** are file-private (only used for implementation typing).

### Docs
- **`AGENTS.md`** and **`STORE_STYLEGUIDE.md`** now refer to **`tryMigrateWorktoolsBundle`** / **`runWorktoolsJsonImportFromText`** instead of **`migrateImportToLatest`** / **`applyWorktoolsImport`**.

### Still exported (actually used from outside)
- **`CURRENT_WORKTOOLS_EXPORT_VERSION`**, **`WorktoolsExportLatest`**, **`WorktoolsImportError`**, **`WorktoolsJsonImportRunResult`**
- **`formatWorktoolsImportErrorsForUser`**, **`tryMigrateWorktoolsBundle`**, **`collectWorktoolsExport`**, **`downloadWorktoolsJson`**, **`runWorktoolsJsonImportFromText`**

Private helpers **`bundleValidationErrors`**, **`extractSlicePayloads`**, **`isRecord`** stay; they’re required by **`tryMigrateWorktoolsBundle`**.

---

**User**

@lib/dataExport.ts:266-284 The rollback should happen ourside of this loop. @__tests__/dataExport.test.ts:173-174 We also need a test for rollback.


---

**Cursor**


Refactoring the rollback to run after the apply loop, exporting `applyWorktoolsImportWithRollback` for tests, and adding a jsdom-backed rollback test.




### `lib/dataExport.ts` — rollback outside the loop
- The apply loop only runs each `importData` and, on error, sets **`importFailure`** and **`break`**s.
- After the loop:
  - If there was no failure → return `{ ok: true }`.
  - Otherwise → **one** `try/catch` around **`applyWorktoolsImport(backup)`** for rollback, then return either import + rollback errors or a single import error.
- Removed the duplicate **`ApplyWithRollbackResult`** type (kept **`ApplyWorktoolsImportWithRollbackResult`**).
- **`applyWorktoolsImportWithRollback`** is **exported** again so tests (and callers) can target it directly.

### `__tests__/dataExport.test.ts` — rollback test
- Added **`@jest-environment jsdom`** at the top so `localStorage` and store import paths behave like the browser.
- New **`describe("applyWorktoolsImportWithRollback")`** with **`afterEach(jest.restoreAllMocks)`**.
- Test flow: seed all four stores → **`jest.spyOn(pomodoroActions, "importData").mockImplementationOnce(() => { throw ... })`** → run **`applyWorktoolsImportWithRollback(incoming)`** (world clock updates, pomodoro throws) → assert **`ok: false`**, a single **`import` / `pomodoro`** error, and that **`worldClockActions.exportData()`** and calculator expression match the **seed** (rollback restored state).

### `AGENTS.md`
- Mentions **`applyWorktoolsImportWithRollback`** in the bundle-orchestration list.

