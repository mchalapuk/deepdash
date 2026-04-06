# Coding style guide for React components
_Exported on 4/6/2026 at 22:51:37 GMT+2 from Cursor (2.6.21)_

---

**User**

We need to create a coding styleguide for agents to follow. Please toroughly analyze @app/_components/PomodoroPanel.tsx file and create a style guide for react components based on how it's implemented. Place in in STYLEGUIDE.md file and reference it from AGENTS.md.

---

**Cursor**

Analyzing `PomodoroPanel.tsx` and `AGENTS.md` to draft a React component style guide and link it from `AGENTS.md`.



Creating `STYLEGUIDE.md` from the file's patterns and adding a reference in `AGENTS.md`.



Aligning the props example with the file's comma-separated inline types.



Here is what was added and how it ties together.

### [STYLEGUIDE.md](STYLEGUIDE.md)

The guide is built directly from how `PomodoroPanel.tsx` is written:

- **`"use client"`** when the module is client-only.
- **Import grouping**: Mantine → Tabler → React hooks (alphabetized) → `@/` (values + `type`) → relative `./`.
- **File shape**: exported root → private subcomponents (`TabPanel`, `Countdown`, `PrimaryButton`) → custom hook (`usePomodoroMechanics`) → pure helpers at the bottom (`formatWorkTotal`, notifications, chime, `getColorFromPhase`).
- **Named export** for the panel; subcomponents stay file-local.
- **Inline prop types** with comma-separated fields, **`{...{ a, b }}`** when it stays clear.
- **Mantine-first** layout props, **`style`** for one-offs, **Tailwind `className`** where it matches the file (`flex`, `invisible`, `pointer-events-none`, etc.).
- **Store**: small selector hooks + **`pomodoroActions`** for mutations; **`useEffect`** with guards, cleanup, and correct deps; **`useCallback`** when used inside effects; browser API guards.
- **a11y**: `aria-label`, `aria-live` / `aria-atomic`, `role`, `aria-hidden` on spacers.
- **JSX**: `&apos;`, `condition ? node : null`, justified `as` casts.
- **Comments**: short `/** … */` for visibility rules; minimal `/* ignore */` in intentional empty catches.
- **Tabler** icons with explicit `size` / `stroke`.
- **Semicolons**: match the file you are editing.

### [AGENTS.md](AGENTS.md)

A **React components** section was added at the top (after the implicit title context) that points agents to `./STYLEGUIDE.md` and mentions `PomodoroPanel.tsx` as the reference implementation.

---

**User**

Please also add the following:
- It's very important to keep the required order of imports.
- File layout is one of the most important items of this style guide. Please be sure to put the main component at the top of the file.
- Try to keep components under 100 lines of code. To do that you can do two things: 1. Break the component into subcomponents. 2. Group hooks into one custom hook returning a custom tuple.
- Look for layout-based component extractions (per Group element, per Stack element, per Tab, etc).
- Try to put all initialization hooks into one custom hook.
- Declare custom tuple when creating a custom hook.

---

**Cursor**

Updating STYLEGUIDE.md to add the new requirements and strengthen import order and file-layout sections.



Updating STYLEGUIDE.md: strengthening the Imports and File layout sections and adding component-size, layout-extraction, and custom-hook guidance.



Tightening the custom-hook paragraph to match “all initialization hooks into one custom hook.”



Linking the UI stack section to layout-based extraction.



Here is what changed in [STYLEGUIDE.md](STYLEGUIDE.md):

### Imports
- Stated clearly that **import order is mandatory**: same five groups, same order, blank lines between groups, no merging or reordering (with an explicit “don’t put React before Mantine” example).

### File layout
- Called out **file layout as one of the most important rules**.
- Required that the **first function after imports** is the **exported main component**.
- Reworked the table with an **order column** (1–4) so the sequence is obvious: main → subcomponents → custom hooks → pure helpers.

### Component size (~100 lines) — new subsection
- Target **&lt; ~100 lines per component function** (readability, not a strict linter).
- Two approaches: **subcomponents** (especially along **layout boundaries**: `Group`, `Stack`, `Tabs` / `Tabs.Tab`, similar wrappers) and **custom hooks** returning a **tuple** (or small object).

