# Dashboard layout to-dos implementation
_Exported on 4/4/2026 at 18:00:20 GMT+2 from Cursor (2.6.21)_

---

**User**

Implement the following to-dos from the plan (the plan is attached for your reference). Do NOT edit the plan file itself.

You have been assigned the following 1 to-do(s) with IDs: dashboard-layout

1. [dashboard-layout] app/page.tsx: phase bg; header; grid; import/export bottom-right; responsive stack; a11y

These to-dos have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the assigned to-dos.

---

**Cursor**


Implementing the dashboard layout: exploring the codebase and marking the todo in progress.




Implementing the dashboard shell: full-width header, `main` landmark with skip link, responsive CSS grid (≥1024px two columns), and sticky aside for the todo column.




Here’s what was implemented for **dashboard-layout**:

### `app/page.tsx`
- **Phase background** — Still provided by `PhaseBackdrop` wrapping the whole tree (unchanged).
- **Header** — `WorldClocks` sits **above** the main `Container`, so the clock strip is **full width**; the body is constrained by `Container`.
- **Grid** — Below `lg` (default): single column in plan order: **Pomodoro → Calculator → Today’s work → Todo**. From **`lg` (1024px)** up: CSS grid `minmax(0,1fr)` + **`minmax(220px, 320px)`** for the narrow todo column, with `gap-10` and `items-start`.
- **Import / export** — Still the fixed bottom-right `DataImportExport` block; no layout change there.
- **Responsive stack** — Same DOM order as the plan’s mobile stack (header clocks, then main column content, then todo).
- **A11y** — Skip link (`fixed`, off-screen until `:focus`, `z-index` above the import/export bar) → `#main-content`; primary content in `<main>` via Mantine `Container component="main"` with `id="main-content"` and `aria-label="Productivity tools"`; todo column in `<aside aria-label="Daily todo list">`; left column uses `min-w-0` so flex/grid children don’t overflow; todo aside is **`lg:sticky lg:top-4`** so it stays in view when the left column scrolls on tall viewports.

### `app/_components/DataImportExport.tsx` (small a11y pass)
- **`role="region"`** and **`aria-label="Export and import app data"`** on the fixed control group so it’s identifiable to assistive tech.

`npm test` and `npm run build` both succeed.

---

**User**

I changed the layout of the dashboard a bit.

I want the dashboard to always have the height of 100vh and always vertically fill the space it has on the screen. FOr this for work with the grid, we need to observe the offsetHeight of the header and dynamically set the height of the 3 bottom columns to 100vh - headerHeight.

---

**Cursor**


Reading the dashboard layout and header structure after your changes.




Implementing a client `DashboardShell` that measures the header with `ResizeObserver` and sets the three bottom grid columns to `calc(100vh - headerHeight)`. Updating `TodaysWork` and `TodaysTodo` so their scroll regions fill the column height.




Creating `DashboardShell` with header measurement and updating `TodaysWork` and `TodaysTodo` so scroll areas fill remaining column height.




Here’s what was implemented:

### `app/_components/DashboardShell.tsx` (client)
- Main `Container` uses **`h="100vh"`** and **`overflow: hidden`** so the shell matches the viewport and doesn’t scroll as a whole.
- **Header block** (your `pt={52} pb={28}` + `WorldClocks`) is wrapped in a **`Box` with `ref`**.
- **`useDashboardBodyHeight`** runs `sync()` on mount, on **`ResizeObserver`** (header size changes), and on **`window.resize`**, and sets  
  **`calc(100vh - ${headerRef.current.offsetHeight}px)`** for the three lower columns.
- **SSR / first paint:** starts from **`calc(100vh - 160px)`** until the first measurement runs.
- Bottom **`GridCol`s (5 / 4 / 3)** share **`{ height: bodyHeightCss, minHeight: 0 }`** so row height matches the remaining space under the header.
- **Pomodoro** sits in a **`flexShrink: 0`** wrapper; **Calculator** keeps **`flexGrow: 1`** with **`min-h-0`** so the left column can scroll internally if needed.
- **TodaysWork** / **TodaysTodo** sit in **`Box h="100%"`** shells so they fill the column.

### `app/page.tsx`
- Renders **`PhaseBackdrop` → `DataImportExport` → `DashboardShell`**.

### Column fill tweaks
- **`TodaysWork`:** root **`h="100%"`** + **`minHeight: 0`**; list block **`flex: 1`**; **`ScrollArea`** **`flex: 1; minHeight: 0`** so the session list uses the column height instead of a fixed **352px**.
- **`TodaysTodo`:** **`min-h-0`** on the stack; **`ScrollArea`** **`flex: 1; minHeight: 0`**; trailing add row in **`flexShrink: 0`** **`Box`**.
- **`Calculator`:** **`minHeight: 0`** + **`min-h-0`** so it can shrink correctly in the flex stack (history is still **`h={220}`** inside).

Tests and `npm run build` both pass. If you want the calculator history to use **remaining** height instead of a fixed **220px**, that can be a follow-up change.
