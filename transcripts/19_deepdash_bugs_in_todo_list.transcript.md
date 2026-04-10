# Backlog deletion on day switch
_Exported on 4/11/2026 at 01:11:23 GMT+2 from Cursor (2.6.21)_

---

**User**

It seems that the whole backlog is deleted when switching to new day...

---

**Cursor**


Tracing how the backlog is stored and what happens on day changes.




Reading `todoStore.ts` to trace day rollover, persistence, and backlog handling.




Checking product intent for backlog vs. day buckets and migration from v1 documents.




Checking for todo store tests and verifying rollover behavior.




Identifying the issue: todo data is per calendar day. `moveYesterdayPendingIntoToday` rolls incomplete tasks from yesterday's **Today** list into the new day but never rolls **backlog** items—so the new day loads an empty backlog. `stripPendingFromDayBucket` only stripped yesterday's `items`, not `backlogItems`. Implementing backlog rollover and extending `stripPendingFromDayBucket` to strip moved backlog rows from yesterday.




Adding a Jest test that uses fake timers and `jest.resetModules()` for isolation.




## What was wrong

Todos are stored **per calendar day** (`deepdash.todo.day.{YYYY-MM-DD}`). On a new day, the app loads **that day’s** bucket (often empty) and only **rolled over incomplete tasks from yesterday’s “Today” list** (`items`). **Backlog** lived in `backlogItems` for the same day key, but nothing copied those rows into the new day—so after midnight you effectively saw an empty backlog even though the work was still sitting under **yesterday’s** key in `localStorage`. That felt like the backlog was deleted.

## What we changed

In `app/_stores/todoStore.ts`:

1. **`stripPendingFromDayBucket`** – Also strips non-empty incomplete rows from **backlog** on the old day (same rule as today: keep completed and empty placeholder rows), so moved backlog rows are not left behind on yesterday.

2. **`moveYesterdayPendingIntoToday`** – After rolling today’s pending `items`, it now rolls **incomplete, non-empty backlog** rows into **today’s** `backlogItems` (new IDs, same as today’s task rollover).

3. **Marker branch** – If the rollover marker was already set (e.g. you opened the app once after an old build), we still **pull any remaining backlog** off yesterday and then strip, so one-time recovery for people who already crossed midnight with the previous behavior.

Tests were added in `__tests__/todoRollover.test.ts` (including the case where yesterday had **only** backlog and no pending “today” tasks, which the old `if (pending.length === 0) return` skipped entirely).

After deploying, the next load on a new day should show yesterday’s backlog on **today** again. Data that only existed under the previous day’s key is migrated on that first load of the new day.

---

**User**

So this is a problem with the data structure. We need onle one backlog which is completely separate from the day structures. Also please migrate all per-day backlogs to this one true backlog.

---

**Cursor**


Refactoring the todo model to a single global backlog and migrating per-day backlogs. Exploring the codebase to implement it.




Implementing: adding the backlog storage key, then refactoring `todoStore.ts` and updating dependent files.




Removing the unused `parseTodosByDayRecordV3` and fixing `migrateTodoSliceToLatest` for v3: use `parseTodosByDayRecordV3` for day documents when version is 3 so we don't rely on the v2 parser for v3-only exports.




Treating top-level `backlogItems` as present whenever it's an array (so v3 exports remain correct if `version` is missing).




Here’s what was implemented.

### Model
- **Per-day storage** (`deepdash.todo.day.{YYYY-MM-DD}`) now holds only **`{ items }`** (`TodoDayDocumentV3`).
- **One global backlog** is stored under **`deepdash.todo.backlog.v1`** as JSON `{ backlogItems: TodoItem[] }`.
- **`TODO_EXPORT_VERSION` is `3`**. `TodoExportV3` adds top-level **`backlogItems`** and drops per-day backlog from `todosByDay`.

### Migration paths
1. **Runtime (localStorage)** – `migrateLocalStoragePerDayBacklogToGlobal()` runs on load (after legacy key migration): reads every day bucket, merges all `backlogItems` into the global key (deduping by **id**, global rows first, then calendar order of days), rewrites each day file without `backlogItems`.
2. **JSON import** – `migrateTodoSliceToLatest()` accepts slice **v1 / v2 / v3**: v2 per-day backlogs are merged into **`backlogItems`**, days are normalized to v3; top-level **`backlogItems`** is merged when present (even if `version` is missing, as long as it’s an array).

