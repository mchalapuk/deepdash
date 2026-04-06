# Improvements to TodaysTodo component
_Exported on 4/6/2026 at 21:30:22 GMT+2 from Cursor (2.6.21)_

---

**User**

Two things we need to improve in the @app/_components/TodaysTodo.tsx component.

1. Hitting enter while editing a task should split it into two tasks. Hitting Shift+Enter should create a newline in the task.
2. Up/down arrows should take into account that tasks may be multiline. This include both explicing newline characters and whitespace breaks.

Those two changes need to be made for both in the persisted row and the trailing row.

---

**Cursor**


Reading `TodaysTodo.tsx` to see how editing and keyboard navigation are implemented.




Checking the todo store for split/insert behavior:




Implementing Enter vs Shift+Enter (swap from Ctrl/Cmd+Enter) and visual-line navigation using a mirror-div caret measurement. Checking how Mantine's Textarea forwards refs:




Creating `lib/todaysTodoTextareaNav.ts` with mirror-based visual-line navigation, then updating `TodaysTodo.tsx`: Enter splits (Shift+Enter inserts newline), arrow up/down use visual lines first, and aligning the trailing textarea with persisted rows for multiline drafts.




Updating `TodaysTodo.tsx`: adding `persistedItemCount` to the focus API, implementing navigation and Enter handling, and fixing the trailing `Textarea` layout.




Fixing trailing split-enter guard (handle whitespace-only), using `focusTrailing` in hook dependencies, matching persisted split by not over-trimming `left`, and removing the unused export from the lib.




Fixing lint issues: destructuring the mechanics hook return (to avoid ref false-positives), correcting `useCallback` dependencies, and moving `draftRef` updates out of render.




Destructuring the mechanics hook return to satisfy the refs lint rule, inlining `isFirst`/`isLast` so we can fix `useCallback` deps, moving `draftRef` sync into `useEffect`, and removing the unused `hydrated` prop.




Fixing split-Enter handling: avoid calling `preventDefault` when the selection isn't collapsed (restores default Enter behavior for multi-line selections).




Here’s what changed:

### 1. Enter vs Shift+Enter
- **`isSplitEnter`**: plain **Enter** (no Shift, not IME composing) runs the same split flow that used to be on **Ctrl/Cmd+Enter** on persisted rows: new empty row at start/end, or **`splitItemAt`** in the middle.
- **Shift+Enter** is not handled, so the browser keeps inserting a newline.
- **Trailing row**: same split rules using **`insertEmptyAt(persistedItemCount)`** (start/end) or **`addItem(left)`** + remainder in the draft (middle). **`value.trim() === ""`** does nothing.
- **Ctrl/Cmd+Enter** on the trailing field still **commits** the whole draft (same as before for “submit without blur”).

### 2. ArrowUp / ArrowDown and multiline / wrap
- New helper: [`lib/todaysTodoTextareaNav.ts`](lib/todaysTodoTextareaNav.ts) — off-screen mirror div with the textarea’s **width** and **text styles**, **`textareaCaretPoint`**, and **`moveTextareaCaretOneVisualLine`** (binary search + same-column pick on the adjacent visual line).
- **Persisted** and **trailing** handlers call that **first**; only when it returns `false` do arrows move to the previous/next task (or trailing), still using **`clampColumn`** on the string index for cross-field jumps.

### 3. Trailing field layout
- **`maxRows={12}`**, removed the **30px** cap, **`mb={-6}`** and padding aligned with persisted rows so Shift+Enter multiline drafts match the list styling.

### 4. Other
- **`persistedItemCount`** on **`TodaysTodoFocusApi`** for trailing **`insertEmptyAt`**.
- **`TodaysTodo`** destructures **`useTodaysTodoMechanics()`** so the refs lint rule stays happy; removed unused **`hydrated`** from **`TodoTrailingRow`**.
- **`draftRef`** is updated in **`useEffect`** instead of during render.
- Split-Enter only **`preventDefault`** when the selection is **collapsed**, so Enter with a range still behaves normally.

