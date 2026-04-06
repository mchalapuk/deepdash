# Tool daily to-do implementation
_Exported on 4/3/2026 at 21:34:23 GMT+2 from Cursor (2.6.21)_

---

**User**

Implement the following to-dos from the plan (the plan is attached for your reference). Do NOT edit the plan file itself.

You have been assigned the following 1 to-do(s) with IDs: tool-daily-todo

1. [tool-daily-todo] Narrow scroll; one key/day; immediate valtio updates + debounced/throttled localStorage + flush on close; checkbox; done dim+strike; fake trailing row + ActionIcon; Input per row; full keyboard spec + focus rules; rollover modal spec

These to-dos have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the assigned to-dos.

---

**Cursor**


Implementing the daily todo feature per the plan. Exploring the codebase and marking the assigned todo in progress.




Implementing the full `todoStore` (debounced per-day persistence, day rollover, flush hooks) and `TodaysTodo` with keyboard handling and the rollover modal. Updating the page layout.




Fixing `TodoTrailingRow` (focus handling, Delete/Backspace focus rules) and cleaning up broken code.




Here is what was implemented for **tool-daily-todo**.

### `app/_stores/todoStore.ts`
- **One `localStorage` key per calendar day:** `worktools.todo.day.{YYYY-MM-DD}` with JSON `{ items: TodoItem[] }` (persisted rows only).
- **Valtio:** `hydrated`, `dayKey`, `items`; all edits go through **`todoActions`** (proxy is not exported).
- **Persistence:** **`subscribe`** schedules a **400ms debounced** write; **`flushPersistSync()`** runs on **`beforeunload`**, **`pagehide`**, and **`visibilitychange`** when the document is **hidden** (so pending debounced saves are not lost).
- **Midnight:** **`setInterval`** (60s) plus **visibility** refresh call **`syncCalendarDayIfNeeded()`** (flush old day, then load today).
- **Rollover helpers:** `getRolloverSummary()`, `appendYesterdayIncomplete()`, `markRolloverPromptedForToday()`, `wasRolloverPromptedToday()` with key `worktools.todo.lastRolloverPrompt.v1`.

### `app/_components/TodaysTodo.tsx`
- **Narrow column:** `miw={220}`, `maw={320}`, `mah={420}`, **`ScrollArea`** + compact **`Text` / `Input`**.
- **Rows:** **`Checkbox`** + **`Input`** per item; **done** uses strikethrough + reduced opacity.
- **Trailing row:** **`ActionIcon` + `IconPlus`** (focuses the add field) + **`Input`**; **Enter** or **blur** commits non-empty text as a new item.
- **Keyboard behavior:** Enter (start / end / split), Backspace/Delete on empty (remove + focus prev/next per spec), merge at edges, **Escape** blurs only.
- **Rollover modal:** First **`mousemove`** after load (if not already prompted today): loads **yesterday** from storage; if there is nothing meaningful, marks prompted and skips; otherwise **Mantine `Modal`** with completed summary + optional **Yes/No** to append **non-empty incomplete** items from yesterday.

### `app/page.tsx`
- **Layout:** Primary **`Stack`** (Pomodoro + Today’s work) beside **`TodaysTodo`** with **`wrap="wrap"`** for smaller viewports.

`npm run build` and `npm test` both succeed.

---

**User**

I changed a few things in the UI.

More things that need changing:
- [Bug] Loosing focus in an empty todo item should remove it. Currently it doesn't.
- [Bug] Hitting enter in the newly created item (next to plus icon at the end of the list) should confirm the item and move focus back to the fake item at the end of the list. Currently the focus moves at the end of the new confirmed item.
- [Bug] Hitting esc after writing new item next to the plus icon should delete the new item and remove focus. Currently it confirms the item and moves focus to the newly created item.
- The list should have editor-like behaviour which means that using up/down arrows should move the cursor between items. The cursor should stay at the same character when moving to the next/previous item.
- Also, right arrow when at the end of an item shuld move the cursor to the beginning of the next item (including the fake item at the end). Left arrow at the beginning of an item should move the cursor to the end of the previous item.

---

**Cursor**


Reading the todo UI implementation to fix the bugs and add arrow-key navigation.




Implementing blur removal of empty rows, fixing trailing Enter/Esc/blur behavior, and adding arrow-key navigation. Lifting trailing draft state to the parent so we can clamp the caret when moving between the last row and the trailing field.




