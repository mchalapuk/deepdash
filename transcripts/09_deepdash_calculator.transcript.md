# Tool calculator to-do implementation
_Exported on 4/4/2026 at 03:15:29 GMT+2 from Cursor (2.6.21)_

---

**User**

Implement the following to-dos from the plan (the plan is attached for your reference). Do NOT edit the plan file itself.

You have been assigned the following 1 to-do(s) with IDs: tool-calculator

1. [tool-calculator] Single Mantine Input only; parse result + calculation result lines (math.js); no keypad UI; Enter evaluate; errors in UI; valtio; aria-live

These to-dos have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the assigned to-dos.

---

**Cursor**


Implementing the calculator per the plan: exploring the codebase and existing patterns, then adding a Valtio store and component.




Rewriting the calculator store to match the style guide (private proxy, `init`, persistence) and adding a `Calculator` component. Verifying mathjs `parse` / `Node` usage:




Implementing the store and component.




Using `TextInput` for label/description support (Mantine's base `Input` omits wrapper props in v9). The plan requires a single Mantine text input; `TextInput` is the appropriate component.




Using `Input.Wrapper` + `Input` to match the plan's "Mantine Input" requirement.




Here’s what was implemented for **[tool-calculator]**:

### `app/_stores/calculatorStore.ts`
- Private Valtio store with **`expression`**, **`lastNormalized`**, **`lastResult`**, **`errorMessage`**, **`hydrated`** (aligned with **[STORE_STYLEGUIDE.md](STORE_STYLEGUIDE.md)**).
- **`calculatorActions.init()`** loads from `worktools.calculator.v1` and subscribes for **immediate** persistence when the slice changes.
- **`setExpression`** updates the field and clears readouts/errors (no live evaluation while typing).
- **`evaluate`** runs on demand: **`math.parse`** → **`node.toString({ parenthesis: "auto" })`** for the parsed line, **`node.evaluate()`** + **`math.format`** for the result; failures set a **short user-facing** message (no stack traces).
- Hooks: **`useCalculatorExpression`**, **`useCalculatorReadouts`**.

### `app/_components/Calculator.tsx`
- Single **Mantine `Input`** inside **`Input.Wrapper`** (label + description; no keypad).
- **Enter** triggers **`calculatorActions.evaluate()`**.
- Read-only **Parsed** and **Result** lines plus error text in a container with **`aria-live="polite"`** and **`aria-atomic="true"`**.

### `app/page.tsx`
- **`Calculator`** is rendered in the left column **under `Pomodoro`**, above **`TodaysWork`**, matching the plan layout.

`npx tsc --noEmit`, `npm test`, `npm run build`, and ESLint on the new files all succeed. Full-repo `npm run lint` still reports existing issues in **`TodaysTodo.tsx`** / **`TodaysWork.tsx`**, not in the calculator code.

---

**User**

It's great. Both the component and the store work and are compliant with the style guides.

I changed the UI of the calculator a bit.

Now we need to also display calculation history of the last 100 calculations. Please implement a rolling buffer in the store and a list in the component starting from the newest calculation.

---

**Cursor**


Reviewing the calculator store and component after your UI changes, then adding a rolling history buffer and list.




Adding a rolling history (max 100, newest-first) to the store with persistence, and rendering it in the component.




Fixing the persistence type guard: legacy saves lack `history`; narrowing the predicate to the three core fields.




Adding stable `id` fields to history entries for React keys and persistence.




Here’s what was added:

### Store (`calculatorStore.ts`)
- **`MAX_HISTORY = 100`** — `pushHistoryEntry` prepends each **successful** evaluation and **`.slice(0, 100)`** so the buffer stays bounded.
- **`history: CalculatorHistoryEntry[]`** — **newest first**; each entry has **`id`** (stable for React keys), **`normalized`**, **`result`**. Failures are not recorded.
- **`useCalculatorHistory()`** — returns a snapshotted, readonly history array.
- **Persistence** — `pickPersisted()` / load include `history`. Legacy blobs **without** `history` get `[]`. Items **without** `id` get one assigned on load.

### UI (`Calculator.tsx`)
- **“Recent”** section when `history.length > 0`.
- **`ScrollArea.Autosize`** with **`mah={220}`** so long lists scroll.
- **Ordered list** (`<ol>` / `<li>`) with **`aria-label="Calculation history, newest first"`**, same **expression = result** styling as the main readout (phase color on the result).

Also adjusted **`useEffect`** so it **returns** `calculatorActions.init()` and unsubscribes on unmount, and fixed the hook lint by using an inline effect callback.

---

**User**

It works great! I changed the UI a bit.

We have one bug in the calculator. Changing the expression in the middle moves the cursor to the end of input. This is because the value is controlled outside the input.

---

**Cursor**


Inspecting the Calculator component and how the input is wired to the store.




Identifying the issue: updating the Valtio store triggers a re-render; React reapplies `value` and resets the selection. Preserving caret with a ref and `useLayoutEffect` after the store-driven update commits.




Here’s what was going wrong: each `onChange` updates Valtio, React re-renders, and the controlled `Input` gets a new `value` from the snapshot. The browser then puts the caret at the **end** of the field after that update.

**Change:** In `onChange`, stash `selectionStart` / `selectionEnd` in a ref, then in **`useLayoutEffect` (no dependency array)** read that ref, clear it, and call **`setSelectionRange`** on the real input (clamped to `value.length`). That runs right after React applies the DOM update, so the caret matches where the user was typing.

History clicks and evaluate still behave as before: they don’t set `pendingCaretRef`, so the effect exits early and the default caret behavior applies (e.g. after `focus()`).