### Custom hooks — expanded
- **One hook** should hold **initialization** and the **effects/refs/callbacks** that only support that behavior, instead of many hooks on the exported component.
- For **tuple** returns, require an **explicit tuple return type** with the `usePomodoroMechanics(): [PomodoroPhase, boolean, boolean]` example and a note to avoid relying only on inference.

### Cross-links
- **State and side effects** starts with a bullet to prefer the **main custom hook** for subscriptions, timers, and init (points to File layout).
- **UI stack** adds a bullet: large **`Group` / `Stack` / `Tabs` / `Tabs.Tab`** blocks → **subcomponent**, linking to the ~100 lines subsection.

---

**User**

OK, please rename the file to REACT_STYLEGUIDE.md

---

**Cursor**

Renaming `STYLEGUIDE.md` to `REACT_STYLEGUIDE.md` and updating references in `AGENTS.md`.



Summary of changes:

1. **Added** [REACT_STYLEGUIDE.md](REACT_STYLEGUIDE.md) with the same content as the old guide.
2. **Removed** `STYLEGUIDE.md`.
3. **Updated** [AGENTS.md](AGENTS.md) so the React section links to `./REACT_STYLEGUIDE.md`.

Nothing else in the repo referenced `STYLEGUIDE.md`. If you use bookmarks or docs outside the repo, point them at `REACT_STYLEGUIDE.md` instead.

---

**User**

@REACT_STYLEGUIDE.md:108 Please replace this with: Never leave catch blocks empty. Log an warning at minimum.

---

**Cursor**

Updated the **Comments** section in [REACT_STYLEGUIDE.md](REACT_STYLEGUIDE.md): it now says never to use empty `catch` blocks and to at least log a warning (with `console.warn` as an example).

---

**User**

OK. That's good enough.

Now please analyze @app/_stores/pomodoroStore.ts and create STORE_STYLEGUIDE.md file based on it.

---

**Cursor**

Analyzing `pomodoroStore.ts` to extract patterns and draft `STORE_STYLEGUIDE.md`.



Creating `STORE_STYLEGUIDE.md` from the store's patterns and adding a reference in `AGENTS.md`.



Aligning the types-order note with `pomodoroStore.ts`: types follow the `proxy`.



Here is what was added and linked.

### [STORE_STYLEGUIDE.md](STORE_STYLEGUIDE.md)

Written from `pomodoroStore.ts`:

- **Valtio**: `proxy`, `useSnapshot`, `subscribe` from `valtio/vanilla` for persistence side effects.
- **Imports**: valtio → `valtio/vanilla` → `@/lib/logger` (use `log`, not silent failures).
- **Constants**: versioned keys (`*.v1`), defaults, clamps/limits.
- **`proxy`**: single private store, typed fields, JSDoc for `hydrated`, `activePhaseRun`, etc.
- **Hydration**: `hydrated` gate so subscribe does not persist before `loadFromStorage` finishes.
- **Exported types**: `export type`, `V1` on persisted shapes.
- **File order**: `proxy` → exported types → exported hooks / small exported helpers → `*Actions` → private helpers with `// --- ... ---` sections.
- **Hooks**: `use*` + `useSnapshot`, `Snapshot<T>` in helpers when working with snapshotted data.
- **Actions**: one exported object, direct proxy mutation, `init` returns `subscribe`’s unsubscribe.
- **Storage**: `window` guard, `try/catch` + `log.error`/`log.warn`, `unknown` + `isRecord` / parsers, dirty JSON snapshots, `pick*` / `apply*` for serializable shapes.
- **Catch blocks**: align with project rules (no empty catches).
- **Consistency** with `app/_stores/`.

### [AGENTS.md](AGENTS.md)

New bullet after the React guide pointing to **STORE_STYLEGUIDE.md** and `pomodoroStore.ts`.

---

**User**