Adding `removeItemIfEmpty` to the store and updating `TodaysTodo.tsx` with lifted trailing state, blur/arrow handling, and Esc/Enter fixes.




Here’s what changed:

### 1. Empty row removed on blur
- **`onBlur`** on each persisted `Input` schedules **`todoActions.removeItemIfEmpty(id)`** on the next macrotask so focus can move first.
- New store helper **`removeItemIfEmpty`**: deletes the row only if it still exists and **`text.trim() === ""`**.

### 2. Enter on the trailing “add” field
- **`commitTrailing`** in the parent adds the item, clears **`trailingDraft`**, then **`focusTrailing(0)`** so focus returns to the add row (not the new item).

### 3. Esc on the trailing field (with text)
- **`draftRef`** stays in sync with **`draft`**; on Esc we **`setDraft("")`**, set **`draftRef.current = ""`**, then **`blur()`**.
- **`onBlur`** uses **`draftRef.current`**: if it’s empty, it does **not** commit, so Esc never creates a todo.

### 4. Up / Down between rows (same column)
- With a **collapsed** caret and **no** Alt/Ctrl/Meta: **ArrowUp** / **ArrowDown** move to the previous/next field and set the caret with **`clampColumn(start, lineLength)`**.
- From the **last** persisted row, **Down** goes to the trailing input with the same column rule (using **`trailingDraft.length`**).
- From the **trailing** row, **ArrowUp** goes to the last persisted row with the same rule.

### 5. Left / Right at line boundaries
- **ArrowLeft** at index **0**: jump to **end** of the previous field (persisted or, for trailing, the last item).
- **ArrowRight** at **end** of a persisted line: jump to **start** of the next field (**0**), or to the trailing field when you’re on the last item.

### Other
- Trailing text is **lifted** to **`TodaysTodo`** as **`trailingDraft`** so column clamping into the add row stays correct.
- Helper **`clampColumn`** at the bottom of **`TodaysTodo.tsx`**.

---

**User**

We have one more bug. Because of the externally managed state, modifying the todo item in the middle moves the cursor at the end.

---

**Cursor**


Preserving selection across re-renders: controlled inputs reset the caret when `value` updates from Valtio. Reading the component and adding a selection restore (e.g. capture in `onChange` + `useLayoutEffect`).




Capturing the selection in `onChange` and restoring it in `useLayoutEffect` after the controlled `value` updates. Applying the same pattern to the trailing row (parent-controlled `draft`).




Here’s what was going wrong: the field is **controlled** (`value={text}` from Valtio). Each keystroke updates the store, React re-renders, and the DOM input is updated from props, which **drops the selection** and leaves the caret at the end.

**Change:** On each `onChange`, store `selectionStart` / `selectionEnd` in a ref, then in **`useLayoutEffect`** (runs after DOM updates, before paint), if this input is still focused, call **`setSelectionRange`** with those values and clear the ref.

The same pattern is applied to the **trailing** row, since `draft` also lives in parent state and can cause the same jump.

Refs are wired with a small **`setInputRefCombined`** so we still register the node in the parent `rowRefs` map for focus helpers.

---

**User**

OK. Great! Now I want to change the plan a bit.

Originally we wanted to have this modal where user decides about the rollover tasks. I want to completely remove it.

Instead of the modal, let's simply move any pending tasks to today. 

---

**Cursor**


Removing the rollover modal and implementing automatic migration of yesterday's incomplete tasks into today. Reading the current store and component to implement this safely (idempotent: avoid duplicating on refresh).




Implementing automatic rollover in the store (move pending off yesterday’s storage into today, idempotent) and removing the modal UI.




Adding a per-day rollover marker and healing strip so we avoid duplicates if today persists before yesterday is stripped, and we repair yesterday storage when the marker says rollover already ran.




Here’s what changed:

### Behavior
- On **load** (and when the **calendar day rolls over** while the tab is open), any **yesterday** tasks that are **not done** and have **non-empty text** are **appended to today** (new ids), **written to today’s** `localStorage` bucket, then **removed from yesterday’s** bucket (yesterday keeps **done** rows and **empty** incomplete rows only).
- **No modal**, no `mousemove` listener, no “Yes/No”.