### Rollover
- **`moveYesterdayPendingIntoToday`** only moves incomplete **today-list** rows; backlog is no longer tied to the day boundary.

### Files touched
- `lib/persistKeys.ts` – `TODO_BACKLOG_STORAGE_KEY`
- `app/_stores/todoStore.ts` – storage, export/import, migration
- `lib/dataExport.ts` – types use `TodoExportV3`
- `lib/firstRunSeed.ts` – seed bundle v3 + “has data” checks backlog key
- `__tests__/dataExport.test.ts` – expectations + **v2 → v3** fixture test
- `__fixtures__/todo-slice-v2-perday-backlog.json` – migration fixture
- `__tests__/todoRollover.test.ts` – global backlog + local migration behavior

**Bundle** `CURRENT_DEEPDASH_EXPORT_VERSION` is still **1**; old exports are upgraded by the todo slice migrator when imported.

---

**User**

@app/_stores/todoStore.ts:397 We need the same for backlog items.

---

**Cursor**


Adding `omitEmptyBacklogItems` alongside `omitEmptyTodoDayItems`, sharing a single `todoRowHasVisibleText` predicate, and applying it wherever backlog rows are parsed or merged.




Here’s what changed:

### Shared rule
- **`todoRowHasVisibleText`** – same rule as for day rows: `text.trim() !== ""`.

### Backlog helper
- **`omitEmptyBacklogItems(items)`** – filters backlog arrays the same way **`omitEmptyTodoDayItems`** filters day `items`.

### Where it’s used
- **`readValidatedGlobalBacklogItems`** – parsed backlog is run through **`omitEmptyBacklogItems`** (array or `{ backlogItems }` shape).
- **`parseTodoDayDocumentV2`** – backlog branch uses **`omitEmptyBacklogItems`** (items still use **`todoRowHasVisibleText`**).
- **`parseTopLevelBacklog`** – uses **`omitEmptyBacklogItems`** instead of a manual filter.
- **`mergeTopAndPerDayBacklogs`** – skips rows without visible text in **`fromDays`** as well as **`top`**.
- **`importData`** – persisted backlog and in-memory **`todoStore.backlogItems`** use **`omitEmptyBacklogItems`** so imports can’t leave whitespace-only rows in storage.
- **`collectTodoExportFromLocalStorage`** – relies on **`readValidatedGlobalBacklogItems()`** only (no extra filter).

`omitEmptyTodoDayItems` now builds on **`todoRowHasVisibleText`** so day and backlog behavior stay aligned.

---

**User**

There's one more bug in the task list.

Sometimes, when using up arrow to move from to a multi-line todo item, the cursor jumps to a weird place which is not in the last row.

It's the same when using down arrow to move to a multi-line task.

Sometimes it jumps one character further than it should. Sometimes it jumps 3 rows away from where it should.

Also when moving the cursor inside a multi-line item, it sometimes jumps one character less than it should.

---

**Cursor**


Tracing keyboard navigation and caret handling in the todo row components.




Identifying the issue: ArrowDown uses `start` (absolute string index) as the caret column for the next row, but we should use the visual column on the current line — same as ArrowUp. `focusRowFromBelow` already uses `textareaCaretIndexOnLastVisualLine`; we need `textareaCaretIndexOnFirstVisualLine` and a matching focus helper. Fixing unitless `line-height` (e.g. `2.1`) so `parseFloat` isn't treated as pixels.




Implementing `textareaCaretIndexOnFirstVisualLine`, fixing line-height resolution for pixel comparisons, and adding `focusRowFromAbove` plus trailing focus-by-column helpers.




Here’s what was going wrong and what we changed.

### Cause
1. **ArrowDown between rows** used `selectionStart` (`start`) as the caret position on the **next** row. That value is a **global UTF‑16 index** in the current field. On a multi-line task, that is **not** the column on the **current visual line** (ArrowUp already used `textareaVisualLineColumnOffset` for that).
2. **`arrowDownFromLastToday`** used `focusRow(first.id, clampColumn(column, first.text.length))`, which again treats `column` like a **string index** and ignores **first visual line** vs rest of the text (and soft wrapping).
3. **Line height** for thresholds used `parseFloat(cs.lineHeight)`. With a **unitless** line-height like `2.1`, that becomes **2.1**, while `top` from layout is in **pixels**, so “same line” checks and vertical movement were inconsistent.

