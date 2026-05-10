# Dashboard layout and functionality changes
_Exported on 5/10/2026 at 10:51:40 GMT+2 from Cursor (3.2.16)_

---

**User**

We need to:

1. Completely remove calculator functionality from the code.
2. Move TodaysWork below Pomodoro component on @app/_components/DashboardShell.tsx (in place where calculator was).
3. Make the dashboard less wide and have 2 columns instead of current 3.

---

**Cursor**

Exploring the codebase to locate calculator usage and the dashboard layout.



Tracing calculator integration in data export, layout hydration, and tests.



Implementing removal of the calculator, bumping export bundle version to 3 (per schema-change rules), adding a v2 fixture migration test, and updating the dashboard layout.



Here’s what changed:

### Calculator removed
- Deleted `app/_components/Calculator.tsx` and `app/_stores/calculatorStore.ts`.
- Dropped the **mathjs** dependency from `package.json` (only the calculator used it).
- **`lib/dataExport.ts`**: Bundle version is now **3**; exports only `pomodoro` and `todo`. Old files that still include a `calculator` field import successfully; that field is ignored. Valid bundle versions are **1 through 3** (so v1/v2/v3 files all work).
- **`lib/firstRunSeed.ts`**: Removed the calculator seed block; replaced the “Play with the calculator” task with “Try import/export in Settings”.
- **`lib/persistKeys.ts`**: Stopped migrating calculator data; on legacy migration, **`worktools.calculator.v1`** and **`deepdash.calculator.v1`** are removed.

### Tests / fixtures
- Added **`__fixtures__/export-v2.json`** and a test that a **v2** export (with `calculator`) migrates to the current shape.
- Updated **`__tests__/dataExport.test.ts`**, **`__tests__/firstRunSeed.test.ts`**, and **`__tests__/persistKeys.test.ts`** for the new behavior.

### Dashboard layout (`DashboardShell.tsx`)
- **`Container`**: `size="xl"` → **`size="lg"`** for a narrower layout.
- **Two columns** (6 + 6): **left** — `Pomodoro` on top, **`TodaysWork` below** in the same flex column that used to hold the calculator; **right** — `TodaysTodo` in the aside.

`npm test`, `npx tsc --noEmit`, and `npm run build` all succeed. README still mentions the calculator; say if you want that doc updated too.

