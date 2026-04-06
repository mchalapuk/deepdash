# To-do implementation for structure-deps
_Exported on 3/31/2026 at 19:00:44 GMT+2 from Cursor (2.6.21)_

---

**User**

Implement the following to-dos from the plan (the plan is attached for your reference). Do NOT edit the plan file itself.

You have been assigned the following 1 to-do(s) with IDs: structure-deps

1. [structure-deps] Static export next.config; CSP meta first in root head; MantineProvider; valtio stores; loglevel setLogLevel(warn); math.js; react-clock; flipclock; next/font/local; Intl.supportedValuesOf timeZone for Mantine Autocomplete component; static hosting + HTTP cache + SW; no runtime fetches; Jest setup

These to-dos have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the assigned to-dos.

---

**Cursor**


Implementing structure-deps: exploring the codebase and marking the todo in progress.




Installing dependencies and setting up the full structure. Checking for `@fontsource-variable` font files to vendor:




Creating the file structure: copying the font, then adding the implementation files.




Implementing files: updating `package.json`, `next.config.ts`, layout, providers, and supporting modules.




Fixing a circular ` --font-sans` reference in `globals.css`.




Fixing the ESLint purity violation and addressing CSP ordering: Next injects charset/viewport before custom head content — checking whether we can prioritize the CSP meta.




Adding CSP to `public/_headers` so Netlify (and similar) send the policy at the HTTP layer. Updating `public/_headers`.




Removing the verbose layout comment to match your code style.




Here’s what was implemented for **structure-deps**:

### Static export and images
- [`next.config.ts`](next/config.ts): `output: 'export'` and `images.unoptimized: true` (static hosting–friendly).

### CSP and caching
- [`app/layout.tsx`](app/layout.tsx): `<meta httpEquiv="Content-Security-Policy" />` is the **first child of your `<head>`** in the layout tree, with `script-src` including `'unsafe-eval'` only in **development** (Turbopack). Production uses `'self' 'unsafe-inline'` for scripts plus other `default-src 'self'`-style directives, `worker-src 'self'` for the SW, etc.
- **Note:** In the built `out/index.html`, Next still prints `charSet` / `viewport` / asset tags before merged head children, so the CSP meta is **not** the first byte of `<head>`. The same policy is also sent via [`public/_headers`](public/_headers) (`Content-Security-Policy` on `/*`) for Netlify-style hosts so the edge can enforce it before HTML.

### Fonts (no Google, no runtime fetches)
- Replaced `next/font/google` with **`next/font/local`** using a vendored file: [`app/fonts/inter-latin-wght-normal.woff2`](app/fonts/inter-latin-wght-normal.woff2) (copied from the former `@fontsource-variable/inter` asset; **that npm dependency was removed**).

### Mantine + logging
- Global styles: `@mantine/core/styles.css` in the root layout.
- Client [`app/_components/AppProviders.tsx`](app/_components/AppProviders.tsx): `MantineProvider` + `createTheme` (font stack uses `var(--font-sans)`).
- [`lib/logger.ts`](lib/logger.ts): **`loglevel`** configured with **`log.setLevel('warn')`** (correct API; there is no `setLogLevel` on the default export).

### Timezones + Autocomplete
- [`lib/timezones.ts`](lib/timezones.ts): `getSupportedTimeZones()` via **`Intl.supportedValuesOf('timeZone')`** with a small **bundled** fallback list.
- [`app/_components/TimezoneAutocomplete.tsx`](app/_components/TimezoneAutocomplete.tsx): Mantine **`Autocomplete`** over that list.

### Dependencies exercised on the home page
- [`app/_components/DepsSmoke.tsx`](app/_components/DepsSmoke.tsx): **`mathjs`**, **`react-clock`** (+ CSS), **`@leenguyen/react-flip-clock-countdown`** (+ CSS) — all bundled, no runtime network.

### Valtio stores (one per feature)
- [`app/_stores/worldClockStore.ts`](app/_stores/worldClockStore.ts), [`pomodoroStore.ts`](app/_stores/pomodoroStore.ts), [`todoStore.ts`](app/_stores/todoStore.ts), [`calculatorStore.ts`](app/_stores/calculatorStore.ts).

