# Client store style guide

This document describes how client-side stores in this codebase are structured. It is derived from `app/_stores/pomodoroStore.ts` (Valtio). Follow it for new or heavily edited stores unless a file already establishes a different, consistent convention.

## Stack

- Use **Valtio**: `proxy` for the mutable state object, **`useSnapshot`** in React hooks for reactive reads, and **`subscribe`** from `valtio/vanilla` for side effects (e.g. persistence) that should not run on every render.

## File layout (mandatory)

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

## Imports

Typical order (group with blank lines as in the reference store):

1. **`valtio`** — `proxy`, `useSnapshot`, and `type Snapshot` when you type snapshot-based helpers.
2. **`valtio/vanilla`** — `subscribe` (and any other vanilla APIs).
3. **App libs** — e.g. `@/lib/logger` for `log.error` / `log.warn` (never swallow storage or parse errors silently).

Use the shared **logger** instead of raw `console.*` so levels stay consistent.

## Module-level constants

These bindings are **constants** (not derived at runtime). Declare them **above** the `proxy`:

- **Versioned storage keys** — namespaced and versioned, e.g. `worktools.pomodoro.config.v1`, so migrations and collisions stay manageable.
- **Defaults, limits, and domain constants** — durations, thresholds, etc.

**Naming:** every such **constant** must use **`SCREAMING_SNAKE_CASE`** (e.g. `CONFIG_KEY`, `DEFAULT_WORK_MS`, `MAX_WORK_MINUTES`, `WORK_BLOCKS_BEFORE_LONG_BREAK`).

**Do not** place **functions** between the constants block and the `proxy` (e.g. `localStorage` key builders). Those belong in **Persistence** at the end of the file, next to read/write helpers, even if they only use module-level prefix constants declared above the proxy.

## The `proxy` state object

- Hold **one** `const myStore = proxy({ ... })` per module.
- **Never export** the proxy. Use it only in **exported reactive hooks** (via **`useSnapshot`**) and inside **action methods** (read and mutate the proxy **directly**).
- Initialize fields with **explicit types** where inference is too wide (`as PomodoroPhase`, `as Record<...>`, `null as T | null`).
- Document **non-obvious flags and shapes** with **`/** ... */`** on the property (e.g. `hydrated` gating persistence, what `activePhaseRun` means vs idle).

## Exported types

- **`export type`** for anything **returned from React hooks** (and supporting shapes those return values use): phases, persisted **V1** shapes (`PomodoroConfigV1`, `PomodoroDayLogV1`), in-memory structures (`ActivePhaseRun`, etc.).
- Suffix **persisted** JSON/document types with **`V1`** (or bump when the schema changes — align with AGENTS.md export/import rules if the data is part of app export).
- **Order (main before parts):** declare **larger or composite** types first, then **smaller** types that appear as fields inside them (e.g. `TodoDayDocumentV1` before `TodoItem`). TypeScript allows forward references within the same file when a composite type mentions a part type declared just below it.

## React hooks (`use*`)

**`use*` hooks are the only supported way for React components to read stored data.** Do not read the proxy from components; subscribe through hooks.

- Export **named functions** `useThing(): Snapshot<T>` that call **`useSnapshot(store)`** and return a **primitive, derived value, or narrow slice** so components re-render when that slice changes.
- Put **derived logic** in the hook body when it is UI-facing (e.g. `useSecondsRemaining`, `useTodayWorkMsDisplay`).

## Actions object

**Actions are the only supported way for React components to request state changes.** Do not expose ad-hoc mutators; components read via hooks and command via `featureActions`.

- **Do not** call `useSnapshot` inside an action. **Do** use `useSnapshot` inside exported hooks. **Mutate** the `proxy` state **directly** inside actions (Valtio tracks mutations and will trigger all use* hooks that use the mutated data).
- Prefer **meaningful action methods** that encode **real state transitions** (start, pause, finalize phase, etc.). Avoid **thin setters** except where unavoidable — typically **configuration** fields that need clamping or validation.
- Export a **single `const featureActions = { ... }`** with **named methods** (`function name()` syntax inside the object is fine for stack traces).
- Inside any `subscribe` callback used for persistence, **guard** on `hydrated` (or equivalent) before writing.

### `init` (required, first action)

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

### `exportData` / `importData` (stores included in app JSON backup)

Stores that participate in **`lib/dataExport.ts`** must also expose:

- **`exportData()`** — returns a **versioned slice** plain object, e.g. `{ version: 1, … }`, suitable for JSON. Use a module constant **`FEATURE_EXPORT_VERSION`** and an exported type **`FeatureExportV1`** (bump names when the slice shape changes, e.g. `FeatureExportV2`).
- **`importData(data: unknown)`** — accepts **any supported slice shape** for that feature (including legacy objects **without** a `version` field when you still support older backups). Updates the **proxy**, **`localStorage`**, and any **`last…Json`** dirty-tracking strings so persistence stays consistent.

Place **`exportData` / `importData` on `featureActions` after domain methods**; **`init` remains the first action.**

Also **export a pure migrator**:

- **`migrateFeatureSliceToLatest(data: unknown): FeatureExportV1`** (name by feature) — **no `localStorage` side effects**; normalizes unknown JSON to the **current** slice type. Used by **`importData`**, by **`tryMigrateWorktoolsBundle`** in `lib/dataExport.ts`, and by Jest. **Branch on `data.version`** (and on legacy shapes) here; throw a clear error if the slice version is unsupported.

Implement **`migrateFeatureSliceToLatest` and slice-specific helpers in the Persistence section** at the **end of the file** (or a `// --- bundle export/import ---` subsection there). **`lib/dataExport.ts`** should only assemble the top-level bundle (`version`, `exportedAt`) and delegate slices to each store — **do not** duplicate per-feature parse/migrate logic outside the store.

## Private implementation

- **Pure predicates and domain helpers** — e.g. `isRunning`, `durationForPhase`, transition helpers. Typically take **`Snapshot<T>`** in **arguments** so the same function can be called from hooks (snapshotted data) and from actions (proxy state is assignable for reads).
- **`Snapshot<T>` is type-compatible with `T`** for field access, so one helper avoids duplication across hooks and actions.
- **Private setters** only where they **centralize validation** (often config clamps). Do not use them as a public alternative to actions.
- **Section comments** for long non-persistence regions: e.g. `// --- time-related helpers ---`.

### Storage I/O

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

## Catch blocks

Do **not** leave `catch` empty. Log at least a **warning** (e.g. `log.warn`) or **`log.error`** when the failure is exceptional, and include context.

## Consistency

Match **semicolons**, **trailing commas**, and **naming** (`useCurrentPhase`, `pomodoroActions.selectPhase`) to the file you are editing and to sibling stores in `app/_stores/`.