### Idempotency
- A marker key `worktools.todo.autoRolloverFrom.{yesterday}` stores **which calendar day** those tasks were rolled into (today’s `dayKey`).
- If that marker already matches **today**, we **don’t append again**; we still run **`stripPendingFromDayBucket`** on yesterday so a half-finished rollover (e.g. crash after today was saved) can **clean up** yesterday without duplicating tasks.

### Code
- **`todoStore.ts`**: removed `RolloverSummary`, prompt key, `getRolloverSummary`, `appendYesterdayIncomplete`, `markRolloverPromptedForToday`, `wasRolloverPromptedToday`. Added `moveYesterdayPendingIntoToday`, `stripPendingFromDayBucket`, `syncTodayPersistSnapshot`, and the marker helper.
- **`TodaysTodo.tsx`**: removed rollover state, effect, modal, and unused Mantine imports (`Modal`, `Button`).

The dashboard plan markdown in `.cursor/plans/` still describes the old modal; say if you want that doc updated too.

---

**User**

All right. Now please make sure that @app/_stores/todoStore.ts is compliant with @STORE_STYLEGUIDE.md.

---

**Cursor**


Restructuring `todoStore.ts` to match the style guide: constants above the proxy, proxy before exported types, domain helpers, then persistence (including dirty-tracking state) at the end. Renaming `loadTodayFromStorage` → `loadFromStorage` to match the pomodoro pattern.




Here’s how `todoStore.ts` was aligned with **STORE_STYLEGUIDE.md**:

### Layout (mandatory order)
1. **Imports** — `valtio` → blank line → `valtio/vanilla` → blank line → `@/` modules (`pomodoroStore`, `logger`).
2. **Module-level constants** — `DEBOUNCE_MS`, `DAY_CHECK_INTERVAL_MS`, plus **`TODO_DAY_STORAGE_KEY_PREFIX`** and **`TODO_AUTO_ROLLOVER_MARKER_PREFIX`** (SCREAMING_SNAKE_CASE). `dayStorageKey` / `autoRolloverMarkerKey` stay as small helpers built from those prefixes (same on-disk keys as before: `worktools.todo.day.*` and `worktools.todo.autoRolloverFrom.*`).
3. **`todoStore` proxy** — private, documented `hydrated` / `dayKey`.
4. **Exported types** — `TodoItem`, `TodoDayDocumentV1` (after the proxy, like `pomodoroStore`).
5. **Hook** — `useTodoList` (`useSnapshot` only).
6. **Actions** — `todoActions` with **`init` first**; subscribe still guards on `hydrated`.
7. **`// --- domain helpers ---`** — `indexOfId`, `previousLocalDayKey` only (no `localStorage` here).
8. **`// --- persistence ---` (end of file)** — dirty JSON (`lastWrittenJson`), debounce timer, `pickPersistedDocument`, `applyLoadedDay`, parse/validate (`isTodoItem`, `parseTodoDayDocument`, `readValidatedDayItems`), `storageSetItem`, persist pipeline, rollover helpers, `loadFromStorage`, `syncCalendarDayIfNeeded`.

### Other tweaks
- Renamed **`loadTodayFromStorage` → `loadFromStorage`** to mirror the pomodoro store.
- Dropped the extra `try/catch` around marker writes; **`storageSetItem`** already logs failures.
- **`stripPendingFromDayBucket`** now only calls **`storageSetItem`** (no nested try/catch).

`npm run build` succeeds.

---

**User**

Code review:
- @app/_stores/todoStore.ts:8 No harm in checking that every second.
- @app/_stores/todoStore.ts:14-21 This is violating store layout rules.
- @app/_stores/todoStore.ts:33-37 Should be after TodoDayDocumentV1. General rule is: Main things first, then smaller things which are parts of main things. Please add this to the style guide if it wasn't not clear.

---

**Cursor**


Applying the code changes and updating the style guide.




Updating `todoStore.ts` (1s interval, move key builders into persistence, reorder types) and extending `STORE_STYLEGUIDE.md`.




Here’s what changed:

### `app/_stores/todoStore.ts`
- **`DAY_CHECK_INTERVAL_MS`** is **`1000`** so the calendar-day check runs every second.
- **`dayStorageKey`** and **`autoRolloverMarkerKey`** are moved into the **`// --- persistence ---`** block (right before `lastWrittenJson`), so nothing sits between constants and the `proxy` except the `proxy` itself.
- **Exported types:** **`TodoDayDocumentV1`** first, then **`TodoItem`** (composite before parts; TS is fine with the forward reference).

