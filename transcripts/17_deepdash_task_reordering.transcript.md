# Task reordering feature specifications
_Exported on 4/9/2026 at 15:23:35 GMT+2 from Cursor (2.6.21)_

---

**User**

We need task reordering feature.

1. Let's have a task grab icon at the end of task row.
2. After mousedown at the grab icon, moving the mouse up and down outside the task element's boundary should instantly move it (browsers drag and drop API not needed).
3. Moving the mouse outside of the task list should retain the grabbed state.
4. Mouseup end the task move mode but does nothing to the state (as mousemove already did the changes).
5. Moving the mouse outside of the browser window shouls also drop the task.

---

**Cursor**


Exploring the codebase to find how tasks are rendered and managed so we can implement pointer-based reordering.




Implementing `moveItemRelative` in the store and a pointer-based reorder hook. Checking whether Mantine `Group` forwards refs and verifying the pattern.




Implementing store action, reorder hook, and UI wiring.




Fixing the hook: correcting ref access, listener cleanup on all end paths, and adding the missing React type import.




Updating `TodaysTodo.tsx`: adding `useMemo` for row binding and wiring the reorder UI.




Fixing the ref sync: the linter forbids assigning refs during render.




Here’s what was implemented:

### Behavior
- **Grip control** — Subtle `ActionIcon` with `IconGripVertical` at the **end** of each row (`aria-label="Drag to reorder"`), `touch-action: none`, `cursor: grab`.
- **Pointer-driven reorder** — `pointerdown` on the grip only (primary button). `pointermove` / `pointerup` / `pointercancel` on `window`, plus `blur`, `visibilitychange` (tab hidden), and capturing `document` `mouseout` when `relatedTarget` is null so leaving the **document** (including out of the window) ends the interaction without relying on HTML5 drag-and-drop.
- **Ordering** — Compares `clientY` to each **neighbor’s** vertical midpoint and calls `moveItemRelative` at most once per move event so ordering stays consistent with React’s DOM updates.
- **Release** — `mouseup`/`pointerup` only clears drag state (`user-select`, internal flag); order is already updated on move.

### Code
- **`todoActions.moveItemRelative(id, delta)`** in `app/_stores/todoStore.ts` — swaps with the adjacent item.
- **`useTodaysTodoRowReorder`** in `lib/todaysTodoRowReorder.ts` — document-level listeners and neighbor-based moves.
- **`TodaysTodo.tsx`** — `Box` wrapper with a ref on each row for bounds, grip wired to the hook, skeleton column for the grip.

```131:145:lib/todaysTodoRowReorder.ts
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUpOrCancel);
        window.addEventListener("pointercancel", onUpOrCancel);
        window.addEventListener("blur", onBlur);
        document.addEventListener("visibilitychange", onVis);
        document.addEventListener("mouseout", onDocMouseOut, true);
```

All Jest tests pass. Full-project `npm run lint` still reports existing issues (e.g. `TodaysWork.tsx`); the files touched here are clean of new errors.

---

**User**

It works. Let's also highlight the dragged task.

---

**Cursor**


Adding `draggingId` state so we can highlight the active row during reorder.




Adding `draggingId` state to the reorder hook and applying a subtle highlight to the active row. Setting `cursor: grabbing` on the body during drag.




Here’s what changed:

### `lib/todaysTodoRowReorder.ts`
- Added `draggingId` state (`string | null`).
- On grip `pointerdown`: `setDraggingId(itemId)` and `document.body.style.cursor = "grabbing"`.
- In `endDrag`: clear cursor, `setDraggingId(null)` (same as your other cleanup paths).
- Hook now returns `draggingId`.

### `TodaysTodo.tsx`
- Passes `isDragging={draggingId === item.id}` into each row.
- Row wrapper `Box` gets a light **fill + inset border** while dragging (`borderRadius: 8`, short transition).
- Grip icon uses **`grabbing`** while that row is the one being dragged.

The row that’s being reordered stays visually distinct for the whole drag, including when the pointer leaves the list.

---

**User**

@app/_components/TodaysTodo.tsx:68-70 Let's join those 3 into dragAPI.

---

**Cursor**


Adding a `TodaysTodoDragApi` type, memoizing `dragAPI` like `draftAPI`, and updating the component.




Summary of changes:

### `TodaysTodoDragApi`
- New type next to the other `*Api` types with `registerRowRoot`, `onGripPointerDown`, and `draggingId`.

### `useTodaysTodoMechanics`
- Builds a memoized `dragAPI` (same idea as `draftAPI` / `focusAPI`) and returns `dragAPI` instead of three separate fields.

### `TodaysTodo` / `TodoPersistedRow`
- Destructures `dragAPI` only.
- `TodoPersistedRow` takes `dragAPI` and sets `isDragging` from `dragAPI.draggingId === id` inside the row.

---

**User**

