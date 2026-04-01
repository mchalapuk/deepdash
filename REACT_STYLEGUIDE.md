# React component style guide

This document describes how React components in this codebase are structured and written. It is derived from the patterns in `app/_components/PomodoroPanel.tsx`. Agents and contributors should follow it for new or heavily edited components unless a file already establishes a different, consistent local convention.

## Client components

- Use the `"use client";` directive at the **top of the file** (first line) when the module uses browser APIs, React state/effects, or other client-only behavior.

## File layout

**File layout is one of the most important rules in this guide.** It should match the following structure whenever practical.

After imports, the **first function in the file** must be the **exported main component** (the public entry point for the module). Then private subcomponents, then custom hooks, then pure helpers at the bottom.

A single file may contain:

| Order in file | Section | Role |
|---------------|---------|------|
| 1 | **Exported main component** | `export function MyPanel()` — appears **immediately after imports**. Keeps JSX shallow: compose children, avoid deep nesting in one function. |
| 2 | **Private subcomponents** | not exported. Each handles one visual or logical chunk. |
| 3 | **Custom hooks** | `function useThingMechanics()` — see below: init and subscriptions live here; use an **explicit tuple** return type when returning a tuple. **Order:** declare the hook the exported component calls first; place **helper hooks** used only by that hook **after** it in the file (`function` declarations hoist, so the helper may appear below the consumer). |
| 4 | **Pure helpers** | `function formatX()`, `function getYFromZ()` at the **bottom** — no hooks, easy to test and reuse. |

Prefer **many small functions** over one large component with long JSX.

### Imports

**Import order is mandatory.** Keep the groups below in this exact order, each group separated by a blank line. Do not merge groups or reorder them (e.g. do not put React before Mantine).

1. **UI library** — e.g. `@mantine/core` components, alphabetized within the block.
2. **Icons** — e.g. `@tabler/icons-react`.
3. **React** — hooks from `react` (alphabetize: `useCallback`, `useEffect`, `useRef`, `useState`, …).
4. **App modules** — use the `@/` path alias. Put `type` imports on the same line as related value imports when they come from the same module.
5. **Relative imports** — same-folder or nearby files (e.g. `./FlipClockJsCountdown`).

Use **named imports**; avoid default imports for components unless the dependency only exposes a default.

### Component size (~100 lines)

Aim to keep each **component function** under **100 lines** (excluding blank lines is a reasonable interpretation; the goal is readability, not a hard linter rule). When a component grows past that:

1. **Extract subcomponents** — especially along **layout boundaries**: one subcomponent per major **`Group`**, **`Stack`**, **`Tabs` / `Tabs.Tab`**, or similar layout wrapper when that block is self-contained.
2. **Layout containers** — when the shell is stable (e.g. a **`Box`** + inner **`Group`** with fixed scroll/alignment styles) and only the **inner body** varies, extract a private **`SomethingContainer`** that takes **`children`** and owns the outer chrome. The exported component then composes: `<MyContainer>{…}</MyContainer>`.
3. **Expandable search / add slot** — when a column toggles between a **compact trigger** (e.g. icon button) and an **expanded inline control** (e.g. **`Autocomplete`** with cancel, blur rules, portal), extract a subcomponent (e.g. **`AddClockButton`**) with a **small, named props type** for **parent context only** (e.g. `implicitZoneSet`, `clocks`). Keep **local** state, refs, and effects **inside** that subcomponent, or in a **private hook** called **from** that subcomponent (e.g. **`useWorldClockAddColumn`**) when the logic is large—do not thread those through the page-level hook.
4. **Extract a custom hook** that returns a **tuple** (or small object) so the main component mostly wires props and JSX instead of owning all effects and state.

Combine subcomponents, containers, expandable slots, and hooks as needed.

### Custom hooks: initialization and tuple types

- The **main** custom hook (the one the exported component calls) should hold **cross-cutting** concerns: store **`init`**, **shared** timers, and state that **several** children need (e.g. one `now` tick for every clock card). Do **not** fold every subtree’s local UI state into that hook—doing so produces a **large return object** and forces **long prop lists** into children.
- Do **not** put state, refs, or effects that serve **only one subcomponent** in the **main** custom hook. Keep them **inside that subcomponent** (`useState` / `useRef` / `useEffect` in the component body). If the logic is **large**, extract a **separate custom hook** and call it **from that subcomponent** (e.g. `AddClockButton` calls `useWorldClockAddColumn`). **Colocate** such hooks in the file’s **Custom hooks** section (typically after the primary hook and its direct helpers); `function` declarations hoist so the hook may appear **below** the component that uses it.
- When the hook returns a **tuple**, declare it with an **explicit tuple return type** so call sites and refactors stay clear: `function usePomodoroMechanics(): [PomodoroPhase, boolean, boolean] { ... }`. Avoid relying on inference alone for multi-value tuple returns.

## Exports

- Export the **main component as a named function**: `export function PomodoroPanel() { ... }`.
- Keep **subcomponents and hooks file-private** unless another module genuinely needs them (then consider moving to a separate file).

