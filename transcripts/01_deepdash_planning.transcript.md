# App dashboard planning
_Exported on 3/31/2026 at 16:51:36 GMT+2 from Cursor (2.6.21)_

---

**User**

Let's plan an app with tools are typically needed in modern work (both deep work and online meetings). We want to put all (or most) of those tools on a single dashboard.

Things I know for sure are needed there:
- configurable world clock
- configurable pomodoro timer with built in work time counter
- daily todo list
- google-style calculator

We need:
1. Tasks for creating each tool
2. design how a dashboard with all those tools would look like and create task to implement it.
3. Figure out what should go to README.md and create a task for it.

---

**Cursor**


Exploring the workspace to see what's present so we can anchor the plan in the real codebase.




Noting a fresh Next.js 16 + Tailwind 4 app with a placeholder home page. Creating a concrete plan: per-tool tasks, dashboard layout, and README scope.



---

**User**

A couple comments to the plan:
- I like that todo and pomodoro are somehow together but I imagine todo to be the only component on a narrow right column with its own scroll bar. This way, the layout will accomodate for a very long todo list. The font should be small enough so that the line breaks in todo items are not too often.
- Pomodoro needs to be the main component, with quite large UI elements, similar to pomofocus.io. There need to be 3 tabs representing 3 phases of pomodoro (pomodoro, short break, long break) each with same looking content (a large timer + start/pause/resume button + skip button).
- World clock goes at the top of the page (into the header) with a plus button at the end of the header to add new clock.
- The calculator goed under the pomodoro. We only need a single calculator prompt input and display the calculation + result. No need to implement actual calculator layout.

---

**Cursor**


Updating the plan document to reflect your layout and UX preferences.




Updating the plan file to incorporate the header clocks, pomofocus-style tabbed pomodoro, narrow scrolling todo column, and simplified calculator.




Here’s what changed in [work_tools_dashboard_9a1d4215.plan.md](/Users/maciej/.cursor/plans/work_tools_dashboard_9a1d4215.plan.md):

### Layout
- **Header:** World clocks in a top band with a trailing **`+`** to add clocks.
- **Main grid:** **Wide left:** Pomodoro (hero) → **calculator directly under it**. **Narrow right:** **only** the daily todo, with **internal vertical scroll** (`max-height` / flex + `overflow-y-auto`) so long lists don’t stretch the page.
- **Todo typography:** Explicitly **smaller type** so lines carry **more characters** before wrap in the narrow column.