### `STORE_STYLEGUIDE.md`
- **Layout table (row 4):** notes that exported types follow **main → parts** order.
- **Module-level constants:** explicit rule — **no functions** between constants and `proxy`; key builders and similar belong under **Persistence**.
- **Exported types:** new bullet on **order (main before parts)** and that TS allows a part type to be declared just after the composite that uses it.
- **Storage I/O:** states that **persistence-only helpers** (e.g. key builders using prefix constants) live in that section, with **prefix constants** still above the `proxy`.

---

**User**

Now please make sure that @app/_components/TodaysTodo.tsx is compliant with @REACT_STYLEGUIDE.md.

---

**Cursor**


Checking how other components apply phase color to ActionIcon and fixing empty catch blocks per the style guide.




Refactoring `TodaysTodo.tsx`: extracting `useTodaysTodoMechanics`, reordering sections (main → subcomponents → hook → `clampColumn`), adding named prop types, using `TodoItem` from the store, logging in catch blocks, and applying phase color to the add `ActionIcon` per the style guide.




Here’s what was updated for **REACT_STYLEGUIDE.md** compliance:

### File layout
1. **`TodaysTodo`** — Exported first after imports; mostly wiring + JSX (`useTodaysTodoMechanics()`).
2. **`TodoPersistedRow`** / **`TodoTrailingRow`** — Private subcomponents next.
3. **`useTodaysTodoMechanics`** — Cross-cutting init, refs, focus helpers, `commitTrailing`, ref registration (per **State and side effects** / **Custom hooks**).
4. **`clampColumn`** — Pure helper at the bottom.

### Imports
- Groups: Mantine → Tabler → React → `@/` (`pomodoroStore`, `todoStore`, `layout`, `logger`).

### Props & domain types
- **`TodoPersistedRowProps`** and **`TodoTrailingRowProps`** named types above each subcomponent.
- **`RowItem` removed**; **`TodoItem`** comes from **`@/app/_stores/todoStore`**.
- **`TodaysTodoMechanics`** names the hook return shape (object, not a tuple).

### Side effects & mutations
- **`todoActions.init()`** and focus/commit logic live in **`useTodaysTodoMechanics`**, not in the shell component.

### Error handling
- All previous empty **`catch`** blocks now **`log.warn(..., e)`** (stricter than bare `console.warn`, matches app logging).

### UI / primary add control
- Trailing **`ActionIcon`**: **`variant="light"`** and **`color={getColorFromPhase(phase)}`** with **`useCurrentPhase()`**, aligned with **Primary action color** for the main add affordance.

### JSX
- **`Stack`** props indentation normalized.

`TodoPersistedRow` is still long (~180 lines); splitting out keyboard handling would be the next step if you want to enforce the ~100-line component guideline more strictly.

---

**User**

- @app/_components/TodaysTodo.tsx:60-74 many functions passed into child components. They could be grouped into a single object named focusAPI which would make this a lot cleaner and easier to understand.
- @app/_components/TodaysTodo.tsx:113-260 Not compliant with the style guide. Please create a custom hook for all this.
- @app/_components/TodaysTodo.tsx:327-356 Same.
- @app/_components/TodaysTodo.tsx:398-437 Way too big of a function declaration to put directly in a property. Please add info about that to the styleguide.

---

**Cursor**


Implementing `focusAPI`, extracting `usePersistedTodoRowInput` and `useTrailingTodoRowInput`, and updating the React style guide.




Implementing `focusAPI`, extracting `usePersistedTodoRowInput` and `useTrailingTodoRowInput`, and updating the style guide.




Here’s what changed:

### `focusAPI`
- Added **`TodaysTodoFocusApi`**: `trailingDraftLength`, `setRowInputRef`, `setTrailingInputRef`, `focusRow`, `focusTrailing`.
- **`useTodaysTodoMechanics`** builds it with **`useMemo`** and returns **`focusAPI`** (no separate `focusRow` / `focusTrailing` on `m`).
- **`TodoPersistedRow`** / **`TodoTrailingRow`** each take **`focusAPI={m.focusAPI}`** plus their non-focus props (`item`, `draft`, `commitTrailing`, etc.).

