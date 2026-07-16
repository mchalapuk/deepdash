<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Deployment: static assets only

This app is **deployed as static files only** (e.g. Next.js **`output: 'export'`**). There is **no server-side runtime** for HTML requests: no API routes that execute on a Node server, no SSR-only data fetching at request time, and **no reliance on a dynamic server** to serve the UI. When adding features, assume **client-side execution** and **static hosting** (CDN, S3, GitHub Pages, etc.).

### Build command does more than `next build`

`npm run build` runs `next build && node scripts/inject-csp-meta.mjs` — the second step injects a CSP meta tag into the exported HTML. Don't shortcut to a bare `next build` when verifying a build.

### No dedicated typecheck script

`tsconfig.json` has `strict: true` and `noEmit: true`, but there is no `npm run typecheck` script. Type errors only surface via `next build` or editor tooling — run `npx tsc --noEmit` directly if you need a standalone check.

### Deployment is a force-push, not CI

There is no CI pipeline. `./scripts/deploy.sh` builds and force-pushes the `out/` directory to a `pages` branch. Treat this as a destructive, user-triggered action — never run it unprompted.

## Running tests

**Unit tests**: `npm test` runs Jest against `__tests__/**/*.test.ts` (see `jest.config.cjs`). Fixtures live in `__fixtures__/`.

**End-to-end tests**: `npm run test:e2e` runs Playwright (`playwright.config.ts`) against spec files in `__e2e__/**`. It launches its own `next dev` on port 3100 (`reuseExistingServer` outside CI) — no need to start a dev server manually first. Since the app persists todo/pomodoro/etc. state to `localStorage`, e2e specs should clear it per-test via `page.addInitScript(() => window.localStorage.clear())` before `page.goto(...)` to start from a clean slate.

## No runtime network usage

Do **not** introduce **runtime** `fetch`/`XMLHttpRequest` to the public internet for **fonts**, **images**, telemetry, or other assets. Use **bundled** resources: `next/font/local` with files in the repo, **local images only**, and dependencies that do not pull from CDNs or remote APIs when the app runs. For **IANA timezone names**, use **`Intl.supportedValuesOf('timeZone')`** in supporting browsers (in-process API, not a network call); use a **small compiled fallback list** only if that API is unavailable in a target environment.

### Service worker caches the app shell offline

`public/sw.js` caches static assets for offline use. Keep this in mind alongside the no-runtime-network-usage rule above — changes to cached assets may need a service-worker cache-version bump to take effect for returning users.

## Persisted data: import/export and schema tests

The app includes **versioned data export/import** (JSON). The **import path must remain backwards compatible** across schema changes.

**Whenever you change the export/import schema** (new fields, renames, key moves):

1. Bump the export **`version`** (or add a migration step).
2. Add a **new Jest unit test** that loads a **JSON fixture** from the **previous** version (or an explicit older shape), runs the import migration, and asserts the result matches the **current** in-memory/domain shape.

Keep historical fixtures under something like `__fixtures__/export-v{n}.json` so older formats stay covered.