## Props and typing

- For **small** prop sets (few primitives, no per-field JSDoc), an **inline object type** on the parameter list is fine:

  `function TabPanel({ phase, running }: { phase: PomodoroPhase, running: boolean })`.

- When props are **non-trivial** (many fields, optional callbacks/refs, or **JSDoc on individual props**), declare a **named `type` or `interface`** **immediately above** the component (e.g. `type WorldClockCardProps = { … }` then `function WorldClockCard(props: WorldClockCardProps)`).

- Reuse **domain types** from stores or shared modules instead of duplicating unions (e.g. **`PomodoroPhase`** from **`@/lib/layout`**, re-exported from **`@/app/_stores/pomodoroStore`** for store-centric imports).

## Passing props

- You may use **object spread** to forward a small bundle without repeating names:  
  `<TabPanel {...{ phase, running }} />`  
  Use this when it stays readable; switch to explicit props if the list grows or names are unclear.

## UI stack

- Prefer **Mantine** primitives for layout and controls: `Paper`, `Stack`, `Group`, `Box`, `Tabs`, `Button`, `ActionIcon`, `Text`, etc.
- When markup for a **`Group`**, **`Stack`**, **`Tabs`**, or **`Tabs.Tab`** grows heavy, treat that wrapper as a candidate for a **dedicated subcomponent** (see **File layout → Component size (~100 lines)**).
- Express layout with **Mantine props** first (`gap`, `align`, `justify`, `wrap`, `w`, `py`, `radius`, `variant`, `size`, `c`, …).
- Use **`style={{ ... }}`** for one-off values (e.g. fixed widths, rgba backgrounds, flex quirks) that are not covered by props.
- Use **`className`** with **Tailwind** utilities where they are concise and stable (e.g. `flex`, `min-w-0`, `invisible`, `pointer-events-none`). Mixing Mantine + Tailwind in one tree is acceptable here.
- **Primary action color (pomodoro phase):** for the main **`Button`** `variant="filled"` in the pomodoro panel and for **primary-style** controls elsewhere (e.g. **`ActionIcon`** `variant="light"` used as the main “add” affordance), set **`color={getColorFromPhase(phase)}`** from **`@/lib/layout`**, with **`phase`** from **`useCurrentPhase()`** in **`@/app/_stores/pomodoroStore`**. Related icon-only controls in the same control group (e.g. cancel next to an expanded search) may use the same **`color`** so accents stay aligned with the timer phase.

## State and side effects

- Prefer running **subscriptions, timers, and one-off initialization** from the file’s **main custom hook** (see **File layout → Custom hooks**) so the exported component stays mostly declarative.
- **Subscribe** to global state with small selector hooks from stores (e.g. `useCurrentPhase()`, `useIsRunning()`).
- **Mutations** go through a stable **actions** object (e.g. `pomodoroActions.pause()`), not ad-hoc store access in JSX click handlers when an actions API exists.
- **`useEffect`**: guard early (`if (!running) return`), always **return a cleanup** for timers/subscriptions, and list **complete dependency arrays**.
- When a callback is referenced inside an effect, stabilize it with **`useCallback`** and include its dependencies.
- For **`window` / `Notification` / `AudioContext`**, guard with `typeof window === "undefined"` (or equivalent) where setup must not assume a browser during SSR/build if the code path can run on the server.

## Accessibility

- Give interactive controls **`aria-label`** (and `title` on icons when it helps).
- Use **`aria-live`** / **`aria-atomic`** on regions that update for assistive tech (e.g. a timer).
- Use **`role`** when it clarifies semantics (`role="timer"`).
- Use **`aria-hidden`** on decorative or duplicate-visual slots (e.g. invisible layout spacers).
- **Motion:** this app **does not** implement **`prefers-reduced-motion`** branching. Do not add `useSyncExternalStore` / `matchMedia("(prefers-reduced-motion: reduce)")` (or similar) to toggle animation unless product requirements change. Use **full** motion where the underlying component supports it (e.g. always render a running second hand on analog clocks).

## JSX details

- Escape apostrophes in text with the **entity** `&apos;` (e.g. `Today&apos;s work`).
- **Conditional UI**: prefer `condition ? <Node /> : null` over `&&` when the condition is not strictly boolean, to avoid leaking `0`/`""` into the tree.
- **Casts**: after runtime checks, narrow with `as` only when necessary (e.g. tab value to a union type); prefer validation when values come from untrusted input.

## Comments

- Use short **`/** ... */` blocks** above non-obvious UI rules (e.g. when a control is shown or hidden), not on every line.

## Error Handling

- Never leave `catch` blocks empty. Log a warning at minimum (e.g. `console.warn`).

## Icons

- Use **Tabler** icons from `@tabler/icons-react` with explicit **`size`** and **`stroke`** where the design calls for it.

## Consistency note

Keep **semicolons** and trailing commas aligned with the surrounding file. When editing a file, match its existing style.