### Offline triple
- [`public/sw.js`](public/sw.js): install/activate + **cache same-origin GETs** and **offline fallback** (navigations fall back to cached `/index.html` when possible).
- [`AppProviders`](app/_components/AppProviders.tsx): registers **`/sw.js`** in **production** only (avoids dev cache weirdness).
- [`public/_headers`](public/_headers): long cache for `/_next/static/*`, revalidate for `/*`, plus CSP as above.

### Jest
- [`jest.config.cjs`](jest.config.cjs): **`@swc/jest`**, path alias `@/*`.
- [`__tests__/smoke.test.ts`](__tests__/smoke.test.ts): timezones + **mathjs**.
- [`package.json`](package.json): **`"test": "jest"`**.

### Entry page
- [`app/page.tsx`](app/page.tsx): simple Mantine layout composing title, `TimezoneAutocomplete`, and `DepsSmoke`.

`npm run build`, `npm test`, and `npm run lint` all succeed on this tree.

---

**User**

@app/_stores/pomodoroStore.ts:6 Don't we also need timeStarted and timePaused?


---

**Cursor**


Checking the pomodoro store and related code to determine required state for timer accuracy (including background tabs).




Adding `timeStarted` and `timePaused` plus `remainingMs` so we can compute a `Date.now()`-based deadline: while running, deadline = `timeStarted + remainingMs`; on pause we freeze `remainingMs` and set `timePaused`.




Yes. For a **pause/resume** countdown that stays correct when the tab is in the background, you need wall-clock anchors, not just `phase`.

- **`timeStarted`** — last `Date.now()` when the user **started or resumed**. While the timer is running, the end time is `timeStarted + remainingMs`.
- **`timePaused`** — `Date.now()` when they **paused** (and `timeStarted` should be cleared), or `null` while it’s running.

Those two alone don’t define *how much* time is left after a pause, so there is also **`remainingMs`**: milliseconds still on the clock **at the moment `timeStarted` was set** for this run. On pause you set `remainingMs` from the current deadline, set `timePaused`, clear `timeStarted`; on resume you set `timeStarted = Date.now()`, clear `timePaused`, and keep `remainingMs` until the next sync.

That matches the plan’s **`Date.now()`-based** countdown and keeps room for a separate **daily work** accumulator (e.g. another field or a small helper that adds `(now - lastWorkTickAt)` only while `phase === 'work'` and `timeStarted != null` and `timePaused == null`). I didn’t add the work counter yet since you only asked about these timer fields.

---

**User**

@app/layout.tsx:49 This works but the meta tag is very late in the head section. We need something smarter. Maybe something custom that will add this tag at the top post-build?

---

**Cursor**


Implementing a shared CSP config and a post-build script to inject the CSP meta immediately after `<head>`. Checking the layout and `out` HTML structure.




Centralizing CSP strings and adding a post-build step to inject the meta immediately after `<head>` and dedupe any later CSP metas. Skipping the layout meta in production so we don't duplicate policies.




Here’s what changed:

### 1. Shared policy — [`csp.config.mjs`](csp.config.mjs)
Builds both **development** (adds `'unsafe-eval'` for Turbopack) and **production** CSP strings in one place.

### 2. Layout — [`app/layout.tsx`](app/layout.tsx)
- Imports [`getLayoutCsp()`](lib/csp.ts) from `@/lib/csp`.
- Renders the CSP `<meta>` **only when `NODE_ENV === 'development'`**, so production HTML doesn’t get a second, late meta from React.

### 3. Post-build inject — [`scripts/inject-csp-meta.mjs`](scripts/inject-csp-meta.mjs)
- Runs after `next build`.
- Rewrites `out/index.html`, `out/404.html`, and `out/_not-found.html`.
- Strips every `<meta http-equiv="Content-Security-Policy" …>`.
- Inserts a single CSP meta **right after** `<head…>` (first thing in `head`).

