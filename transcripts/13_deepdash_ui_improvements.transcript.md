# UI improvements for calculator and todo list
_Exported on 4/5/2026 at 02:21:11 GMT+2 from Cursor (2.6.21)_

---

**User**

A few things we need to improve in the UI:

- Scroll the calculator history to the bottom when a new entry is added to it.
- Scroll the work log to top whenever a new pomodoro session is started.
- Use textarea instead of input in the todo list to support multiline items.

---

**Cursor**


Implementing the three UI improvements. Reading the relevant components to see how history, work log, and todos are structured.




Checking calculator history order in the store and how Mantine's ScrollArea exposes scroll control.




Confirming: store history is newest-first; the UI reverses it so newest appears at the bottom — scrolling to the bottom is correct. Checking Mantine `Textarea` and `REACT_STYLEGUIDE.md` for patterns.




Implementing all three changes. Using Ctrl/Cmd+Enter for structural actions (split/new row/commit) since Enter adds newlines in textareas.




Fixing TodaysWork effect order: read the file and correct the ref update logic.




Applying TodaysTodo changes: updating imports and components.




Here’s what was implemented:

### Calculator (`Calculator.tsx`)
History is rendered **oldest → newest** (`reverse()` on newest-first store data), so the latest row is at the **bottom**. A `viewportRef` on `ScrollArea` and a `useLayoutEffect` compare the previous history length to the current one; when it **increases**, the viewport is scrolled with `scrollTop = scrollHeight` so the newest line stays in view. The first time we only record length (no scroll), so a cold load does not jump.

### Work log (`TodaysWork.tsx`)
A `viewportRef` on the work log `ScrollArea` and a `useLayoutEffect` watch `activePhaseRun.phaseStartedAtMs` while `phase === "work"`. Whenever that start time **changes** (new work session, including after a break), the viewport runs `scrollTo({ top: 0 })`, so the top of the list (current / latest block in your reversed layout) is shown.

### Todos (`TodaysTodo.tsx`)
Persisted rows and the trailing add field use Mantine **`Textarea`** with `autosize`, `minRows={1}`, `maxRows` caps, and `resize="none"`. Rows use **`align="flex-start"`** with slight **`mt`** on the checkbox / add icon so they line up with the first line.

**Enter** now inserts a newline. Actions that used to be on **Enter** (new row above/below, split at caret, commit trailing draft) use **Ctrl+Enter or Cmd+Enter** via `isModEnter()`. Blur on the trailing field still commits the draft as before.

---

**User**

@app/_components/Calculator.tsx:130 This is not enough since the history is a rolling buffer.

---

**Cursor**


Tracking the newest entry's identity: when the buffer is full, length stays constant but the head entry changes.




Tracking the newest history entry's `id` (store is newest-first). When the buffer is full, length stays at `MAX_HISTORY` but `history[0].id` still changes on each new evaluation.




Here’s what was wrong: with a fixed max size, **`history.length` can stay the same** while a new row is still added (oldest dropped), so the old effect never ran.

The list is **newest-first** in the store, so each successful append always changes **`history[0].id`**. The effect now:

1. Keeps the previous head id in a ref (same “skip first paint” behavior as before: `prev === null` on the first run after mount).
2. Scrolls when **`newestId !== prev`** and there is a newest id (so we don’t scroll on clear).
3. Lists **`history.length` and `history[0]?.id`** as dependencies so we still run when the list goes empty or the head changes at full capacity.

`pushHistoryEntry` still skips duplicates by `normalized`, so unchanged head id means no scroll, which is correct.