- @STORE_STYLEGUIDE.md:21 Those are constants.
- @STORE_STYLEGUIDE.md:24 Must be named using SCREAMING_SNAKE_CASE for variable names.
- @STORE_STYLEGUIDE.md:28 Never expose it. Use it only in reactive hooks (via useSnapshot) and action methods (directly).
- @STORE_STYLEGUIDE.md:44 I don't like that file layout is just a paragraph in Exported Types section. It deserves it's own Section with a detailed explanation of what is put where and a comment that the script file layout is mandatory.
- @STORE_STYLEGUIDE.md:50 Snapshot<T> is type compatible with T so the same helpers can be used by hooks and actions.
- @STORE_STYLEGUIDE.md:52 Never use useSnapshot inside an action function.
- @STORE_STYLEGUIDE.md:56 init needs more documentation: all stores need to initialize by: 1. Loading data from local storage. 2. subscribing for store changes to update local storage. 3. Returning the unsubscribe callback. This must be done in a function called init which should be the first action declared in every store.
- @STORE_STYLEGUIDE.md:52 Actions are the only medium for react components to request state modifications. Avoid creating simple setters unless that's absolutely necessary (configuration). Actions typically include advanced state transition logic.
- @STORE_STYLEGUIDE.md:65-66 Persistence always at the end of file.
- @STORE_STYLEGUIDE.md:82 Don't reference REACT_STYLEGUIDE here.

---

**Cursor**

Reading `STORE_STYLEGUIDE.md` and applying the requested updates.



Rewriting the guide to apply your edits: a mandatory **File layout** section, updated constants/proxy/actions rules, and persistence-at-end.



Summary of updates to [STORE_STYLEGUIDE.md](STORE_STYLEGUIDE.md):

### Constants
- Renamed/clarified **Module-level constants** so it’s explicit these are **constants** declared **above** the `proxy`.
- Required **`SCREAMING_SNAKE_CASE`** for those **variable** names (with examples).

### Proxy
- **Never export** the proxy; use it only in **hooks** via **`useSnapshot`** and in **actions** by reading/mutating the proxy **directly**.

### File layout
- New **File layout (mandatory)** section with a **table** (imports → constants → `proxy` → exported types → hooks → small exports → **actions with `init` first** → private domain logic → **persistence last**).
- States that **script layout is mandatory** and persistence must **not** sit in the middle.

### Exported types
- Left as its own section; **no** file-order paragraph (moved into File layout).

### Hooks / `Snapshot<T>`
- Documented that **`Snapshot<T>` is compatible with `T`** for field access so **one helper** can serve **hooks** and **actions**.

### Actions
- **Components** change state **only** through **actions** (no ad-hoc mutators).
- **Never use `useSnapshot` in actions** (only on the proxy).
- Prefer **real transitions**; **thin setters** only when needed (usually **config**), kept **private** when possible.
- **`init`** expanded: (1) load, (2) subscribe + persist when allowed, (3) **return unsubscribe**; **`init` is the first action** on the object, with a short **code pattern** example.

### Private implementation
- Removed the old “keep parsing/persistence/domain separate” line; replaced with **persistence only at the end of the file** and a pointer to File layout.

### Storage / pick–apply
- Lead-in lines that these blocks live **at the end of the file** (per File layout).

### Catch blocks
- Dropped the **REACT_STYLEGUIDE** reference; still requires logging (`log.warn` / `log.error` + context).

**Note:** `pomodoroStore.ts` already ends with storage/pick/parse; middle sections are domain/time helpers, which matches the new “persistence last” rule. If you want **`init` listed first** in the object literally, `pomodoroStore` already has `init` first.

---

**User**

- @STORE_STYLEGUIDE.md:42 Please put file layout section before Imports section.
- @STORE_STYLEGUIDE.md:26 Constant, not variable.
- @STORE_STYLEGUIDE.md:35-41 There's no if. All store will use localStorage. Please move all this information to "Storage I/O" section.
- @STORE_STYLEGUIDE.md:65 use* hooks are the only means through which react components can fetch stored data.
- @STORE_STYLEGUIDE.md:75 Dont use inside an action, do use in React hooks.
- @STORE_STYLEGUIDE.md:62 For anything returned from React hooks.
- @STORE_STYLEGUIDE.md:81-99 That's a great section.
- @STORE_STYLEGUIDE.md:103 Typically using Snapshot<T> in arguments.
- @STORE_STYLEGUIDE.md:119 Merge with "Storage I/O section".

---

**Cursor**

Reordering sections, merging Storage I/O with hydration and pick/apply, and applying the wording updates.



Here is what changed:

