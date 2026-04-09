# Task backlog functionality implementation
_Exported on 4/10/2026 at 02:01:15 GMT+2 from Cursor (2.6.21)_

---

**User**

Let's implement task backlog functionality:

1. @app/_components/TodaysTodo.tsx component needs to be a tab panel with two tabs ("
Today's tasks" and "Backlog". Both should display task lists with exactly the same functionality.
2. We need another icon at the end of the task. In "Today's tasks" list clicking the icon should move the task to "Backlog". In "Backlog" list clicking the icon should move task to "Today's tasks". The icon should be different for each type of transfer.

---

**Cursor**


Exploring TodaysTodo and the task data model so we can add tabs and backlog ↔ today transfers.




Reading the rest of `todoStore.ts` for persistence, export, and migration.




Checking tests and how we use `items` across the store.




Implementing store changes (two lists per day, export v2), then updating TodaysTodo with Tabs and transfer icons.




Implementing store changes, then updating the UI and tests.




Updating `TodaysTodo.tsx`: adding imports and refactoring the main component.




Here’s what was implemented:

### UI (`TodaysTodo.tsx`)
- **Mantine `Tabs`** with **“Today’s tasks”** and **“Backlog”**; each tab renders the same list behavior via `TodaysTodoListPanel` + `useTodaysTodoMechanics(listKind)`.
- **`todoActions.init()`** runs once on the parent `TodaysTodo` (not per tab).
- Each row has a **transfer** control **before** the drag handle:
  - **Today:** `IconArchive`, label **“Move to backlog”** → `moveItemToBacklog(id)`
  - **Backlog:** `IconCalendarPlus`, label **“Move to today”** → `moveItemToToday(id)`

### Data (`todoStore.ts`)
- Per calendar day, storage is now **`{ items, backlogItems }`** (today vs backlog).
- **`TodoExportV2`** / **`TODO_EXPORT_VERSION = 2`**; **`migrateTodoSliceToLatest`** accepts slice **v1** and **v2**, always returns **v2** (v1 days get **`backlogItems: []`**).
- New actions: **`moveItemToBacklog`**, **`moveItemToToday`**; **`addItem`** and **`insertEmptyAt`** take an optional **`TodoListKind`** (`"today"` | `"backlog"`).
- **`useTodoList()`** now returns **`backlogItems`** as well as **`items`**.

### Other
- **`lib/firstRunSeed.ts`** and **`lib/dataExport.ts`** updated for **`TodoExportV2`**.
- **`__fixtures__/todo-slice-v1.json`** plus tests in **`__tests__/dataExport.test.ts`** for v1 → v2 migration.

Existing per-day JSON without `backlogItems` still loads: it’s treated as an empty backlog.

---

**User**

It works.

We need the two icons at the end of the task to be closer together.

---

**Cursor**


Wrapping the two trailing `ActionIcon`s in a tight inner `Group` so they stay close while preserving spacing from the textarea.




Update applied: the transfer and drag controls are wrapped in an inner `Group` with **`gap={2}`** (tighter than the row’s `gap={7}`), and **`marginTop: 6`** is on that group so alignment with the text row stays the same.

If you want them even tighter, we can set the inner group to **`gap={0}`**.

---

**User**

One change to the functionality. Transfering the task between list should always move it to the top of the list.

---

**Cursor**


Updating `moveItemToBacklog` and `moveItemToToday` in the todo store to insert moved tasks at index 0 of the destination list.




Update is in `todoStore`: both **`moveItemToBacklog`** and **`moveItemToToday`** now **`unshift`** the row onto the destination list so it becomes the first item. Comments were adjusted to say “top” instead of “end”.

---

**User**

I have a task with empty content in my local storage. Let's please remove empty tasks when loading data.

---

**Cursor**


Inspecting how day documents are loaded and parsed in the todo store.




Adding filtering in `parseTodoDayDocument` so every load path (including today's bucket) strips whitespace-only tasks. `syncTodayPersistSnapshot()` after load rewrites today's localStorage with the cleaned document.




Here’s what changed:

**`omitEmptyTodoRows`** — After validating items, both `items` and `backlogItems` are filtered with `text.trim() !== ""`.

**`parseTodoDayDocument`** — Returns that filtered document, so any path that parses a day JSON (today’s load, other days when the calendar changes, export collection, import migration) no longer keeps empty/whitespace-only rows.

For **today**, `loadFromStorage` still ends with `syncTodayPersistSnapshot()`, so the in-memory list without empty rows is written back to `localStorage` and the bad row is removed from disk on the next load.

---

**User**

For some reason, when new task is added through the trailing row, actually two tasks are added, first one with empty text, second one the actual task. After the first render the empty task is being removed as per UI empty task rules which produces weird UI jump when adding a task.

---

**Cursor**


Tracing the trailing-row commit flow to find why two tasks are created.




Identifying the issue: plain Enter at the start or end of the trailing field calls `insertEmptyAt`, which adds an empty persisted row while the trailing textarea still holds the text. On blur, `onBlurTrailing` runs `commitTrailing`, adding a second task. Replacing those branches with `commitTrailing(value)` so Enter submits the draft (like Cmd+Enter). Keeping the middle split (`start > 0 && start < value.length`) unchanged.




Here’s what was going wrong:

**Cause:** The trailing field is **single-line** (`maxRows={1}`), but Enter handling still followed the **persisted row** pattern: on Enter at the **start** or **end** of the line it called `insertEmptyAt`, which added an **empty** task and moved focus there, while the trailing input **still held the same text**. On the next blur, `onBlurTrailing` ran `commitTrailing` again → you got **two** tasks (empty + real), then the empty one was removed → visible jump.

**Change:** For that trailing field, Enter at the **start** or **end** of non-empty text now calls **`commitTrailing(value)`** (same idea as Cmd/Ctrl+Enter), so the line is added once and the draft clears. The **middle** split case (`start` strictly inside the string) is unchanged: it still splits into `addItem(left)` + remaining draft.

`persistedItemCount` was only used for those `insertEmptyAt` branches, so it’s no longer read in `useTrailingTodoRowInput`.

---

**User**

I change my mind about the layout. I want to have backlog list under the today's task list (in the same scroll panel.

1. The top label should say "Today's tasks".
2. After the user scrolls "Backlog" to the top of the scrolarea the top label should change to "Backlog".
3. The trailing row adds to "today's tasks" or to "backlog" depending on what's writtend in the top label.

---

**Cursor**


Refactoring TodaysTodo into a single ScrollArea with stacked sections and a scroll-driven sticky label. Reading the current implementation.




Inspecting keyboard navigation and ScrollArea usage to implement unified focus.




Implementing the unified scroll layout: adding `TodaysTodoFocusApi` fields and updating the persisted-row keyboard handler, then replacing the Tabs structure.




Implementing: updating the focus API type and keyboard handler, then replacing the main layout and hook.




Fixing the layout: wrapping scroll content, correcting the apostrophe, and implementing `useTodaysTodoUnifiedMechanics`.




Fixing `isLastRow`/`isFirstRow` (persisted rows use local `items`). Adding cross-list arrow navigation and removing unused `isFirstRow`/`isLastRow` from `focusAPI`.




Here’s what changed:

### Layout
- Removed **tabs**. One **ScrollArea** stacks:
  1. **Sticky** top line (`position: sticky`, `z-index: 2`, phase **background**) whose text is either **Today’s tasks** or **Backlog**
  2. Today’s rows  
  3. In-flow **Backlog** heading (`ref={backlogSectionRef}`)  
  4. Backlog rows  
  5. Bottom spacer (`Space`) for scroll-into-view  

### Scroll → label + add target
- **`viewportRef`** on `ScrollArea` + **`updateTrailingTargetFromScroll`**: compares the backlog heading’s `getBoundingClientRect().top` to the viewport top plus the sticky label height (`stickyLabelRef`). When the backlog title moves into that band, state becomes **`"backlog"`**; otherwise **`"today"`**.
- Listeners: **`onScrollPositionChange`**, **`scroll`**, **`ResizeObserver`** on the viewport, plus **`useLayoutEffect`** when today/backlog lengths change so layout stays in sync.
- **`trailingTargetList`** drives:
  - sticky copy (Today’s tasks vs Backlog)
  - **`useTodaysTodoUnifiedMechanics(trailingTargetList)`** so **`commitTrailing`** / **`focusAPI.listKind`** add to **today** or **backlog** to match the label.

### Mechanics
- **Two** `useTodaysTodoRowReorder` instances (`dragAPIToday` / `dragAPIBacklog`).
- **Arrow keys**: last row of **today** → first backlog row or trailing; first row of **backlog** ↑ → last today or trailing; **ArrowRight** at end of last today matches that behavior.

### Cleanup
- Removed the stray **`dragAPI` `useMemo`** that referenced a non-existent single reorder hook.

---

**User**

@app/_components/TodaysTodo.tsx:164-183 Please move this before the scroll panel.

---

**Cursor**


Moving the label above `ScrollArea` and updating scroll detection: the backlog threshold should compare the backlog header to the viewport top (no sticky label inside the scroll).




Here’s what changed:

1. **Section title** — The `Text` block now sits **above** `ScrollArea` as the first child of the outer `Stack`, with `flexShrink: 0` and `paddingBottom: 8` (no sticky/`z-index`/background, since it’s not in the scroller).

2. **Scroll logic** — `updateTrailingTargetFromScroll` no longer uses a sticky label height. It only checks whether the in-scroll **Backlog** heading’s top is at or above the **scroll viewport** top (`br.top <= vr.top + 2`), which matches “backlog is at the top of the scroll panel.”

3. **Refs** — `stickyLabelRef` was removed as unused.

---

**User**

Great.

Now we need Space element at the end of backlog list that enables actually scrolling the backlog enough so that top label becomes "Backlog" this Space element should have dynamically set heigh which is based on the height of the scroll area and the sum height of the backlog items.

---

**Cursor**


Implementing a measured backlog section and dynamic spacer so we can scroll enough for the backlog header to reach the viewport top. Reading the component structure:




Adding a wrapper ref around the backlog heading and rows, computing spacer height as `max(0, viewportHeight - blockHeight)`, and observing resize with ResizeObserver.




Syncing the section label after the spacer resizes the scroll content:




Here’s what was added:

### Behavior
- **`backlogBlockMeasureRef`** — `Box` around the in-scroll **“Backlog”** title and all backlog **rows** (only that block is measured).
- **`backlogEndSpacerPx`** — `max(0, ceil(viewport.clientHeight - block.offsetHeight))` so  
  **backlog heading + rows + spacer ≥ scroll viewport height**, which gives enough scroll range to bring the backlog header to the top and flip the outside label to **Backlog**.
- **`ResizeObserver`** on the scroll **viewport** and the **measured block** (plus a **`useLayoutEffect`** when today/backlog counts or hydration change) so the spacer updates when the panel size or backlog content height changes.
- **`Space h={backlogEndSpacerPx}`** is placed **right after** the measured block; the existing **`Space h={28}`** with **`lastRowScrollRef`** stays after it for new-task scroll-into-view.
- A small **`useLayoutEffect`** on **`backlogEndSpacerPx`** calls **`updateTrailingTargetFromScroll`** so the title stays correct after the spacer changes total scroll height.

---

**User**

Worked great but there's a bug.

After scrolling to the bottom the top label changes to "backlog" but then when trying to scroll to top the label changes to "today's tasks" momentarily and then changes back to "backlog" again and scrolls to bottom.

---

**Cursor**


Tracing the interaction: `trailingTargetList` likely drives `activeItems` and triggers the scroll-into-view effect. Inspecting the hook.




Identifying the issue: the scroll-into-view effect uses `activeItems` (derived from `trailingTargetList`). When scrolling up briefly switches the label to "today", `activeItems` switches to today's list and the baseline logic can falsely detect an "append" and call `scrollIntoView`. Fixing by tracking per-list baselines (today vs backlog) and only scrolling when the list that actually grew matches the append detection.




Here’s what was going wrong:

**Cause:** Auto-scroll used a **single** baseline tied to `activeItems`, which flips between **today** and **backlog** when `trailingTargetList` changes. On the way back up, the label briefly became “today”, `activeItems` switched to today’s list, and the effect compared **today’s** length/last id to the **previous** baseline (from the backlog list). That looked like a length increase and fired `scrollIntoView` → jump to the bottom.

**Change:** Keep **separate** baselines for **today** and **backlog** (`scrollBaselineByList`). On each run, update **both** lists from the store and compute `appendedToday` / `appendedBacklog` independently. Call `scrollIntoView` only when the list that **actually** grew matches the target for the trailing row:  
`trailingTargetList === "today" ? appendedToday : appendedBacklog`.

So scrolling and label flicker no longer look like new items, and only a real add on the active list triggers the smooth scroll to the bottom.

---

**User**

Great!

Now @app/_components/TodaysTodo.tsx file became too large. Let's:

1. Create TodaysTodo folder.
2. Move @app/_components/TodaysTodo.tsx component to this folder.
3. Move all todo-specific lib/ files to this new folder.
4. Extract row components from @app/_components/TodaysTodo.tsx to separate files.

---

**Cursor**


Exploring `TodaysTodo.tsx` structure and todo-related `lib/` files.




Creating the folder structure and files: adding core modules first, then components, then removing old files.




Here’s the refactor summary:

### New layout: `app/_components/TodaysTodo/`

| File | Role |
|------|------|
| **`index.ts`** | Re-exports `TodaysTodo` (`import { TodaysTodo } from "./TodaysTodo"` still works). |
| **`TodaysTodo.tsx`** | Main panel: scroll, spacer, wiring. |
| **`TodoPersistedRow.tsx`** | Single task row (checkbox, textarea, move + drag). |
| **`TodoTrailingRow.tsx`** | Trailing “add task” row. |
| **`TodaysTodoTasksSkeleton.tsx`** | Loading skeleton. |
| **`types.ts`** | `TodaysTodoDraftApi`, `TodaysTodoFocusApi`, `TodaysTodoDragApi`, `TodaysTodoUnifiedMechanics`, row props. |
| **`useTodaysTodoUnifiedMechanics.ts`** | Unified mechanics hook. |
| **`useTodoRowInputs.ts`** | `usePersistedTodoRowInput` + `useTrailingTodoRowInput`. |
| **`todoRowHelpers.ts`** | `isSplitEnter`, `clampColumn`. |
| **`todaysTodoRowReorder.ts`** | Moved from `lib/`. |
| **`todaysTodoTextareaNav.ts`** | Moved from `lib/`. |

### Removed
- `app/_components/TodaysTodo.tsx` (replaced by the folder + `index.ts`)
- `lib/todaysTodoRowReorder.ts`
- `lib/todaysTodoTextareaNav.ts`

### Imports
- `DashboardShell` still uses `from "./TodaysTodo"`; Node resolves to `TodaysTodo/index.ts`.

`npx tsc`, `npm test`, and `npm run build` all succeed.

---

**User**

- @app/_components/TodaysTodo/useTodoRowInputs.ts:29 This needs to be in @app/_components/TodaysTodo/TodoPersistedRow.tsx file.
- @app/_components/TodaysTodo/useTodoRowInputs.ts:268 Please move this to @app/_components/TodaysTodo/TodoTrailingRow.tsx file.
- @app/_components/TodaysTodo/useTodaysTodoUnifiedMechanics.ts:24-25 This needs to go to @app/_components/TodaysTodo/TodaysTodo.tsx file.

---

**Cursor**


Moving each hook into its colocated file and removing the separate hook modules.




Merging hooks into their component files and removing the standalone hook modules.




Here’s what was completed:

### `useTodaysTodoUnifiedMechanics` → `TodaysTodo.tsx`
- The hook now lives at the **bottom** of `TodaysTodo.tsx`, after `TodaysTodo`, with the same implementation as before (imports adjusted for the local folder).
- `TodaysTodo` still calls `useTodaysTodoUnifiedMechanics(trailingTargetList)` for layout, scroll, and row wiring.

### Removed files
- `useTodaysTodoUnifiedMechanics.ts` — deleted (logic moved into `TodaysTodo.tsx`).
- `useTodoRowInputs.ts` — deleted (`usePersistedTodoRowInput` / `useTrailingTodoRowInput` are already in `TodoPersistedRow.tsx` and `TodoTrailingRow.tsx`).

### Checks
- `npx tsc --noEmit` — OK  
- Jest — all 17 tests passed  

Nothing else in the app imports the removed modules.

---

**User**

- @app/_components/TodaysTodo/TodaysTodo.tsx:373-405 Maybe we could have useFocusApi and useDragApi sub-hooks here?
- @app/_components/TodaysTodo/TodaysTodo.tsx:53-54 Let's also move everything connected with backlog end spacer to a separate hook.
- @app/_components/TodaysTodo/TodaysTodo.tsx:99-105 Let's move everything commected with trailing target from scroll to a separate hook.

---

**Cursor**


Reading `TodaysTodo.tsx` to map structure and extract the hooks.




Refactoring: we'll call `useTodoList()` once in `TodaysTodo`, add `useBacklogEndSpacer` and `useTrailingTargetFromScroll`, and split `useTodaysTodoFocusApi` / `useTodaysTodoDragApis` inside the unified mechanics hook.




Updating `TodaysTodo.tsx`: adding `useTodaysTodoDragApis` and `useTodaysTodoFocusApi`, and wiring the new hooks.




Here’s what changed:

### `useTodaysTodoBacklogEndSpacer` (`useTodaysTodoBacklogEndSpacer.ts`)
- Owns `backlogEndSpacerPx`, `recalcBacklogEndSpacer`, and the `ResizeObserver` / layout effect that depend on `hydrated` and list lengths.
- Takes `viewportRef`, `backlogBlockMeasureRef`, and the length fields.

### `useTodaysTodoTrailingTargetFromScroll` (`useTodaysTodoTrailingTargetFromScroll.ts`)
- Owns `trailingTargetList`, `updateTrailingTargetFromScroll`, scroll + resize listeners, and the layout effects that sync when hydration, lengths, or `backlogEndSpacerPx` change.

### Sub-hooks in `TodaysTodo.tsx` (used by `useTodaysTodoUnifiedMechanics`)
- **`useTodaysTodoDragApis`** — two row-root ref maps + `useTodaysTodoRowReorder` for today and backlog; returns `{ dragAPIToday, dragAPIBacklog }` typed as `TodaysTodoDragApi`.
- **`useTodaysTodoFocusApi`** — row/trailing refs, focus helpers, arrows, `focusAPI` memo, and **`commitTrailing`** (so draft commit stays tied to the same focus layer).

### `TodaysTodo` wiring
- **`useTodoList()`** runs once at the top so spacer, trailing-target, and mechanics share the same snapshot.
- **`useTodaysTodoUnifiedMechanics`** now takes `(trailingTargetList, { hydrated, todayItems, backlogItems })` and only returns `draftAPI`, `focusAPI`, `lastRowScrollRef`, and the drag APIs (no duplicate list data).

`tsc` and Jest both pass.

---

**User**

- @app/_components/TodaysTodo/useTodaysTodoBacklogEndSpacer.ts:15-23 This should be at the end of @app/_components/TodaysTodo/TodaysTodo.tsx file.
- @app/_components/TodaysTodo/useTodaysTodoTrailingTargetFromScroll.ts:24-34 This should be at the end of @app/_components/TodaysTodo/TodaysTodo.tsx file.

---

**Cursor**


Inlining both hooks at the end of `TodaysTodo.tsx`, removing their imports, and deleting the standalone files.




Summary of changes:

### `TodaysTodo.tsx`
- Removed imports from `useTodaysTodoBacklogEndSpacer.ts` and `useTodaysTodoTrailingTargetFromScroll.ts`.
- Added `RefObject` to the React import for the local arg types.
- Appended **`useTodaysTodoBacklogEndSpacer`** and **`useTodaysTodoTrailingTargetFromScroll`** at the **bottom** of the file (after `useDragApi`), including their `UseTodaysTodo*Args` types. They are file-local `function` declarations (not exported), same behavior as before.

### Removed files
- `useTodaysTodoBacklogEndSpacer.ts`
- `useTodaysTodoTrailingTargetFromScroll.ts`

`npx tsc --noEmit` succeeds.

---

**User**

There's a bug in scrolling logic when adding new task.

Currently, adding a task scrolls to the bottom of the list. This is good for the "backlog" but not good for "today's tasks". For today's task it should scroll the newly added task into view.

---

**Cursor**


Tracing scroll-on-append logic and how we can scroll the new "today" row into view.




Scrolling uses `lastRowScrollRef` at the bottom of the scroll area (after today, backlog, and spacer), so adding a "today" task jumps to the document bottom. Scrolling the new row's root (from the drag row refs) into view for today; keeping bottom scroll for backlog.




Extending `useDragApi` with a helper that scrolls a row's root element into view, and using it when appending to "today"; keeping bottom `lastRowScrollRef` scroll for backlog.




Here’s what was going wrong and what we changed.

**Cause:** After a trailing add, the code always called `scrollIntoView` on `lastRowScrollRef` — the spacer **below** the whole stack (today + backlog + padding). That’s appropriate for backlog (you want the end of the scroll region), but for **today** it pulled the viewport to the very bottom and skipped past the new row if backlog content was below it.

**Change:**
- **`useDragApi`** now exposes `scrollPersistedRowIntoView(listKind, id)`, which uses the same row root nodes as drag (`registerRowRoot` on each `TodoPersistedRow` `Box`) and runs `scrollIntoView({ block: "nearest", behavior: "smooth" })` after `queueMicrotask` + `requestAnimationFrame` (same timing idea as your focus helpers).
- **`useTodaysTodoMechanics`** scroll logic:
  - **`today` + append:** scroll the **last today item’s row** into view.
  - **`backlog` + append:** unchanged — still scroll the bottom spacer (`lastRowScrollRef`) with `block: "end"`.

So new today tasks stay in view just above the backlog block instead of jumping to the bottom of the list.

---

**User**

All right.

Now when the "Backlog" list is not visible on the screen, we want the "Backlog" label to be sticky at the bottom of the scrollarea. Clicking the "Backlog" label should scroll the list to the point where the top label says "Backlog".

---

**Cursor**


Inspecting the TodaysTodo layout and scroll logic to implement a sticky Backlog label and click-to-scroll.




Adding a hook to detect when the backlog header sits below the viewport, rendering a bottom sticky control, and scrolling the viewport to align the backlog header with the top (matching `updateTrailingTargetFromScroll`). Setting the gradient to `pointer-events: none` so the sticky control receives clicks.




Making the sticky control a full-width bottom bar (minus scrollbar) so it reads as a sticky section label.




Here’s what was implemented:

### Behavior
- **`useTodaysTodoStickyBacklogLabel`** (at the bottom of `TodaysTodo.tsx`) compares the in-flow **Backlog** heading (`backlogSectionRef`) to the scroll **viewport** with `getBoundingClientRect`.
- **Show the sticky control** when that heading is **fully below** the visible area (`br.top >= vr.bottom - 0.5`) — i.e. you’re only seeing Today’s tasks and the backlog block hasn’t entered the viewport yet.
- **Hide it** as soon as any part of the heading is visible, or if it’s scrolled **above** the viewport (you’re already in the backlog).
- **Click** adjusts `viewport.scrollTop` so the heading lines up with the top of the viewport (`br.top - vr.top`), matching the rule used for the outer title (`br.top <= vr.top + 2` → “Backlog”). Then **`syncTrailingTargetFromScroll`** runs so the top label and trailing target stay in sync.

### UI
- Full-width strip at the **bottom** of the scroll area (`left: 0`, `right: 18` to clear the scrollbar), phase **`backgroundColor`**, underlined **Backlog** text (`size="xs"`, `c="dimmed"`), `aria-label="Scroll to Backlog"`.
- The existing bottom **gradient** now uses **`pointerEvents: "none"`** so it doesn’t steal clicks; the sticky control sits above it with **`zIndex: 2`**.

### Hooks
- Recompute on **scroll**, **ResizeObserver** on viewport + heading, and when **hydration** / list lengths / **backlog spacer** change (same idea as your other scroll layout hooks).

---

**User**

Works great!

Now last thing. We need:

1. Clicking "Today's work" label to scroll the scrollarea to top.
2. Clicking "Backlog" label (when part of the list is visible) to scroll to list to where the top label says "Backlog".

---

**Cursor**


Reading the label markup and scroll helpers in `TodaysTodo.tsx`.




Adding `scrollToTop`, wiring the outer section title to scroll to top when it shows "Today's tasks" and to call `scrollToBacklogHeader` when it shows "Backlog", and making the in-flow "Backlog" header clickable to align the backlog section.




Here’s what was added:

### 1. **Top title (above the scroll area)**
- Rendered as a **`button`** (unstyled: transparent background, full width, pointer cursor).
- **`Today's tasks`** (`trailingTargetList === "today"`): **`scrollToTop`** — sets `viewport.scrollTop = 0`, then runs **`updateTrailingTargetFromScroll`** in a microtask so the title and trailing target stay correct.
- **`Backlog`**: **`scrollToBacklogHeader`** — same as the sticky control (aligns the in-flow Backlog heading with the top of the viewport).
- **`aria-label`**: `"Scroll list to top"` vs `"Scroll to Backlog section title"`.

### 2. **In-flow “Backlog” heading** (inside the list)
- Also a **`button`**, **`onClick={scrollToBacklogHeader}`** — for when backlog is partly visible but the outer title is still “Today’s tasks”, or to re-snap alignment.
- **`backlogSectionRef`** is typed as **`HTMLButtonElement`** so the ref matches the control.

The copy in the app is still **“Today’s tasks”** (not “Today’s work”); say if you want that string changed everywhere.

---

**User**

It works but let's please use smooth scrolling.

---

**Cursor**


Switching programmatic scrolls to `scrollTo({ behavior: 'smooth' })`. `ScrollArea`'s `onScrollPositionChange` already updates the title during the animation.




Removing the unused `syncTrailingTargetFromScroll` parameter from the sticky hook.




Here’s what changed:

### `scrollToTop`
- Uses `viewport.scrollTo({ top: 0, behavior: "smooth" })` instead of assigning `scrollTop = 0`.
- Removed the `queueMicrotask` sync; `ScrollArea`’s `onScrollPositionChange={updateTrailingTargetFromScroll}` runs as the smooth scroll moves, so the title still updates.

### `scrollToBacklogHeader` (in `useTodaysTodoStickyBacklogLabel`)
- Uses `vp.scrollTo({ top: vp.scrollTop + delta, behavior: "smooth" })` with the same `delta` as before (`br.top - vr.top + 40`).
- Dropped the unused `syncTrailingTargetFromScroll` argument from that hook (call site + type updated).

### Already smooth
- Backlog append: `lastRowScrollRef.scrollIntoView({ behavior: "smooth" })`.
- Today row: `scrollPersistedRowIntoView` → `scrollIntoView({ behavior: "smooth" })`.

---

**User**

@app/_components/TodaysTodo/TodaysTodo.tsx:215-238 Let's move this and connected hooks to a separate component in a separate file.

---

**Cursor**


Reading `TodaysTodo.tsx` to identify the sticky Backlog block and `useTodaysTodoStickyBacklogLabel`.




Creating `TodaysTodoStickyBacklogAffordance.tsx` with the hook and sticky button component, then updating `TodaysTodo.tsx`.




Here’s what changed.

### New file: `TodaysTodoStickyBacklogAffordance.tsx`
- **`TodaysTodoStickyBacklogAffordance`** — presentational bottom “Backlog” control (`visible`, `backgroundColor`, `onScrollToBacklog`). Renders nothing when `visible` is false.
- **`useTodaysTodoStickyBacklogLabel`** — same behavior as before (visibility math, observers, **`scrollToBacklogHeader`** with smooth scroll).

Imports follow the style guide: `@mantine/core`, then `react`.

### `TodaysTodo.tsx`
- Imports **`TodaysTodoStickyBacklogAffordance`** and **`useTodaysTodoStickyBacklogLabel`** from that module.
- Replaces the inline sticky `Box` with:
  - `<TodaysTodoStickyBacklogAffordance visible={hydrated && showStickyBacklogLabel} backgroundColor={backgroundColor} onScrollToBacklog={scrollToBacklogHeader} />`
- Deletes the local hook implementation (~90 lines).

`scrollToBacklogHeader` is still created in **`TodaysTodo`** via the hook so the top title, in-flow Backlog heading, and sticky chip all share one handler. `showStickyBacklogLabel` is still used for the gradient `bottom-8` / `bottom-0` class.

---

**User**

- @app/_components/TodaysTodo/TodaysTodoStickyBacklogAffordance.tsx:70 This hook shouldn't be exported.
- @app/_components/TodaysTodo/TodaysTodoStickyBacklogAffordance.tsx:129-138 This should be outside of this component (in the @app/_components/TodaysTodo file and passed to this component in a prop.

---

**Cursor**


Moving the non-exported hook into `TodaysTodo.tsx`, extracting scroll logic into a small helper module, and leaving `TodaysTodoStickyBacklogAffordance.tsx` as the presentational component only.




Creating a scroll helper module, moving the private hook into `TodaysTodo.tsx`, and slimming `TodaysTodoStickyBacklogAffordance.tsx` to only the presentational component.




Here’s what changed:

### `todaysTodoScrollToBacklogHeader.ts` (new)
- Exports **`scrollViewportToBacklogHeader(viewportRef, backlogSectionRef)`** with the previous smooth-scroll math (`+ 40` kept as `BACKLOG_HEADER_SCROLL_ALIGN_OFFSET_PX`).

### `TodaysTodo.tsx`
- Imports **`scrollViewportToBacklogHeader`** and defines  
  **`scrollToBacklogHeader`** with `useCallback` → `scrollViewportToBacklogHeader(viewportRef, backlogSectionRef)`.
- That callback is passed to **`TodaysTodoStickyBacklogAffordance`** as **`onScrollToBacklog`**, and is still used for the top title and the in-flow Backlog heading.
- **`useTodaysTodoStickyBacklogLabel`** is a **file-local** hook at the bottom: it only returns **`showStickyBacklogLabel`** (no scroll logic).

### `TodaysTodoStickyBacklogAffordance.tsx`
- Only exports the **`TodaysTodoStickyBacklogAffordance`** UI; the hook was removed from this module.

The sticky hook is no longer exported from anywhere; scroll behavior lives in **`todaysTodoScrollToBacklogHeader.ts`** and is wired through **`TodaysTodo`** into the affordance via **`onScrollToBacklog`**.

---

**User**

@app/_components/TodaysTodo/TodaysTodo.tsx:122-148 Let's extract this and scrollToTopSectionLabel function to a separate file.

---

**Cursor**


Creating `TodaysTodoSectionTitleButton.tsx` with the button UI and click logic, moving `scrollToTop` into it, and removing the duplicate logic from `TodaysTodo.tsx`.




Here’s what’s in place (your tree already had this wired as `TodaysTodoSectionTitle`; the props type name is cleaned up):

### `TodaysTodoSectionTitle.tsx`
- **`TodaysTodoSectionTitle`** — the outer **Today’s tasks / Backlog** control (unstyled `Text` button).
- **`scrollToTop`** — smooth scroll to `top: 0` on `viewportRef`.
- **`scrollToTopSectionLabel`** — if `trailingTargetList === "today"` runs `scrollToTop`, otherwise **`scrollToBacklogHeader`** from the parent (shared with the in-flow Backlog heading and fixed bottom section).

### `TodaysTodo.tsx`
- Renders  
  `<TodaysTodoSectionTitle trailingTargetList={…} viewportRef={…} scrollToBacklogHeader={…} />`  
  and no longer defines `scrollToTop` / `scrollToTopSectionLabel` locally.

Props type is now **`TodaysTodoSectionTitleProps`** (renamed from `TodaysTodoSectionTitleButtonProps`).

---

**User**

There's a bug. With the cursor at the last item from "Today's tasks" list hitting arrow down moves the cursor to the first item in the "Backlog" (correct), but then hittin arrow up doesn't move the cursor to the last item in "Today's tasks".

---

**Cursor**


Tracing arrow-key handling for moving between the today and backlog lists.




Checking first-visual-line detection: `moveTextareaCaretOneVisualLine` may incorrectly return true on the first visual line (measurement noise), consuming ArrowUp and preventing `arrowUpFromFirstBacklog`.




Skipping intra-field ArrowUp handling when we're on the first backlog row and the caret is on the first visual line. `moveTextareaCaretOneVisualLine` can return true (moving the caret within the first line) due to measurement quirks, which prevents the handler from calling `arrowUpFromFirstBacklog`.




### Cause
On the **first Backlog row**, `ArrowUp` runs `moveTextareaCaretOneVisualLine` before the list-boundary logic. That helper can still report that it moved the caret on the **first visual line** (same-line soft wrap / mirror layout), so it `preventDefault`s and returns. The handler never reaches `arrowUpFromFirstBacklog`, so focus never returns to the last Today row.

### Change
For **`listKind === "backlog"`** and **`isFirst`** (first backlog row), if the caret is on the **first visual line** (`textareaVisualLineStartIndex(el, start) === 0`), we **don’t** call `moveTextareaCaretOneVisualLine` and go straight to **`arrowUpFromFirstBacklog`**.

Multi-line first backlog rows are unchanged: if the caret is on a **lower** visual line (`lineStart > 0`), `ArrowUp` still moves up inside the field first; only when you’re on the top visual line does it jump back to Today.

---

**User**

DIdn't help

---

**Cursor**


Tracing uses of `listKind` in the persisted row — it may be conflated with the trailing target.




Identifying the bug: `usePersistedTodoRowInput` destructures `listKind` from `focusAPI`, but `focusAPI.listKind` is the trailing row's scroll target (`trailingTargetList`), not the row's list. When the top label is "Today's tasks", `focusAPI.listKind` is `"today"` while we're on a backlog row — so `listKind === "backlog"` fails and `arrowUpFromFirstBacklog` never runs. Using the row's `listKind` prop (passed into the hook) for keyboard navigation and store calls.




### Root cause

`usePersistedTodoRowInput` took `listKind` from **`focusAPI`**. On `TodaysTodoFocusApi`, `listKind` is the **trailing “add task” target** (`trailingTargetList` — driven by scroll), **not** whether this row is in Today vs Backlog.

So with the section title still on **“Today’s tasks”** (`trailingTargetList === "today"`), the first **Backlog** row still saw `listKind === "today"`. Then:

- `else if (listKind === "backlog")` never ran for Arrow Up  
- `arrowUpFromFirstBacklog` was never called  

The earlier “first visual line” tweak didn’t fix that, because the branch condition was wrong.

### Fix

Pass the row’s real list from props into the hook and use **that** for navigation and `insertEmptyAt` / list boundaries:

- `UsePersistedTodoRowInputArgs` now includes `listKind: TodoListKind` (the same `listKind` as `TodoPersistedRow`).
- `listKind` is **no longer** read from `focusAPI` in this hook.

`focusAPI.listKind` stays only for the **trailing row** (`TodoTrailingRow`), which is the intended use.

---

**User**

Another thing. When in the trailing row, hittin arrow up moves the cursor to either last item of today's tasks or backlog depending on the current scroll. We need it to always move the cursor to the backlog.

---

**Cursor**


Updating `TodaysTodo.tsx`: `lastItem` is derived from `trailingTargetList`, so it switches between lists. Using the last backlog item when the backlog has items; otherwise falling back to the last today item.




Here’s what was going wrong and what we changed.

### Cause
`TodoTrailingRow` gets `lastItem` from `lastActive`, which was tied to **scroll** (`trailingTargetList`): last row of **today** vs **backlog**. So Arrow Up from the trailing field followed that, not the backlog.

### Change
In `TodaysTodo.tsx`, `lastItem` is now **`lastItemForTrailingKeyboardNav`**:

1. If **backlog has any items** → last **backlog** row (always the target for moving “up” from the add field when backlog exists).
2. If **backlog is empty** → last **today** row (so Arrow Up / Arrow Left / Backspace from trailing still have somewhere to go).

`TodoTrailingRow` is unchanged; it still uses `lastItem` for Arrow Up, Arrow Left, and empty Backspace, so those stay aligned with this rule.

---

**User**

One last thing. Clicking "Today's tasks" and "Backlog" labels should not only scroll the list but also focus on the first element of the list under the label.

---

**Cursor**


Inspecting section title wiring and focus APIs.




Implementing scroll-then-focus via a `scrollend`/timeout helper, wiring the outer section title and the in-flow Backlog heading.




Here’s what changed:

### `scheduleAfterViewportSmoothScroll` (`TodaysTodo.tsx`)
Runs a callback once smooth scrolling has finished: prefers the viewport’s **`scrollend`** event, with a **500ms** fallback so engines without `scrollend` still focus. Uses a **`ran`** flag so `scrollend` and the timer can’t both run the action.

### `onSectionTitleClick` (outer **Today’s tasks** / **Backlog** control)
- **Today’s tasks** (scroll mode is “today”): `scrollTo({ top: 0, smooth })`, then focus **`todayItems[0]`** at caret `0` when it exists.
- **Backlog**: existing `scrollToBacklogHeader()`, then focus **`backlogItems[0]`** at `0` when it exists.

### `onBacklogHeadingClick` (in-flow **Backlog** `TaskListTitle`)
- Same as the backlog branch: scroll to the backlog header, then focus the first backlog row when present.

### `TodaysTodoSectionTitle.tsx`
- Props are now **`trailingTargetList`** (label text) and **`onClick`** (parent handles scroll + focus).
- **`aria-label`** updated to mention focusing the first task.

Sticky/fixed controls that only call `scrollToBacklogHeader` are unchanged (no auto-focus). Say if those should match this behavior too.

---

**User**

You forgot to also change @app/_components/TodaysTodo/TodaysTodoFixedBottomSection.tsx .

---

**Cursor**


Wiring the fixed bottom section to `onBacklogHeadingClick` (scroll + focus first backlog item) and updating the prop name and accessibility text.




Here’s what changed:

### `TodaysTodo.tsx`
- Passes **`onBacklogHeadingClick`** into `TodaysTodoFixedBottomSection` instead of **`scrollToBacklogHeader`**, so the sticky bottom “Backlog” control uses the same **scroll + focus first backlog row** behavior as the in-flow backlog heading.

### `TodaysTodoFixedBottomSection.tsx`
- Renamed the prop from **`onScrollToBacklog`** to **`onBacklogClick`** and documented that it scrolls to the backlog header and focuses the first backlog task when it exists.
- **`TaskListTitle`** now uses **`onBacklogClick`** and a clearer **`title`** for the accessible label.

Sticky backlog behavior now matches the main backlog title and section-title backlog action.