**Bundle orchestration** lives in **`lib/dataExport.ts`** (`CURRENT_DEEPDASH_EXPORT_VERSION`, `tryMigrateDeepdashBundle`, `runDeepdashJsonImportFromText`, `applyDeepdashImportWithRollback`, `collectDeepdashExport`, `downloadDeepdashJson`). **Per-feature versioned slices** and `exportData` / `importData` / `migrate*SliceToLatest` live in each **`app/_stores/*Store.ts`** (see **[Client store style guide](#client-store-style-guide)**). UI: **`app/_components/DataImportExport.tsx`**.

## React component style guide

This section describes how React components in this codebase are structured and written. It is derived from the patterns in `app/_components/PomodoroPanel.tsx`. Agents and contributors should follow it for new or heavily edited components unless a file already establishes a different, consistent local convention.

### Client components

- Use the `"use client";` directive at the **top of the file** (first line) when the module uses browser APIs, React state/effects, or other client-only behavior.

### File layout

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

#### Imports

**Import order is mandatory.** Keep the groups below in this exact order, each group separated by a blank line. Do not merge groups or reorder them (e.g. do not put React before Mantine).

1. **UI library** — e.g. `@mantine/core` components, alphabetized within the block.
2. **Icons** — e.g. `@tabler/icons-react`.
3. **React** — hooks from `react` (alphabetize: `useCallback`, `useEffect`, `useRef`, `useState`, …).
4. **App modules** — use the `@/` path alias. Put `type` imports on the same line as related value imports when they come from the same module.
5. **Relative imports** — same-folder or nearby files (e.g. `./FlipClockJsCountdown`).

Use **named imports**; avoid default imports for components unless the dependency only exposes a default.

#### Component size (~100 lines)

Aim to keep each **component function** under **100 lines** (excluding blank lines is a reasonable interpretation; the goal is readability, not a hard linter rule). When a component grows past that:

1. **Extract subcomponents** — especially along **layout boundaries**: one subcomponent per major **`Group`**, **`Stack`**, **`Tabs` / `Tabs.Tab`**, or similar layout wrapper when that block is self-contained.
2. **Layout containers** — when the shell is stable (e.g. a **`Box`** + inner **`Group`** with fixed scroll/alignment styles) and only the **inner body** varies, extract a private **`SomethingContainer`** that takes **`children`** and owns the outer chrome. The exported component then composes: `<MyContainer>{…}</MyContainer>`.
3. **Expandable search / add slot** — when a column toggles between a **compact trigger** (e.g. icon button) and an **expanded inline control** (e.g. **`Autocomplete`** with cancel, blur rules, portal), extract a subcomponent (e.g. **`AddClockButton`**) with a **small, named props type** for **parent context only** (e.g. `implicitZoneSet`, `clocks`). Keep **local** state, refs, and effects **inside** that subcomponent, or in a **private hook** called **from** that subcomponent (e.g. **`useWorldClockAddColumn`**) when the logic is large—do not thread those through the page-level hook.
4. **Extract a custom hook** that returns a **tuple** (or small object) so the main component mostly wires props and JSX instead of owning all effects and state.

Combine subcomponents, containers, expandable slots, and hooks as needed.

#### Custom hooks: initialization and tuple types

- The **main** custom hook (the one the exported component calls) should hold **cross-cutting** concerns: store **`init`**, **shared** timers, and state that **several** children need (e.g. one `now` tick for every clock card). Do **not** fold every subtree’s local UI state into that hook—doing so produces a **large return object** and forces **long prop lists** into children.
- Do **not** put state, refs, or effects that serve **only one subcomponent** in the **main** custom hook. Keep them **inside that subcomponent** (`useState` / `useRef` / `useEffect` in the component body). If the logic is **large**, extract a **separate custom hook** and call it **from that subcomponent** (e.g. `AddClockButton` calls `useWorldClockAddColumn`). **Colocate** such hooks in the file’s **Custom hooks** section (typically after the primary hook and its direct helpers); `function` declarations hoist so the hook may appear **below** the component that uses it.
- When the hook returns a **tuple**, declare it with an **explicit tuple return type** so call sites and refactors stay clear: `function usePomodoroMechanics(): [PomodoroPhase, boolean, boolean] { ... }`. Avoid relying on inference alone for multi-value tuple returns.

### Exports

- Export the **main component as a named function**: `export function PomodoroPanel() { ... }`.
- Keep **subcomponents and hooks file-private** unless another module genuinely needs them (then consider moving to a separate file).

### Props and typing

- For **small** prop sets (few primitives, no per-field JSDoc), an **inline object type** on the parameter list is fine:

  `function TabPanel({ phase, running }: { phase: PomodoroPhase, running: boolean })`.

- When props are **non-trivial** (many fields, optional callbacks/refs, or **JSDoc on individual props**), declare a **named `type` or `interface`** **immediately above** the component (e.g. `type WorldClockCardProps = { … }` then `function WorldClockCard(props: WorldClockCardProps)`).

- Reuse **domain types** from stores or shared modules instead of duplicating unions (e.g. **`PomodoroPhase`** from **`@/app/lib/pomodoroLayout`**, re-exported from **`@/app/_stores/pomodoroStore`** for store-centric imports).

### Passing props

- You may use **object spread** to forward a small bundle without repeating names:  
  `<TabPanel {...{ phase, running }} />`  
  Use this when it stays readable; switch to explicit props if the list grows or names are unclear.

### UI stack

- Prefer **Mantine** primitives for layout and controls: `Paper`, `Stack`, `Group`, `Box`, `Tabs`, `Button`, `ActionIcon`, `Text`, etc.
- When markup for a **`Group`**, **`Stack`**, **`Tabs`**, or **`Tabs.Tab`** grows heavy, treat that wrapper as a candidate for a **dedicated subcomponent** (see **File layout → Component size (~100 lines)**).
- Express layout with **Mantine props** first (`gap`, `align`, `justify`, `wrap`, `w`, `py`, `radius`, `variant`, `size`, `c`, …).
- Use **`style={{ ... }}`** for one-off values (e.g. fixed widths, rgba backgrounds, flex quirks) that are not covered by props.
- Use **`className`** with **Tailwind** utilities where they are concise and stable (e.g. `flex`, `min-w-0`, `invisible`, `pointer-events-none`). Mixing Mantine + Tailwind in one tree is acceptable here.
- **Primary action color (pomodoro phase):** for the main **`Button`** `variant="filled"` in the pomodoro panel and for **primary-style** controls elsewhere (e.g. **`ActionIcon`** `variant="light"` used as the main “add” affordance), set **`color={getColorFromPhase(phase)}`** from **`@/app/lib/pomodoroLayout`**, with **`phase`** from **`useCurrentPhase()`** in **`@/app/_stores/pomodoroStore`**. Related icon-only controls in the same control group (e.g. cancel next to an expanded search) may use the same **`color`** so accents stay aligned with the timer phase.

### State and side effects

- Prefer running **subscriptions, timers, and one-off initialization** from the file’s **main custom hook** (see **File layout → Custom hooks**) so the exported component stays mostly declarative.
- **Subscribe** to global state with small selector hooks from stores (e.g. `useCurrentPhase()`, `useIsRunning()`).
- **Mutations** go through a stable **actions** object (e.g. `pomodoroActions.pause()`), not ad-hoc store access in JSX click handlers when an actions API exists.
- **`useEffect`**: guard early (`if (!running) return`), always **return a cleanup** for timers/subscriptions, and list **complete dependency arrays**.
- When a callback is referenced inside an effect, stabilize it with **`useCallback`** and include its dependencies.
- For **`window` / `Notification` / `AudioContext`**, guard with `typeof window === "undefined"` (or equivalent) where setup must not assume a browser during SSR/build if the code path can run on the server.

### Accessibility

- Give interactive controls **`aria-label`** (and `title` on icons when it helps).
- Use **`aria-live`** / **`aria-atomic`** on regions that update for assistive tech (e.g. a timer).
- Use **`role`** when it clarifies semantics (`role="timer"`).
- Use **`aria-hidden`** on decorative or duplicate-visual slots (e.g. invisible layout spacers).
- **Motion:** this app **does not** implement **`prefers-reduced-motion`** branching. Do not add `useSyncExternalStore` / `matchMedia("(prefers-reduced-motion: reduce)")` (or similar) to toggle animation unless product requirements change. Use **full** motion where the underlying component supports it (e.g. always render a running second hand on analog clocks).

### JSX details

- Escape apostrophes in text with the **entity** `&apos;` (e.g. `Today&apos;s work`).
- **Conditional UI**: prefer `condition ? <Node /> : null` over `&&` when the condition is not strictly boolean, to avoid leaking `0`/`""` into the tree.
- **Casts**: after runtime checks, narrow with `as` only when necessary (e.g. tab value to a union type); prefer validation when values come from untrusted input.
- **Handlers in JSX:** do not paste **large** anonymous functions into props (e.g. `onKeyDown={(e) => { …many branches… }}` or a long `onChange`). Extract them: use **`useCallback`** (often inside a **custom hook** colocated with the subtree), or a **named `function handleX`** in the module, then pass **`onKeyDown={handleKeyDown}`**. Keeps JSX readable and matches how event logic is tested and reviewed.

### Comments

- Use short **`/** ... */` blocks** above non-obvious UI rules (e.g. when a control is shown or hidden), not on every line.

### Error Handling

- Never leave `catch` blocks empty. Log a warning at minimum (e.g. `console.warn`).

### Icons

- Use **Tabler** icons from `@tabler/icons-react` with explicit **`size`** and **`stroke`** where the design calls for it.

### Consistency note

Keep **semicolons** and trailing commas aligned with the surrounding file. When editing a file, match its existing style.

## Client store style guide

This section describes how client-side stores in this codebase are structured. It is derived from `app/_stores/pomodoroStore.ts` (Valtio). Follow it for new or heavily edited stores unless a file already establishes a different, consistent convention.

### Stack

- Use **Valtio**: `proxy` for the mutable state object, **`useSnapshot`** in React hooks for reactive reads, and **`subscribe`** from `valtio/vanilla` for side effects (e.g. persistence) that should not run on every render.

### File layout (mandatory)

**Store script layout is mandatory.** Keep sections in this order so every store file reads the same way:

| Order | Block | Contents |
|-------|--------|----------|
| 1 | **Imports** | Valtio, `valtio/vanilla`, app libs (logger). |
| 2 | **Module-level constants** | `SCREAMING_SNAKE_CASE` keys, defaults, limits, domain constants. |
| 3 | **`proxy` state** | Single private `proxy({ ... })`. |
| 4 | **Exported types** | `export type` for domain and persisted shapes (`V1` suffix where applicable). **Order:** composite / “main” types first, then smaller types they compose (see **Exported types** below). |
| 5 | **Exported hooks** | `use*` functions using `useSnapshot` only. |
| 6 | **Other small exported helpers** | Pure utilities consumers need (e.g. `localDayKey`) — keep minimal. |
| 7 | **Actions object** | `const featureActions = { ... }` — **`init` must be the first method declared** (see below). |
| 8 | **Private domain logic** | Predicates, transitions, duration math, helpers (typically **`Snapshot<T>`** in arguments), etc. |
| 9 | **Persistence (end of file)** | Load/parse, pick/apply persisted shapes, `localStorage` I/O, dirty JSON tracking, type guards used only for persistence — **always last**, after all other private helpers. |

Do not bury persistence in the middle of the file.

### Imports

Typical order (group with blank lines as in the reference store):

1. **`valtio`** — `proxy`, `useSnapshot`, and `type Snapshot` when you type snapshot-based helpers.
2. **`valtio/vanilla`** — `subscribe` (and any other vanilla APIs).
3. **App libs** — e.g. `@/lib/logger` for `log.error` / `log.warn` (never swallow storage or parse errors silently).

Use the shared **logger** instead of raw `console.*` so levels stay consistent.

### Module-level constants

These bindings are **constants** (not derived at runtime). Declare them **above** the `proxy`:

- **Versioned storage keys** — namespaced and versioned, e.g. `deepdash.pomodoro.config.v1`, so migrations and collisions stay manageable.
- **Defaults, limits, and domain constants** — durations, thresholds, etc.

**Naming:** every such **constant** must use **`SCREAMING_SNAKE_CASE`** (e.g. `CONFIG_KEY`, `DEFAULT_WORK_MS`, `MAX_WORK_MINUTES`, `WORK_BLOCKS_BEFORE_LONG_BREAK`).

**Do not** place **functions** between the constants block and the `proxy` (e.g. `localStorage` key builders). Those belong in **Persistence** at the end of the file, next to read/write helpers, even if they only use module-level prefix constants declared above the proxy.

### The `proxy` state object

- Hold **one** `const myStore = proxy({ ... })` per module.
- **Never export** the proxy. Use it only in **exported reactive hooks** (via **`useSnapshot`**) and inside **action methods** (read and mutate the proxy **directly**).
- Initialize fields with **explicit types** where inference is too wide (`as PomodoroPhase`, `as Record<...>`, `null as T | null`).
- Document **non-obvious flags and shapes** with **`/** ... */`** on the property (e.g. `hydrated` gating persistence, what `activePhaseRun` means vs idle).

### Exported types

- **`export type`** for anything **returned from React hooks** (and supporting shapes those return values use): phases, persisted **V1** shapes (`PomodoroConfigV1`, `PomodoroDayLogV1`), in-memory structures (`ActivePhaseRun`, etc.).
- Suffix **persisted** JSON/document types with **`V1`** (or bump when the schema changes — align with the export/import rules above if the data is part of app export).
- **Order (main before parts):** declare **larger or composite** types first, then **smaller** types that appear as fields inside them (e.g. `TodoDayDocumentV1` before `TodoItem`). TypeScript allows forward references within the same file when a composite type mentions a part type declared just below it.

### React hooks (`use*`)

**`use*` hooks are the only supported way for React components to read stored data.** Do not read the proxy from components; subscribe through hooks.

- Export **named functions** `useThing(): Snapshot<T>` that call **`useSnapshot(store)`** and return a **primitive, derived value, or narrow slice** so components re-render when that slice changes.
- Put **derived logic** in the hook body when it is UI-facing (e.g. `useSecondsRemaining`, `useTodayWorkMsDisplay`).

### Actions object

**Actions are the only supported way for React components to request state changes.** Do not expose ad-hoc mutators; components read via hooks and command via `featureActions`.

- **Do not** call `useSnapshot` inside an action. **Do** use `useSnapshot` inside exported hooks. **Mutate** the `proxy` state **directly** inside actions (Valtio tracks mutations and will trigger all use* hooks that use the mutated data).
- Prefer **meaningful action methods** that encode **real state transitions** (start, pause, finalize phase, etc.). Avoid **thin setters** except where unavoidable — typically **configuration** fields that need clamping or validation.
- Export a **single `const featureActions = { ... }`** with **named methods** (`function name()` syntax inside the object is fine for stack traces).
- Inside any `subscribe` callback used for persistence, **guard** on `hydrated` (or equivalent) before writing.

#### `init` (required, first action)

Every store that persists to **`localStorage`** must expose an **`init`** method as the **first property** on the actions object. It must:

1. **Load** persisted data into the proxy (e.g. `loadFromStorage()`), including hydration flags and resetting ephemeral state as needed.
2. **Subscribe** to store changes and, when allowed (e.g. after `hydrated`), **update** `localStorage`.
3. **Return** the **`subscribe` unsubscribe function** so callers (e.g. `useEffect` in a root component) can **`return` it on unmount** and stop persistence callbacks.

Pattern:

```ts
init: function init(): () => void {
  loadFromStorage();
  return subscribe(myStore, () => {
    if (!myStore.hydrated) return;
    persistIfChanged();
  });
},
```

#### `exportData` / `importData` (stores included in app JSON backup)

Stores that participate in **`lib/dataExport.ts`** must also expose:

- **`exportData()`** — returns a **versioned slice** plain object, e.g. `{ version: 1, … }`, suitable for JSON. Use a module constant **`FEATURE_EXPORT_VERSION`** and an exported type **`FeatureExportV1`** (bump names when the slice shape changes, e.g. `FeatureExportV2`).
- **`importData(data: unknown)`** — accepts **any supported slice shape** for that feature (including legacy objects **without** a `version` field when you still support older backups). Updates the **proxy**, **`localStorage`**, and any **`last…Json`** dirty-tracking strings so persistence stays consistent.

Place **`exportData` / `importData` on `featureActions` after domain methods**; **`init` remains the first action.**

Also **export a pure migrator**:

- **`migrateFeatureSliceToLatest(data: unknown): FeatureExportV1`** (name by feature) — **no `localStorage` side effects**; normalizes unknown JSON to the **current** slice type. Used by **`importData`**, by **`tryMigrateDeepdashBundle`** in `lib/dataExport.ts`, and by Jest. **Branch on `data.version`** (and on legacy shapes) here; throw a clear error if the slice version is unsupported.

Implement **`migrateFeatureSliceToLatest` and slice-specific helpers in the Persistence section** at the **end of the file** (or a `// --- bundle export/import ---` subsection there). **`lib/dataExport.ts`** should only assemble the top-level bundle (`version`, `exportedAt`) and delegate slices to each store — **do not** duplicate per-feature parse/migrate logic outside the store.

### Private implementation

- **Pure predicates and domain helpers** — e.g. `isRunning`, `durationForPhase`, transition helpers. Typically take **`Snapshot<T>`** in **arguments** so the same function can be called from hooks (snapshotted data) and from actions (proxy state is assignable for reads).
- **`Snapshot<T>` is type-compatible with `T`** for field access, so one helper avoids duplication across hooks and actions.
- **Private setters** only where they **centralize validation** (often config clamps). Do not use them as a public alternative to actions.
- **Section comments** for long non-persistence regions: e.g. `// --- time-related helpers ---`.

#### Storage I/O

*(Placed at the **end of the store file** — see **File layout**.)*

Include here **private helpers that only exist for persistence**, such as functions that build `localStorage` key strings from the module-level prefix constants (those constants stay **above** the `proxy`; the builders live **here**).

Stores use **`localStorage`** for persistence.

- **`hydrated` flag:** **`subscribe` handlers must not write** to `localStorage` until `loadFromStorage()` has finished — defaults in memory would overwrite the user’s saved data. After load, set **`hydrated: true`** only once parsing, application of stored data, and any reset of ephemeral fields are complete.
- **`typeof window === "undefined"`** early-return for any `localStorage` access (static export / SSR safety).
- **`try` / `catch`** around **read** and **write** paths; log with **`log.error`** or **`log.warn`** and include **context** (feature prefix, key, error).
- Parse with **`JSON.parse` → `unknown`**, then validate with **`isRecord`**, **narrowing type guards** (`isPomodoroPhase`), and **per-field parsers** that return **`null` or skip** invalid entries rather than throwing.
- **Clamp** and **fallback** loaded numbers (e.g. `clampPositiveMs`) so bad data cannot corrupt the store.
- **Dirty tracking**: keep **`lastConfigJson`** / **`lastLogsJson`** (or similar) strings; **`JSON.stringify`** the picked persist shape, compare, then write only when changed to avoid churn.
- **`pickPersistedX()`**: build a **plain serializable object** from the proxy (spread / map) so you do not persist proxies or accidental references.
- **`applyXRecord(parsed)`**: apply validated fields to the store with the same validation as private setters where possible.

### Catch blocks

Do **not** leave `catch` empty. Log at least a **warning** (e.g. `log.warn`) or **`log.error`** when the failure is exceptional, and include context.

### Consistency

Match **semicolons**, **trailing commas**, and **naming** (`useCurrentPhase`, `pomodoroActions.selectPhase`) to the file you are editing and to sibling stores in `app/_stores/`.