### Structure
- **File layout (mandatory)** is now **immediately after Stack**, **before Imports**.
- **Hydration** content moved out of the proxy section into **Storage I/O**.
- **Pick / apply** is folded into **Storage I/O** (single section at the end).

### Wording / rules
- **Naming:** “every such **constant**” (not “variable”) for `SCREAMING_SNAKE_CASE`.
- **Exported types:** scoped to what is **returned from React hooks**, plus a short note that this includes **supporting shapes** those values use.
- **React hooks:** states that **`use*` hooks are the only way components read stored data**; no reading the proxy from components.
- **Actions / `useSnapshot`:** **use** `useSnapshot` **in** React `use*` hooks; **do not** use it **in** actions.
- **Private helpers:** domain helpers **usually take `Snapshot<T>` as arguments**; kept the note that **`Snapshot<T>` matches `T` for reads** so hooks and actions can share one function.
- **File layout table:** row 8 now mentions **`Snapshot<T>`** in arguments.
- **`init`:** framed as **every store** using **`localStorage`** (dropped “or similar” on persistence).

### Storage I/O (combined)
- Opening line: stores persist with **`localStorage`**.
- **Hydration** rules live here (`hydrated`, no writes until `loadFromStorage` finishes, then set `hydrated: true` once).
- Existing I/O bullets plus **`pickPersistedX` / `applyXRecord`**.

---

**User**

Great! Now please modify @app/_stores/worldClockStore.ts to be compliant with @STORE_STYLEGUIDE.md.

---

**Cursor**

Searching for usages of the world clock store API:



Rewriting the store to match the style guide and updating `WorldClockHeader.tsx` to use the new API.



Here is what changed.

### [`app/_stores/worldClockStore.ts`](app/_stores/worldClockStore.ts)

- **Imports:** `valtio` (`proxy`, `useSnapshot`), `valtio/vanilla` (`subscribe`), `@/lib/logger`.
- **Constants:** `STORAGE_KEY` only (already `SCREAMING_SNAKE_CASE`).
- **Private `proxy`:** `worldClockStore` is no longer exported; JSDoc matches the hydration rule.
- **Exported types:** `WorldClockEntry`, plus **`WorldClocksPersistedV1`** for the saved payload.
- **`useWorldClocks()`:** sole read path for React; returns **`readonly WorldClockEntry[]`** (matches Valtio’s snapshot typing).
- **`worldClockActions`:** `init` first (load → `subscribe` → return unsubscribe), then `addWorldClock` / `removeWorldClock`.
- **Persistence at bottom:** `loadFromStorage`, `pickPersistedClocks`, `storageSetItem`, `persistIfChanged`, **`lastClocksJson` dirty check**, `isWorldClockEntry`.
- **Logging:** `log.error` on load failure, `log.warn` on `setItem` failure (no empty `catch`).

### [`app/_components/WorldClockHeader.tsx`](app/_components/WorldClockHeader.tsx)

- Drops `useSnapshot` / direct store imports.
- Uses **`useWorldClocks()`** and **`worldClockActions`**.
- **`useEffect(() => worldClockActions.init(), [])`** so the effect cleanup is the `subscribe` unsubscribe.
- **`onSubmitZone`** depends on **`clocks`** and uses **`worldClockActions.addWorldClock`**; remove uses **`worldClockActions.removeWorldClock`**.

`npx tsc --noEmit` completes with no errors.

---

**User**

Great! Now please modify @app/_components/WorldClockHeader.tsx to be compliant with @REACT_STYLEGUIDE.md .

---

**Cursor**

Reading `WorldClockHeader.tsx` and `REACT_STYLEGUIDE.md` to align the component with the style guide.



Restructuring the file: fixing import order (per the style guide), placing the exported main component first (after module-level `const` for `dynamic` and shared constants), extracting subcomponents and consolidating effects into `useWorldClockHeaderMechanics`, and adding explicit `stroke` on Tabler icons.



Fixing `React.RefObject` (React namespace not imported) and aligning import order: `next/dynamic` after React, before `@/`.



Extracting `useHostTimeZones` to bring `useWorldClockHeaderMechanics` under ~100 lines.



Here is what was updated in [`WorldClockHeader.tsx`](app/_components/WorldClockHeader.tsx) to align with **REACT_STYLEGUIDE.md**:

### Import order
1. `@mantine/core` (alphabetical)  
2. `@tabler/icons-react`  
3. `react` hooks + `type RefObject`  
4. `next/dynamic` (Next bridge before app imports)  
5. `@/app/_stores/worldClockStore` (with `type WorldClockEntry`)  
6. `@/lib/timezones`  
7. `react-clock` CSS  

### File layout
- Module-level **`const`** for `Clock`, `CLOCK_SIZE`, and `allowedZones` sit after imports (same idea as needing imports before the dynamic clock).
- **`export function WorldClockHeader`** is the first component: it only calls **`useWorldClockHeaderMechanics()`** and renders layout.
- **Private subcomponents** next: **`WorldClockHeaderContent`** (pinned clocks, user clocks, add column **`Group`/`Box`** block), **`WorldClockCard`**, **`WorldClockAnalog`**.
- **Hooks**: **`useHostTimeZones`** (env `timezonechange` + async local/system zones), **`useWorldClockHeaderMechanics`** (store init, tick interval, add-UI refs/effects, memos, callbacks), **`useReducedMotion`**.
- **Pure helpers** last: `subscribeReducedMotion`, snapshots, **`additionalLabelLines`**.

### Mechanics hook
- **`useWorldClockHeaderMechanics`** returns a single **`WorldClockHeaderMechanics`** object (explicit type) so the header stays thin and effects/refs live in one place; **`useHostTimeZones`** trims that hook so it stays near the **~100-line** goal.

### Other guide details
- **`{m.envTzReady ? <WorldClockHeaderContent {...m} /> : null}`** instead of `&&` for non-boolean-ish guards.
- **Tabler** icons use **`stroke={2}`** on `IconPlus`, `IconTrash`, `IconX`.
- Store usage: **`useWorldClocks`** + **`worldClockActions`** unchanged in behavior.

`npx tsc --noEmit` passes.

---

**User**

- @app/_components/WorldClockHeader.tsx:47-65 Instead of WorldClockHeaderContent, it would be much better to extract a private "Container" component with the Box and Group inside it.
- @app/_components/WorldClockHeader.tsx:127-187 Please extract this into AddClockButton component. Please generalize this and add information to the style guide.
- @app/_components/WorldClockHeader.tsx:198-205 This deserves a separate props declaration. Please modify the style guide if it's not clear about it.
- @app/_components/WorldClockHeader.tsx:347-381 This function should be declared after useWorldHeaderMechanics. Please modify the style guide if it wasn't clear.

---

**Cursor**

Reading `WorldClockHeader.tsx` and `REACT_STYLEGUIDE.md` to implement the changes and update the style guide.



Implementing structural changes and updating REACT_STYLEGUIDE.md.