### Fixes
- **`todaysTodoTextareaNav.ts`**: `lineHeightPxForTextarea()` so unitless `line-height` is converted with `font-size` (and `%` / `normal` handled). Added **`textareaCaretIndexOnFirstVisualLine()`** (and **`textareaFirstVisualLineMaxCaretIndex`**) to mirror **`textareaCaretIndexOnLastVisualLine`**.
- **`TodaysTodo.tsx`**: **`focusRowFromAbove`** and **`focusTrailingAtFirstLineColumn`**; **`arrowDownFromLastToday`** / **`arrowUpFromFirstBacklog`** use them instead of `focusRow` / `focusTrailing` with raw indices.
- **`TodoPersistedRow.tsx`**: On ArrowDown, **`col = textareaVisualLineColumnOffset(el, start)`**, then **`focusRowFromAbove(next.id, col)`** or **`arrowDownFromLastToday(col)`** / **`focusTrailingAtFirstLineColumn(col)`**.
- **`types.ts`**: Documented the new focus helpers on **`TodaysTodoFocusApi`**.

Together, this aligns ArrowDown with ArrowUp (visual column + correct line in the target field) and stabilizes vertical caret math inside the textarea.

---

**User**

It's definitely better. I think the biggest problem right now is that it still sometimes jumps the cursor one char less than it should when moving beween line of the same task.

For example, I have a 4-line task in which I put the cursor at the beginning of the first line. Then I press arrow down. Instead of cursor moving to the next line it jumps to the end of the first line (1 chat mistake). After that, next down arrow puts the cursor at the end of the second line (good). Next down arrow puts the cursor at the end of the third line (good). Next down arrow moves the cursor should move the cursor to the end of the fourth line, but instead of that the cursor jumps to the beginning of the first line of the first task. Another 1 char mistake but this time +1 char instead of -1.

---

**Cursor**


Analyzing `moveTextareaCaretOneVisualLine` and edge cases at line boundaries.




Rewriting `moveTextareaCaretOneVisualLine` to use `textareaVisualLineStartIndex` for consistent line boundaries. The binary-search + threshold approach can misclassify indices (especially at position 0 and on the last line). Implementing the walk-based algorithm and handling last-line Arrow Down (move to end of text when not already there).




Here’s what was going wrong and what we changed.

### Root cause
`moveTextareaCaretOneVisualLine` used **binary search on `getBoundingClientRect().top`** plus **fixed pixel thresholds** (`lh * 0.15`, etc.). That could:

1. **Mis-detect the first index on the next line** (especially from column 0 on line 1), so the caret landed at the **end of the first visual line** instead of the start of the second.
2. **Think you were already on the last visual line** when you weren’t (`topStart >= topAtEnd - lh * 0.12`), so it returned **`false`** and the list handler moved focus to the **next task** instead of moving on the last line.

Column math elsewhere uses **`textareaVisualLineStartIndex`**, which uses the same mirror layout but a **consistent “which line is this index on?”** rule. Mixing that with the old geometry-only down-move was inconsistent.

### Fix
`moveTextareaCaretOneVisualLine` is rewritten to **only** use **`textareaVisualLineStartIndex`** for line membership:

- **Arrow down:** Scan forward from `start + 1` to find the first index whose **visual line start** differs from the current line → that’s the next line. Reuse **`col = start - lineStart`** and clamp to that line’s valid caret range.
- **Arrow up:** **`prevLineStart = textareaVisualLineStartIndex(lineStart - 1)`**, same **`col`**, **`bestPos = prevLineStart + min(col, lineStart - prevLineStart)`**.
- **Last visual line, arrow down:** If there is no next line but **`start < n`**, move the caret to **`n`** (end of text) instead of returning **`false`** so we don’t jump to the next task until you’re already at the end of the field.

Removed the unused **`approxSameLine`** helper.

Behavior should now match **`textareaVisualLineColumnOffset`** / **`textareaCaretIndexOnFirstVisualLine`** and avoid the old ±1 / wrong-line boundary issues.