### Custom hooks
- **`usePersistedTodoRowInput`** — selection `useLayoutEffect`, merged ref (`composeInputRef`), blur, **`onChange`** / **`onKeyDown`** as **`useCallback`**s.
- **`useTrailingTodoRowInput`** — trailing selection `useLayoutEffect`, **`bindRef`**, **`onBlurTrailing`**, **`onChange`**, **`onKeyDown`**, **`onAddButtonClick`** (add button no longer uses an inline handler).

### `REACT_STYLEGUIDE.md`
- Under **JSX details**, new bullet **Handlers in JSX:** avoid long anonymous handlers in props; use **`useCallback`** (often in a hook) or a **named handler**, then pass **`onKeyDown={handleKeyDown}`** (and the same idea for heavy **`onChange`**).

### Hook order
- **`useTodaysTodoMechanics`** stays the main hook; **`usePersistedTodoRowInput`** and **`useTrailingTodoRowInput`** follow it as subtree-specific helpers.

---

**User**

- @app/_components/TodaysTodo.tsx:70-71 isFirst and isLast could also me methods of the focuAPI.
- @app/_components/TodaysTodo.tsx:77-79 Could be grouped into draftAPI for readability.

---

**Cursor**


Adding `isFirstRow` / `isLastRow` to `focusAPI`, introducing `draftAPI`, and updating mechanics and hooks.




Here’s what changed:

### `focusAPI`
- Added **`isFirstRow(rowIndex)`** and **`isLastRow(rowIndex)`**, implemented from the current `items.length` inside `useMemo` (dependency: **`items.length`**).
- **`TodoPersistedRow`** no longer takes `isFirst` / `isLast`; **`usePersistedTodoRowInput`** reads **`focusAPI.isFirstRow(index)`** and **`focusAPI.isLastRow(index)`** at the start of each **`onKeyDown`** so list changes stay correct.
- **`onKeyDown`** deps are **`[id, index, items, focusAPI]`** (no separate booleans).

### `draftAPI`
- New **`TodaysTodoDraftApi`**: **`draft`**, **`setDraft`**, **`commitTrailing`**.
- Built with **`useMemo`** in **`useTodaysTodoMechanics`** (deps: **`trailingDraft`**, **`setTrailingDraft`**, **`commitTrailing`**).
- **`TodaysTodoMechanics`** now exposes **`draftAPI`** instead of the three separate fields.
- **`TodoTrailingRow`** takes **`draftAPI={m.draftAPI}`**; **`useTrailingTodoRowInput`** destructures **`draftAPI`** for **`draft` / `setDraft` / `commitTrailing`**. **`Input`** uses **`value={draftAPI.draft}`**.

---

**User**

One more thing about daily todo. Whenever a new item is added at the end of the list, the list should scroll the new item into view.

---

**Cursor**


Checking Mantine ScrollArea API for viewport refs and how `addItem` works in the store.




Implementing append detection (length increases and last item id changed) with hydration gating, and attaching a ref to the last row for `scrollIntoView`.




Using stable effect dependencies to avoid running the layout effect on every snapshot tick, and fixing the `React` namespace import.




Wrapping only the last row in a scroll anchor div to avoid an extra wrapper on every row.




Here’s what was implemented:

### Behavior
After hydration, a **`useLayoutEffect`** treats a change as an **append at the end** when:
- the list **grows** (`length` increases), and  
- the **last item’s id** is different from the previous last id  

So it runs for the trailing “Add task” flow (`addItem`), and **not** for a new row inserted in the middle (length goes up but the previous last row is unchanged). It also won’t run on the initial baseline pass after load.

When that happens, the **last row’s** scroll anchor gets `scrollIntoView({ block: "nearest", behavior: "smooth" })` so Mantine’s `ScrollArea` viewport scrolls only enough to show the new row.

### Code
- `lastRowScrollRef` on a wrapper **only around the last** `TodoPersistedRow`.
- Baseline refs `scrollBaselineLen` / `scrollBaselineLastId` reset after the first hydrated snapshot so the first paint doesn’t animate.

If you want the same scroll when splitting the last line with Enter (new last segment with a new id), that already matches this heuristic because the last id changes while length increases.