Moving `WorldClockHeaderMechanics` before `WorldClockHeaderContent` (it's referenced there). Replacing `React.ReactNode` with `import type { ReactNode } from "react"`.



Here’s what changed.

### [`WorldClockHeader.tsx`](app/_components/WorldClockHeader.tsx)

- **`WorldClockHeaderContainer`** — Private wrapper with the header **`Box`** + inner **`Group`** and styles; takes **`children`**. **`WorldClockHeader`** only does `useWorldClockHeaderMechanics()` and renders `<WorldClockHeaderContainer>{…}</WorldClockHeaderContainer>`.
- **`AddClockButton`** — Holds the sizing **`Box`**, collapsed **`ActionIcon`** vs expanded **`Autocomplete`** (refs, options, blur/dropdown handlers, Escape). Props live in **`AddClockButtonProps`**; copy is passed in via **`searchPlaceholder`**, **`addAriaLabel`**, **`cancelAriaLabel`**.
- **`WorldClockCardProps`** — Named type above **`WorldClockCard`** (with JSDoc on **`additionalLabel`**).
- **`type WorldClockHeaderMechanics`** — Placed after **`WorldClockHeaderContainer`** and before **`WorldClockHeaderContent`** so content + mechanics hook share one definition.
- **Hook order** — **`useWorldClockHeaderMechanics`** first, then **`useHostTimeZones`** (only used inside the former). **`useReducedMotion`** stays after both.
- **`import type { ReactNode, RefObject }`** from `react` for **`WorldClockHeaderContainer`** children typing.

### [`REACT_STYLEGUIDE.md`](REACT_STYLEGUIDE.md)

- **File layout** table — Private subcomponents now mention **layout `Container`** components; **Custom hooks** row notes **order**: hook used by the page first, **helpers only used by that hook** listed **after** (with hoisting).
- **Component size (~100 lines)** — New bullets **layout containers** (`children` + outer chrome) and **expandable search/add slot** (named props type, strings for placeholder/`aria-label`).
- **Props and typing** — **Named `type` / `interface`** above the component when props are non-trivial or need per-field JSDoc; inline types only for very small prop lists.
- Closing line updated to mention combining containers and expandable slots.

`npx tsc --noEmit` passes.

---

**User**

- @app/_components/WorldClockHeader.tsx:412 We don't want to support reduced motion. Please add this info to the style guide.
- @app/_components/WorldClockHeader.tsx:149-166 There's so many props passed down to AddClockButton. This is because too much logic was put into useWorldClockHeaderMechanics hook. Please analyze what is needed only in the scope of one component and move it from useWorldClockHeaderMechanics. After you're done, think a bit on how to generalize this and add more information about custom hooks to the style guide.

---

**Cursor**

Reading `WorldClockHeader.tsx` to remove reduced-motion support and refactor add-clock state into a scoped hook/component.



Removing reduced-motion support, extracting `useWorldClockAddColumn` + `WorldClockAddColumn` to localize add-flow state, and updating the style guide.



Here is what changed.

### [`WorldClockHeader.tsx`](app/_components/WorldClockHeader.tsx)

- **Reduced motion removed** — Deleted `useReducedMotion`, `useSyncExternalStore`, and all `matchMedia` helpers. **`WorldClockAnalog`** always uses **`renderSecondHand`** on `Clock`. **`WorldClockCard`** / **`WorldClockAnalog`** no longer take a `reduceMotion` prop.
- **`useWorldClockHeaderMechanics`** now only handles shared concerns: **`useHostTimeZones`**, **`useWorldClocks`**, store **`init`**, 1s **`now`** tick, **`implicitZoneSet`**, **`visibleUserClocks`**, and returns **`implicitZoneSet`** + **`clocks`** for the add column (no add-UI state).
- **`useWorldClockAddColumn`** — New hook with add-open state, query, refs, **`tzData`**, blur/dropdown/commit logic, focus **`requestAnimationFrame`**, and submit validation. Returns **`AddClockButtonProps`** (including fixed copy strings).
- **`WorldClockAddColumn`** — Thin wrapper: `useWorldClockAddColumn({ implicitZoneSet, clocks })` → **`<AddClockButton {...p} />`**. **`WorldClockHeaderContent`** only passes **`implicitZoneSet`** and **`clocks`** via **`WorldClockAddColumn`**.
- Restored **`WorldClockHeaderContainer`** + **`ReactNode`** import (layout matches the earlier container pattern).

### [`REACT_STYLEGUIDE.md`](REACT_STYLEGUIDE.md)

- **Custom hooks** — Clarifies that the **main** hook should hold **cross-cutting** state only; **feature-scoped** hooks + a **small wrapper** for a single subtree avoid a huge return value and long prop drilling. Points to **`useWorldClockAddColumn` / `WorldClockAddColumn` / `AddClockButton`** as the pattern.
- **Motion** — New subsection: **no `prefers-reduced-motion`** in this app unless requirements change; use **full** motion (e.g. second hand always on).
- **Expandable search / add slot** — Updated to describe **presentational** `AddClockButton`, **wrapper** + **scoped hook**, and **minimal** inputs from the parent.

`npx tsc --noEmit` passes.

---

**User**

- @app/_components/WorldClockHeader.tsx:135-136 Why not call useWorldClockAddColumn from inside AddClockButton? WorldClockAddColumn component will not be needed then.
- @REACT_STYLEGUIDE.md:52 Don't put state, refs, effects serving only **one subcomponent** in the main custom hooks. Put those directly in the subcomponent or consider creating a separate custom hook for the subcomponent if there's a lot of logic in the hooks.
- @REACT_STYLEGUIDE.md:59 Move to accessibility section.

---

**Cursor**

Inlining the hook into `AddClockButton`, removing the wrapper, and updating the style guide.



Here is what changed.

### [`WorldClockHeader.tsx`](app/_components/WorldClockHeader.tsx)

- Removed **`WorldClockAddColumn`**.
- **`AddClockButton`** now only takes **`implicitZoneSet`** and **`clocks`** (`AddClockButtonProps`). It calls **`useWorldClockAddColumn({ implicitZoneSet, clocks })`** at the top and uses the returned fields in the same JSX as before.
- Dropped the unused **`RefObject`** import.
- **`useWorldClockAddColumn`** no longer declares a return type tied to the old flat props type; the return shape is inferred.

### [`REACT_STYLEGUIDE.md`](REACT_STYLEGUIDE.md)

- **Custom hooks (line ~51–52):** States that state/refs/effects that belong to **one subcomponent** must **not** live in the **main** hook—keep them **in that component**, or in a **dedicated hook** invoked **from that component** when the logic is big. Notes that those hooks sit in the **Custom hooks** section and may appear **below** the component thanks to hoisting. Removed the **wrapper component** pattern.
- **Expandable slot (bullet 3):** Describes **`AddClockButton`** + optional **`useWorldClockAddColumn`** called **inside** the subcomponent, with **only parent context** in props.
- **Motion:** Removed the standalone **### Motion** block under custom hooks. The same rules are now a **Motion** bullet under **## Accessibility**.

---

**User**

Great! Now please:

1. @app/_components/PomodoroPanel.tsx:316-320 Please extract this function (and PomodoroPhase type declaration) to lib/layout.ts file.
2. Use this function for button + button color in @app/_components/WorldClockHeader.tsx.
3. Add information about using this function for primary button color to @REACT_STYLEGUIDE.md.

---

**Cursor**

Checking where `PomodoroPhase` and `getColorFromPhase` are defined and used.



Creating `lib/layout.ts`, updating the store to import and re-export `PomodoroPhase`, updating `PomodoroPanel` and `WorldClockHeader`, and adding a style-guide note.



Here is what was implemented.

### [`lib/layout.ts`](lib/layout.ts) (new)

- Defines and exports **`PomodoroPhase`** (`"work" | "shortBreak" | "longBreak"`).
- Exports **`getColorFromPhase(phase)`** returning Mantine tokens `red.9` / `green.9` / `blue.9` with a short JSDoc.

### [`app/_stores/pomodoroStore.ts`](app/_stores/pomodoroStore.ts)

- **`import type { PomodoroPhase } from "@/lib/layout"`** and **`export type { PomodoroPhase }`** so existing **`import type { PomodoroPhase } from "@/app/_stores/pomodoroStore"`** (e.g. `PhaseBackdrop`) still works.
- Removed the in-file **`PomodoroPhase`** alias.

### [`app/_components/PomodoroPanel.tsx`](app/_components/PomodoroPanel.tsx)

- Imports **`getColorFromPhase`** and **`PomodoroPhase`** from **`@/lib/layout`**.
- Drops the local **`getColorFromPhase`** implementation.

### [`app/_components/WorldClockHeader.tsx`](app/_components/WorldClockHeader.tsx)

- Imports **`useCurrentPhase`** from the pomodoro store and **`getColorFromPhase`** from **`@/lib/layout`** (`@/` blocks ordered: `pomodoroStore`, `worldClockStore`, `layout`, `timezones`).
- In **`AddClockButton`**: **`primaryColor = getColorFromPhase(useCurrentPhase())`** on the collapsed **plus** `ActionIcon` (`variant="light"`) and on the autocomplete **cancel** `ActionIcon`.

### [`REACT_STYLEGUIDE.md`](REACT_STYLEGUIDE.md)

- **UI stack:** New bullet on **primary action color**: use **`getColorFromPhase`** + **`useCurrentPhase()`** for the main pomodoro **`Button`** and primary-style **`ActionIcon`**s; related icons in the same group may share that **`color`**.
- **Props / types:** **`PomodoroPhase`** is described as living in **`@/lib/layout`** and being re-exported from the pomodoro store when imports are store-centric.

`npx tsc --noEmit` succeeds.