@lib/todaysTodoRowReorder.ts:17 Please don't use deprecated API.

---

**Cursor**


Replacing deprecated `MutableRefObject` with `RefObject` per React 19 type definitions.




Update applied. In `@types/react` for React 19, `MutableRefObject` is marked **`@deprecated` — use `RefObject` instead** (`useRef` is typed to return `RefObject<T>` now).

The hook parameter is now `RefObject<Record<string, HTMLElement | null>>`, which matches `rowRootRefs` from `useRef({})` in `TodaysTodo.tsx`.

---

**User**

In drag mode. Clicking right mouse button opens context menu and leaves the task in dragging mode even after the mouseup event. Let's disable context menu when dragging and filter out all right mouse button events.

---

**Cursor**


Preventing the context menu during drag, ignoring non–primary-button `pointerup` events (so releasing RMB won't end the drag incorrectly), and adding a capture-phase `contextmenu` handler.




Refactoring drag session cleanup so we can end the session when the primary button is no longer pressed, and adding `contextmenu` prevention plus filtering of non-primary pointer events.




Here’s what changed:

### 1. **`contextmenu` (capture)**
While a drag is active, `document.addEventListener("contextmenu", onContextMenu, true)` runs and **`preventDefault()`** so the browser menu doesn’t open.

### 2. **Non–primary `pointerdown` (capture on `window`)**
`pointerdown` with **`button !== 0`** (right, middle, back, etc.) gets **`preventDefault()`** and **`stopPropagation()`** so those presses don’t interfere with the drag.

### 3. **Primary-only `pointerup`**
`pointerup` only ends the session when **`ev.button === 0`**. Releasing the right button no longer runs cleanup while the left button is still down, which was part of the stuck-drag behavior.

### 4. **`pointercancel`**
Still ends the session without a `button` check (same as before).

### 5. **Recovery if the primary button is lost**
In **`pointermove`**, if **`(ev.buttons & 1) === 0`** for the active pointer, we call **`endSession()`** so drag mode clears even when a stray `pointerup` never fires (e.g. after a menu or focus oddities).

### 6. **Session cleanup**
Drag teardown is centralized in **`endSession()`** (detach listeners, clear `dragRef`, reset UI) so recovery paths and unmount (`endDrag` in `useEffect`) all use the same path.

---

**User**

OK. Now somthing difficult.

In dragging mode, when moving mouse outside of the task list and over other elements with css hover rules concerning css, we want the cursor to not change.

Please list ideas on how to do it. Don't implement anything yet.

---

**Cursor**


Here are practical angles (no code):

### 1. **Global “drag” class + aggressive CSS**
Add something like `document.documentElement.classList.add('task-dragging')` for the whole session. Stylesheet rule such as `html.task-dragging * { cursor: grabbing !important; }` (or include `html`/`body` too). Hover rules that set `cursor` on descendants are usually beaten by `!important` on a universal selector. **Downside:** very broad; you may need exceptions (e.g. if something must keep `not-allowed`).

### 2. **Same as (1) but scoped**
Apply the class to a high wrapper (e.g. app root) and use `.root.task-dragging * { ... }` so you don’t touch `html` if you prefer. Same idea, slightly easier to reason about.

### 3. **Inject a temporary global stylesheet**
While dragging, append a `<style>` that only contains the `*` / `html` / `body` cursor rules, remove it on drag end. Avoids permanent CSS and keeps “drag mode” self-contained in JS.

### 4. **`cursor` on `body` / `html` only (what you have now)**
Often **not enough**, because many elements set their own `cursor` (higher specificity than inheritance). Worth keeping as a baseline, but usually insufficient alone.

### 5. **Track `mousemove` and patch the element under the pointer**
On each move, `document.elementFromPoint(x,y)` (with possible adjustments for overlays), set `element.style.cursor = 'grabbing'` and restore the previous value when leaving or ending drag. **Downside:** many elements, easy to miss nested targets, must clean up carefully; fights with React re-renders.

### 6. **Fullscreen transparent overlay with `pointer-events: auto`**
A fixed full-viewport layer on top with `cursor: grabbing` so hit-testing sees only that layer. **Problem:** it steals hit-testing—usually bad unless you forward events or only use it when you’re sure window-level listeners still get moves (behavior varies). Often conflicts with “mousemove outside list still works.”

### 7. **Pointer capture (`setPointerCapture` on the handle)**
Helps with **event** routing; it does **not** reliably keep the **visual** cursor from changing under elements with their own `cursor` rules. Usually not a fix by itself.

### 8. **`cursor: none` + fake cursor**
Hide the OS cursor and move a DOM “cursor” with `grabbing` styling. Maximum control; more code and edge cases (scaling, multiple monitors, accessibility).

### 9. **CSS `@layer`**
If the app moves toward cascade layers, a dedicated layer with high priority could hold drag-only cursor rules without `!important` everywhere—depends on the rest of the stack.

### 10. **Design tokens / fewer `cursor` overrides**
Longer-term: reduce per-component `cursor` so global drag styles win with lower specificity. Rarely sufficient alone in a large UI.

---

**Practical takeaway:** (1)–(3) (global class or stylesheet + `*` / `html` / `body` + `!important` during drag) are the usual approach. (5) is the fallback when you must avoid `!important` or need surgical control. (8) is the escape hatch when nothing else is acceptable visually.

---

**User**

How about 6 with task moves based on task item offset position and mouse position?

---

**Cursor**


Yes — **#6 pairs naturally with “geometry + mouse position” reordering**, and that combo is exactly how you make the overlay workable.

### Why they fit together

With a **fullscreen overlay** (`pointer-events: auto`, high `z-index`, `cursor: grabbing`), the pointer no longer “hits” buttons, links, or task rows for **styling** — so hover cursors from those elements don’t apply. Your **`window` / `document` listeners** still get `pointermove` / `pointerup` with correct `clientX` / `clientY` (and `pointerId`), so the drag session can keep working **without** depending on the event target being a task row.

So you **stop using** “pointer over row A vs row B” via DOM hit-testing, and you **replace** reorder logic with **pure math**:

- Read **mouse Y** (usually `clientY`, or Y relative to a chosen root).
- Read **each row’s vertical span** (typically `getBoundingClientRect()` on row roots you still keep in refs, or a single container + row offsets).
- Map **Y → target index** (same midpoint / threshold ideas you already use, or a single “insert line” index).

That’s what you mean by **task item offset position + mouse position**: row positions (absolute or relative to list/scroller) plus cursor position.

### What you must handle explicitly

1. **Scroll**  
   If the list scrolls, row rects move. Either:
   - update rects on every move from cached refs, or  
   - convert mouse Y into **coordinates relative to the scroll container** and compare to row offsets inside that container.  
   `getBoundingClientRect()` each frame is simple and correct if the number of rows is small.

2. **Overlay and coordinates**  
   `clientY` is still in viewport space; row rects from `getBoundingClientRect()` are too — so they stay in the **same coordinate system**. No change needed just because the top layer is an overlay.

3. **“Blocked” hit-testing**  
   The overlay swallows **targeted** interaction with what’s underneath (clicks, hover, text selection). For **drag-only**, that’s usually what you want. If you needed right-clicks or wheel to reach the page, you’d have to forward those (you already special-case aux buttons / context menu during drag).

4. **Lift when drag starts**  
   Put the overlay up **only after** `pointerdown` on the handle (and maybe after a 0px move) so normal UI still works until drag begins.

### Compared to current approach

You already use **mouse Y + row rects** (`getBoundingClientRect` on neighbors). The **main change** with #6 isn’t the formula — it’s **adding the overlay** so **cursor** stays `grabbing` while the **math** stays based on row positions + mouse position.

So: **yes, #6 + offset/position-based reordering is a coherent design**; the reorder logic stays “measure rows + compare to mouse,” and the overlay only fixes **cursor** (and optionally blocks stray hovers) while **window-level** moves carry the numbers you need.

---

**User**

Let's do it.

---

**Cursor**


Implementing a viewport overlay (preferably via a portal) while dragging, and verifying reorder logic works with it. Checking how portals and z-index are used in the project.




Adding a synchronous fullscreen overlay (imperative `document.createElement` + `appendChild` so it appears before the next pointermove) and keeping reorder logic based on `clientY` and row `getBoundingClientRect()` — already correct. Removing redundant `body` cursor styling while the overlay is active.




Here’s what was implemented.

### Fullscreen drag overlay (`lib/todaysTodoRowReorder.ts`)
- **`mountDragCursorOverlay()`** builds a `div`, appends it to **`document.body`** (so it isn’t clipped by panel layout), and styles it with:
  - `position: fixed; inset: 0`
  - `z-index: 2147483646`
  - `cursor: grabbing`
  - `pointer-events: auto` (so it sits above the UI and picks up the pointer)
  - `touch-action: none`, `background: transparent`, `aria-hidden="true"`
- On **grip `pointerdown`**, the overlay is created **before** window listeners are registered, so the next moves already hit the overlay and the cursor stays `grabbing`.
- **`detach()`** calls **`overlayEl.remove()`** so the layer is always torn down with the rest of the drag listeners.

### Reorder logic
- Unchanged: still **`ev.clientY`** vs each neighbor row’s **`getBoundingClientRect()`** midpoints (viewport space, same as the overlay). No extra math was required beyond what you already had.

### Cleanup
- **`document.body.style.cursor = "grabbing"`** was removed during drag; the overlay owns the cursor. **`clearDragUi`** still clears `body` styles on end.

Tests pass; no new linter issues on that file.