### 4. Build script — [`package.json`](package.json)
`"build": "next build && node scripts/inject-csp-meta.mjs"`

Production `out/index.html` now starts `<head>` like this:

```html
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; ..." />
<meta charSet="utf-8"/>
```

[`public/_headers`](public/_headers) has a short note to keep its CSP aligned with `csp.config.mjs` (still duplicated text for Netlify).

**Dev:** CSP meta still comes only from the layout (still late in the merged head); that’s unchanged. If you want the same “first in head” behavior locally, you’d need a dev post-process of `.next` or a different dev server hook, which is usually not worth it.

---

**User**

OK, please run the build and check if the script works correctly.

---

**Cursor**


`npm run build` finished successfully (including `node scripts/inject-csp-meta.mjs`).

**Checks**

| File             | CSP `<meta>` count | Right after `<head>` |
| ---------------- | ------------------ | -------------------- |
| `out/index.html` | 1                  | yes                  |
| `out/404.html`   | 1                  | yes                  |
| `out/_not-found.html` | 1             | yes                  |

**Sample** (`out/index.html`): the head opens with the CSP meta, then `charSet` and `viewport`:

```1:1:out/index.html
<!DOCTYPE html><html lang="en" class="inter_debb2eab-module__jFV8tG__variable h-full antialiased"><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self'; worker-src 'self'" /><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" ...
```

So the inject step is behaving as intended: one policy per HTML file, placed first inside `<head>`.

---

**User**

I don't like the library you chose for the flip clock. Please use FlipClock.js (flipclock on npm) -> https://flipclockjs.com/guide/getting-started.html 

This will require creating a custom react wrapper but it looks much better than what we have now.

---

**Cursor**


Replacing the flip-clock library with `flipclock` (FlipClock.js) and adding a React wrapper. Exploring the codebase and the `flipclock` package API.




Creating the React wrapper component and updating `DepsSmoke`.




Here’s what changed.

### Dependency
- Removed `@leenguyen/react-flip-clock-countdown`
- Added **[`flipclock`](https://flipclockjs.com/guide/getting-started.html)** (v1.0.1) — same API as the getting-started guide (`flipClock`, `elapsedTime`, `theme`, `css`), **no CDN**; CSS via `flipclock/themes/flipclock`

### Wrapper — [`app/_components/FlipClockJsCountdown.tsx`](app/_components/FlipClockJsCountdown.tsx)
- Client-only: mounts a container `div`, then in `useEffect`:
  - `elapsedTime({ to: new Date(endsAt), format: "[mm]:[ss]" })` for a **countdown to a wall time** (aligned with how `ElapsedTime` uses `to` in the library)
  - `theme({ dividers: ":", css: css({ fontSize }) })` like the docs
  - `flipClock({ ... }).mount(parent)`; `start()` when `running` is true
  - Cleanup: `stop()` + `unmount()`
- Props: `endsAt` (epoch ms), optional `className`, `fontSize`, `running` (for later pomodoro pause)

### Usage
- [`app/_components/DepsSmoke.tsx`](app/_components/DepsSmoke.tsx) now renders `<FlipClockJsCountdown endsAt={endsAt} />` instead of the old React component.

`npm run build`, `npm run lint`, and `npm test` all pass. When you wire the pomodoro UI, reuse `FlipClockJsCountdown` and drive `endsAt` / `running` from your Valtio store.

---

**User**

@app/_components/DepsSmoke.tsx:26 Unfortunately, this creates a hydration error when the server renders time with one second earlier than the client. We need to render it only on the client side.

---

**Cursor**


Deferring the analog `Clock` until after mount so server HTML and the first client paint match.




Here’s what changed:

1. **`analogReady`** — starts as `false`, so **neither** the server nor the first client render output `<Clock>`.
2. **`useEffect`** — on the client it sets **`setNow(new Date())`**, sets **`setAnalogReady(true)`**, then starts the 1s interval so the first paint with the clock uses the current time.

A **100×100** placeholder keeps layout stable until the clock mounts. After that, only client updates change the hands, so there’s no server/client time mismatch.