Extracting navigation into a testable module with a pure newline-based implementation for unit tests, and refactoring the DOM path to delegate to shared logic. Reading the current implementation:




Creating a pure navigation core module and 24 unit tests. Implementing the core and refactoring the DOM layer to use it.




Here’s what was added and how it’s wired.

### New file: `app/_components/TodaysTodo/todoTextareaVerticalNavCore.ts`
Pure navigation helpers that take a **`lineStartAt(caretIdx)`** callback (same contract as `textareaVisualLineStartIndex`):

- **`lineStartIndexNewlinesOnly`** / **`lineStartNewlinesBinder`** — newline-only lines (used in tests; no layout).
- **`columnOffsetForCaret`**, **`caretIndexOnFirstLineAtColumn`**, **`caretIndexOnLastLineAtColumn`**
- **`computeVerticalCaretMove`** — single implementation of one-step vertical caret moves (the logic that used to live only in `moveTextareaCaretOneVisualLine`).

### `todaysTodoTextareaNav.ts`
- **`moveTextareaCaretOneVisualLine`** delegates to **`computeVerticalCaretMove`** with  
  `(idx) => textareaVisualLineStartIndex(textarea, idx)` (mirror / soft-wrap).
- **`textareaCaretIndexOnFirstVisualLine`** / **`textareaCaretIndexOnLastVisualLine`** delegate to the core helpers with the same `textareaVisualLineStartIndex` callback.

### Tests: `__tests__/todoTextareaVerticalNavCore.test.ts` (**24 tests**)
| Group | What’s covered |
|--------|----------------|
| **1** | One-line ↔ one-line: column preserved down (A→B) and up (B→A), begin / middle / end |
| **2** | One-line ↔ multi-line: single → first line down; first line → single up |
| **3** | Multi ↔ multi: last line of `p\nq\nLM` ↔ first line of `nop\nqr` |
| **4** | Inside `aa\nbbbb\ncc`: arrow up/down between lines, begin / middle / end |

**Note:** Spec tests use **`\n` only** (no soft wrapping). Production still uses the mirror for wrapped lines; the **same** `computeVerticalCaretMove` runs in both cases, only **`lineStartAt`** changes.

Total Jest count is now **44** (previous **20** + **24**).

---

**User**

It just came to me that it would probably be cleaner to have custom up/down arrow handling only when we detect that we're in first/last row of the textarea. Browser implements correct traversal between lines in the same textarea.

---

**Cursor**


Reviewing arrow-key handling in the todo components to delegate in-field line moves to the browser and intercept only at the first/last visual line.




Removing programmatic in-field line movement, adding `isCaretOnFirstVisualLine` / `isCaretOnLastVisualLine`, and intercepting only at list boundaries so the browser handles intra-textarea vertical movement.




Here’s what changed.

### Behavior
- **Inside a task textarea:** Arrow Up/Down are **not** intercepted unless you’re on the **first** or **last visual line** (still detected with the mirror + `textareaVisualLineStartIndex`, same as before for column math).
- **First line + ↑:** move to the previous row / backlog / trailing (unchanged intent).
- **Last line + ↓:** move to the next row / trailing (unchanged intent).
- **Any other line:** handler **returns without `preventDefault`**, so the **browser** moves the caret between lines.

### `todaysTodoTextareaNav.ts`
- Removed **`moveTextareaCaretOneVisualLine`** (no more programmatic in-field vertical moves).
- Added **`isCaretOnFirstVisualLine`** and **`isCaretOnLastVisualLine`** (last line = same visual line as the caret at `value.length`).
- Module comment updated to describe this split.

### `TodoPersistedRow.tsx`
- Arrow Up: only runs list logic when **`isCaretOnFirstVisualLine`**; removed **`skipInnerLineMove`** (no longer needed).
- Arrow Down: only runs list logic when **`isCaretOnLastVisualLine`**.

### `TodoTrailingRow.tsx`
- Arrow Up: only when **`isCaretOnFirstVisualLine`** → focus previous task’s last line.
- Arrow Down block **removed** (it only duplicated the browser on non–last lines or did nothing on the last line).

Cross-row focus still uses **`textareaVisualLineColumnOffset`** / **`focusRowFromBelow`** / **`focusRowFromAbove`** so column alignment between tasks is unchanged.