**Note:** Visual-line movement uses layout thresholds (line height × factors); if anything feels off on a specific font/zoom, those constants in `todaysTodoTextareaNav.ts` can be nudged. **Ctrl/Cmd+Enter** is still the quick way to add the whole trailing line as one task in one keystroke.

---

**User**

When hitting up arrow to move the cursor to a multiline task, the cursor should jump into the last line of the task. Currently it jumps into the first one despite the source of the cursor.

---

**Cursor**


Inspecting `focusRow` and arrow-up handlers to implement landing on the target task's last line.




Implementing helpers to compute the last visual line and the column offset on the source line, then adding `focusRowFromBelow` so ArrowUp lands on the target's last line with a matching column.




Helpers exist in the lib. Adding `focusRowFromBelow` and wiring ArrowUp to use it.




Here’s what was wrong and what we changed.

**Cause:** Moving **up** into the row above used `focusRow(prev.id, clampColumn(start, prev.text.length))`. That uses the **same UTF-16 index** in the target string as in the source. For a multiline task, that index usually points at the **beginning** of the string (or early in the first line), not the **last** line.

**Fix:**
1. **`focusRowFromBelow(id, columnOffset)`** – After focus, sets the caret with `textareaCaretIndexOnLastVisualLine` so it sits on the **last visual line** (including wraps), at `columnOffset` characters from the start of that line (clamped to the line length).
2. **Column from the source field** – `textareaVisualLineColumnOffset(el, start)` is the distance in characters from the **start of the current visual line** to the caret (again including soft wraps).

**Wiring:** Persisted-row **ArrowUp** (when leaving the row) and trailing-row **ArrowUp** (into the last saved task) now call `focusRowFromBelow` with that column offset instead of `focusRow(..., clampColumn(...))`.

The helpers already lived in [`lib/todaysTodoTextareaNav.ts`](lib/todaysTodoTextareaNav.ts) (`textareaVisualLineColumnOffset`, `textareaLastVisualLineStartIndex`, `textareaCaretIndexOnLastVisualLine`); they’re now used from [`TodaysTodo.tsx`](app/_components/TodaysTodo.tsx) via the new focus API method.

**Note:** **ArrowDown** into the next row still uses `clampColumn` (first-line–style index). If you want symmetry (caret on the **first** visual line with column alignment), we can add a `focusRowFromAbove` in the same way.

---

**User**

That worked. Now when using up and down arrows to move between lines in a single, multiline task, the cursor jumps to the first char in the line. We need it to remain at the correct position relative the the line.

---

**Cursor**


Inspecting vertical caret movement and caret-point measurement for bugs that force the caret to the line start.




Identifying the issue: horizontal placement uses `|left(i) - leftTarget|`, but mirror-measured `left` values can be unreliable or flat across a wrapped line, so the loop keeps `bestPos === lineStart`. Using the visual-line character offset (already computed correctly) for vertical moves matches user expectations. Replacing the left-distance scan with column-based placement: `Math.min(lineStart + textareaVisualLineColumnOffset(textarea, start), lineEnd)`.




Here’s what was going wrong and what we changed.

**Cause:** After moving to the adjacent visual line, the caret column was chosen by minimizing `|left(i) − leftTarget|` using mirror layout. In practice those `left` values often don’t line up with the real textarea (or don’t change enough along the line), so the minimum kept pointing at **`lineStart`** — the first index on that line.

**Change:** Drop the horizontal scan and use the same notion of “column” as elsewhere: **`textareaVisualLineColumnOffset(textarea, start)`** — number of UTF‑16 units from the **start of the current visual line** to the caret (handles `\n` and soft wraps). On the target line:

`bestPos = Math.min(lineStart + col, lineEnd)`

so the column is preserved when the next line is long enough, and it **sticks to the end of the line** when the line is shorter (same idea as “goal column” in editors).

This is applied for both **ArrowUp** and **ArrowDown** inside [`moveTextareaCaretOneVisualLine`](lib/todaysTodoTextareaNav.ts). Cross-field navigation is unchanged (`focusRowFromBelow` still uses the same offset helpers).