### Pomodoro
- **[Pomofocus](https://pomofocus.io)-style:** **Large** timer and primary controls.
- **Three tabs** — Pomodoro (work), Short break, Long break — each with the **same block:** big **mm:ss**, **Start / Pause / Resume**, **Skip**.
- **Daily work counter** stays associated with the pomodoro block (date-keyed reset).

### Calculator
- **Single prompt input**; UI shows **expression + result**. **No keypad / layout**; safe parsing (no raw `eval`), with syntax called out in README.

### Todos in the plan (frontmatter)
- World clock task now mentions **header + trailing +**.
- Pomodoro task mentions **three tabs + Pomofocus-style UI + work counter**.
- Todo task mentions **narrow column + scroll + small type**.
- Calculator task is **prompt-only + safe eval**.

### Open implementation choice (documented in plan)
- What happens if the user **switches tabs while a phase is running** (lock tabs vs pause vs reset) — pick one rule and record it in the README.

Say when you want to **execute** this plan in the repo; until then it’s only reflected in that plan file.

---

**User**

Additonal comments:
- @work_tools_dashboard_9a1d4215.plan.md (48) `app/_components`.
- @work_tools_dashboard_9a1d4215.plan.md (49) let's just use mantine library for UI primitves.
- @work_tools_dashboard_9a1d4215.plan.md (48) let's also use valtio for state management and pino for logging. Pino should be configured to forward errors and warnings to console.log while loggin other severity levels to internal rolling buffer. A separate valtio store for each of the UI components.
- @work_tools_dashboard_9a1d4215.plan.md (53) after already configured clocks, not at the very end.
- @work_tools_dashboard_9a1d4215.plan.md (53) we also need an analog clock display for each clock, and GMT+n label.
- @work_tools_dashboard_9a1d4215.plan.md (56-57) the UI should prevent and failures of this kind, we need is a popup with mantine's autocomplete element (select + input combination).
- @work_tools_dashboard_9a1d4215.plan.md (52) The header needs its own horizontal scroll bar in case we have more clocks than space on the screen. 
- @work_tools_dashboard_9a1d4215.plan.md (62-63) Yes.
- @work_tools_dashboard_9a1d4215.plan.md (63) V1.
- @work_tools_dashboard_9a1d4215.plan.md (57) Let's also change the background color of the whole dashboard depending on the phase. Monodoro -> red. Short break -> green. Long break -> blue.
- @work_tools_dashboard_9a1d4215.plan.md (64-65) Not needed.
- @work_tools_dashboard_9a1d4215.plan.md (68) Whole day stored under a single key.
- @work_tools_dashboard_9a1d4215.plan.md (64) A checkbox on the left of each item. Marking the item as done dimm the text and applies strike through.
- @work_tools_dashboard_9a1d4215.plan.md (64) Empty item and the end of the list with a plus icon instead of checkbox. Clicking on plus icon focuses on the empty item.
- @work_tools_dashboard_9a1d4215.plan.md (64) All items are editable. Editor-like keyboard-based controls: delete or backspace or espace in an empty item deletes it; delete at the end of non-empty, non-last item merges it with the next one, adding a space between them; backspace at the beginning of non-empty, non-first item merges it with the previous one, adding a space between them; enter and the beginning of an item creates a new one before it and focuses on the new item; enter and the end of an item creates a new one after it and focuses on the new item; enter in the middle of an item splits it in two and focuses at the beginning on the second item.
- @work_tools_dashboard_9a1d4215.plan.md (64) On first activity on the page each day (mouse move) display a popup congratulating on completed tasks from the previous day with a nice summary and ask if the remaining tasks should be added to today's list.
- @work_tools_dashboard_9a1d4215.plan.md (70) Use math.js library.
- @work_tools_dashboard_9a1d4215.plan.md (83) Not needed and at risk to become outdated.
- @work_tools_dashboard_9a1d4215.plan.md (86) + the libraries mentioned in other comments.
- @work_tools_dashboard_9a1d4215.plan.md (48) We also want the app to work when offline.

---

**Cursor**


Reading the plan file and updating it with your stack, UI, and feature requirements.




Updating the plan: incorporating Mantine, Valtio, Pino, math.js, offline behavior, richer world clocks and todos, phase-colored backgrounds, and README changes.




Updated [work_tools_dashboard_9a1d4215.plan.md](/Users/maciej/.cursor/plans/work_tools_dashboard_9a1d4215.plan.md) with your notes. Summary of what changed:

### Stack & structure
- **`app/_components/`** for UI modules; optional **`app/_stores/`** (or co-located stores).
- **Mantine** for UI (incl. `Autocomplete`, `Modal`, `Tabs`, inputs).
- **Valtio: one store per feature** (clocks, pomodoro, todos, calculator).
- **Pino** in the client via a **browser `write`**: **`warn` / `error` → `console.log`**, other levels → **in-memory rolling FIFO buffer**. Short “Pino in browser” caveat at the end of the plan.
- **math.js** for the calculator (no custom parser).
- **Offline**: local-only tools + **service worker / cache** so the shell works without network after first load; no CDN-only runtime.

### Header / world clocks
- **`overflow-x: auto`** on the header row for many clocks.
- **`+` immediately after the last clock** in that scroll row (not pinned to the viewport edge).
- Per clock: **analog face**, digital time, **`GMT±n`** for “now” in that zone, user label.
- **Add clock** = **Mantine `Autocomplete`** over an allowlisted IANA set so invalid TZs can’t be committed.

### Pomodoro
- **Full-page background** by phase: work **red**, short **green**, long **blue** (with contrast called out).
- **V1 chime** on phase end.
- **`Date.now()` deltas** kept explicitly.

### Todos
- **One `localStorage` key per day** holding the full list payload.
- Checkbox left; done = **dim + strikethrough**.
- **Trailing row** with **+** (no checkbox); **+** focuses the empty editor.
- Full **keyboard merge/split/delete** behavior you specified.
- **First `mousemove` of each day:** modal with **yesterday’s completion summary** + prompt to **copy incomplete** into today.
- **No** “clear completed”.

### README
- **No long per-tool how-tos**; keep **stack** line and add **Mantine, Valtio, Pino, math.js**, plus offline.

### Todos in plan frontmatter
Seven items retitled to match the above (single `structure-deps` task, world clock / pomodoro / todo / calculator / dashboard / readme).

If you want the rollover modal to trigger on something other than **first mousemove** (e.g. first focus or first interaction), say so and we can adjust the plan wording only.

---

**User**

More comments:
- @work_tools_dashboard_9a1d4215.plan.md (111) After reading your notes, I decided that pino is not good for client-only app. Let's use loglevel library instead.
- @work_tools_dashboard_9a1d4215.plan.md (1-2) Let's add another task - data import/export with Import and Export buttons in the bottom right corner of the  dashboard. The import must be backwards compatible so we need to create a new unit test every time the schema changes. Let's add this info to AGENTS.md.
- @work_tools_dashboard_9a1d4215.plan.md (6) Let's also use Jest for tests.
- @work_tools_dashboard_9a1d4215.plan.md (5) Also, make sure that no library is fetching anything from the web (fonts, images, timezones, etc).
- @work_tools_dashboard_9a1d4215.plan.md (6) Let's use flipclock library for timer in pomodoro and react-clock component for world clocks.
- @work_tools_dashboard_9a1d4215.plan.md (67-68) The app will be served only as static assets (without any server-side logic). Make sure that the agents understand that. Probably something that should go into AGENTS.ts.
- @work_tools_dashboard_9a1d4215.plan.md (78) Make sure that the browser ask for permission right after the page is loaded (not when playing the chime for the first time).
- @work_tools_dashboard_9a1d4215.plan.md (74) We also need desktop notifications for phase end events. Also ask for permission at page load.
- @work_tools_dashboard_9a1d4215.plan.md (82) A fake empty item (not persisted).
- @work_tools_dashboard_9a1d4215.plan.md (84-85) Input per row.
- @work_tools_dashboard_9a1d4215.plan.md (86) Delete -> focus next. Backspace -> focus previous. Esc -> remove focus.

---

**Cursor**


Updating the plan and `AGENTS.md` with your library, testing, static-export, permissions, and todo-focus changes.




Updating the plan (fixing mangled markdown) and extending `AGENTS.md` with static-export, no-runtime-fetch, and schema-testing rules.




Here’s what changed.

### Plan ([work_tools_dashboard_9a1d4215.plan.md](/Users/maciej/.cursor/plans/work_tools_dashboard_9a1d4215.plan.md))
- **Logging:** **loglevel** instead of Pino; **warn/error** → **`console.log`**; other levels → **in-memory rolling buffer**.
- **Stack:** **Jest**; **react-clock** (world); **flipclock-family** countdown for pomodoro (with a short note that some packages need a React ref/`useEffect` wrapper).
- **Static-only:** **`output: 'export'`**, no server runtime — aligned with **AGENTS.md**.
- **No runtime network:** Local fonts (`next/font/local`), **bundled IANA JSON**, audit deps for hidden CDN/network calls.
- **Permissions:** Right after load: **`Notification.requestPermission()`** and **audio unlock/init** — not deferred to the first chime.
- **Phase end:** **Chime** + **`Notification`** desktop alerts.
- **Todos:** Trailing row is a **fake empty row** (not in persisted JSON); **one Mantine Input per row**. **Delete** on empty persisted row → remove, **focus next**; **Backspace** on empty persisted row → remove, **focus previous**; **Escape** → **blur only** (no delete from Esc).
- **New task** **`data-import-export`:** bottom-right **Import/Export**, versioned JSON + migrations; **new Jest test + fixture on every schema change**.
- **dashboard-layout** todo mentions import/export placement.
- Frontmatter **overview** and **readme** todo updated (loglevel, Jest, libraries).
- Removed the **Pino browser** section; added **flipclock npm** note.

### AGENTS ([AGENTS.md](/Users/maciej/p/worktools/AGENTS.md))
New sections after the Next.js blurb:
- **Static assets only** — static export, no Node per request.
- **No runtime network** — fonts, images, timezones, etc. bundled/local.
- **Import/export schema** — backwards compatible import; **on each schema change, add a Jest test with a previous-version fixture**; fixture folder convention.

Used **`AGENTS.md`** (the file in the repo). If you truly want a separate **`AGENTS.ts`**, say so and we can adjust naming in the plan only.

---

**User**

- @work_tools_dashboard_9a1d4215.plan.md (6) Let's also configure content security policy in a meta tag to prevent any assets sourced from outside domains. We need to somehow ensure that this meta tag is rendered before any scripts.
- @work_tools_dashboard_9a1d4215.plan.md (7) Static hosting + HTTP cache + service worker to handle caching.
- @work_tools_dashboard_9a1d4215.plan.md (42-43) Just setLogLevel(warn) will be enough. We can always change this when debugging locally.
- @work_tools_dashboard_9a1d4215.plan.md (45-47) Bundled data probably not needed. Modern browsers support `Intl.supportedValuesOf('timeZone')`.
- @work_tools_dashboard_9a1d4215.plan.md (58) Changes to items are immediately persisted in the store, localStorage updates are throttled and debounced. Be sure to save localStorage before user closes the page.
- @work_tools_dashboard_9a1d4215.plan.md (62-63) Please put those rules back in the document.
- @work_tools_dashboard_9a1d4215.plan.md (69) Please add the specification parts that you removed here.

Please be sure to not remove/summarize any parts of the current specification that were not commented on.

---

**Cursor**


Reading the full plan to restore summarized sections and apply your updates without dropping unrelated specification.




Updating the plan with your CSP, caching, loglevel, timezone, persistence, and full todo/rollover/calculator specs; fixing markdown glitches; aligning `AGENTS.md` timezone wording with `Intl.supportedValuesOf`.




Here’s what was updated.

### Plan ([work_tools_dashboard_9a1d4215.plan.md](/Users/maciej/.cursor/plans/work_tools_dashboard_9a1d4215.plan.md))

- **CSP:** New **Context** bullets + **Task 1**: `<meta http-equiv="Content-Security-Policy">` as the **first** child of `<head>`, directives that **block cross-origin** loads (`default-src 'self'`, tight `script-src` / `style-src` / `font-src` / `img-src` / `connect-src`), with a note to **verify `out/index.html`** and only add what Next hydration needs (`'unsafe-inline'` etc.) **without** opening arbitrary third-party origins.
- **Offline:** **Static hosting + HTTP cache + service worker** called out together in Context, Task 1, README todo, and implementation order.
- **loglevel:** **`log.setLevel('warn')`** only in the stack table and Task 1; removed rolling-buffer / custom routing text.
- **Timezones:** **`Intl.supportedValuesOf('timeZone')`** for Autocomplete; optional **small compiled fallback** only if the API is missing; removed bundled `timezones.json` as the default.
- **Persistence:** New **Persistence model** section: **immediate** valtio updates, **debounced/throttled** `localStorage`, **flush** on **`beforeunload` / `pagehide` / `visibilitychange`** where useful. Referenced again in todo/pomodoro tasks.
- **Task 4:** Full **keyboard** rules (merge, split, Enter, Delete/Backspace on empty, Esc blur) spelled out again; **rollover modal** fully specified (first `mousemove`, `localStorage` day key, congratulations + summary, Yes/No carry incomplete); **fake row**, **checkbox/strike**, **not persisted**, **no clear completed** restored/explicit.
- **Task 5:** Restored **Enter to evaluate**, expression + result, **`math.js` errors** in UI, optional valtio, **`aria-live`**.
- **Dashboard / design:** Restored **phase colors**, header scroll behavior, **two-column** layout, pomodoro tab parity, **daily work counter**, **tab-switch** implementation note, **a11y / reduced motion**, **mermaid** diagram.
- **Frontmatter todos:** Aligned with CSP, `Intl`, loglevel, persistence, README/CSP mention.

Markdown around stray backticks (e.g. `**localStorage**`) was normalized to normal bold where it was broken.

### AGENTS ([AGENTS.md](/Users/maciej/p/worktools/AGENTS.md))

- **No runtime network:** Dropped “static JSON for timezone allowlists”; documented **`Intl.supportedValuesOf('timeZone')`** plus a **compiled fallback** only when needed, so it matches the plan.

---

**User**

Almost there:
- @work_tools_dashboard_9a1d4215.plan.md (102) Mantine Autocomplete component (be explicit)
- @work_tools_dashboard_9a1d4215.plan.md (105) Debouncing/throttling needed only for todo list.
- @work_tools_dashboard_9a1d4215.plan.md (133-134) Nope.
- @work_tools_dashboard_9a1d4215.plan.md (134) No physical calculator UI. Just one input + parse result + calculation result.

Please make sure to not change/summarize any part of the plan that wasn't mentioned in the comments.

---

**Cursor**


Reading the plan and applying precise edits: explicit Mantine `Autocomplete`, persistence (debounce only for todos), removing the Task 4 line you rejected, and clarifying the calculator UI.




Applying surgical updates: explicit Mantine `Autocomplete`, persistence (debounce only for todos), removing the rejected Task 4 closing line, clarifying Task 5 and related references, and fixing mangled `` `**` `` artifacts in touched sections.




Updates are in [work_tools_dashboard_9a1d4215.plan.md](/Users/maciej/.cursor/plans/work_tools_dashboard_9a1d4215.plan.md). Here’s what changed relative to your comments:

### Mantine `Autocomplete`
- Called out explicitly as **`Autocomplete` from `@mantine/core`** (combobox: filterable **Input** + suggestions) everywhere it matters: Context (timezones), header design, Task 2, stack table UI row, implementation-order step 4, frontmatter `structure-deps` / `tool-world-clock`.

### Persistence: debounce only for todos
- **Persistence model** now states **debounce/throttle only for the daily todo** `localStorage` payload; **clocks, pomodoro, calculator, import/export** use **immediate** writes.
- **Stack → State** row matches that split (and fixes the broken `` `localStorage` `` markup).
- **Task 2** world clock: **immediate** `localStorage`; removed the old “debounced disk + flush” wording.
- **Task 3** pomodoro: **immediate** persistence (no shared debounce with todos).
- **Frontmatter** `tool-pomodoro`: **`immediate localStorage`** instead of debounced + flush.
- **Implementation order** step 2: **todo** debounce/throttle + flush on unload only.
- **README** todo + Task 8: persistence note scoped to **todo list** debounce + **flush on close**.

### Task 4 closing line
- Removed: *“Apply persistence model: immediate valtio updates; debounced/throttled localStorage; flush on tab close.”*

### Task 5 — Calculator
- **No physical calculator UI** (no keypad / calculator chrome).
- **Exactly:** one **`Input`** + read-only **parse result** (math.js interpretation/normalization) + read-only **calculation result**.
- **Frontmatter** `tool-calculator` and **Accessibility** line updated to match (parse + calculation readouts).

Everything else in the plan was left as-is aside from small consistency fixes in sections above (e.g. **`aria-live`** line formatting).

