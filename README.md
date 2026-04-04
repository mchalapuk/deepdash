# Work Tools

A local-only productivity dashboard: pomodoro timer, world clocks, expression calculator, and a daily todo list, plus JSON backup/restore. All preferences and content stay in the browser unless you export them.

## Prerequisites

- [Node.js](https://nodejs.org/) (current LTS is a good default)
- npm (bundled with Node)

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build` | Production build: static export to `out/`, then injects the Content-Security-Policy `<meta>` into the exported HTML |
| `npm run start` | Runs `next start` (see **Static deploy** below) |
| `npm run lint` | ESLint |
| `npm test` | Jest (import/export migrations and related unit tests) |

## Features (overview)

- **Pomodoro** — Work / short break / long break with configurable durations, daily work-time tracking, phase-colored backdrop, optional chime and desktop notifications.
- **World clocks** — Scrollable header of analog + digital clocks with IANA time zones and labels.
- **Calculator** — Single expression field; normalized parse and numeric result via math.js (evaluate on demand, not on every keystroke).
- **Daily todo** — Checkbox list with keyboard-oriented editing; rollover prompt for carrying incomplete items into a new day.
- **Import / export** — Versioned JSON snapshot of dashboard data for backup and restore.

There is no server-side API: the app is built as static HTML, CSS, and JavaScript.

## Data and privacy

Everything is stored **locally** in the browser (`localStorage` and optional export files). Nothing is sent to a backend by the app.

The **daily todo** slice is written to `localStorage` on a **debounced** schedule while you type, so rapid edits do not hammer storage. On **tab close** and related lifecycle events, any pending todo save is **flushed** so the latest text is not lost.

Other persisted slices (world clocks, pomodoro settings and work totals, calculator state, etc.) save **immediately** when they change.

## Content Security Policy (CSP)

A restrictive CSP is intended to block cross-origin scripts, styles, fonts, and other loads except what the static app needs (including allowances required for Next.js hydration). In **development**, the policy is set from the root layout. In **production**, the build runs a small post-step (`scripts/inject-csp-meta.mjs`) so the CSP `<meta>` is the **first** node inside `<head>` in the exported HTML under `out/`. After changing CSP rules, confirm the built pages behave as expected.

## Static deploy and offline

- **Hosting:** `npm run build` produces a complete static site in **`out/`**. Deploy that folder to any static host or CDN (S3, GitHub Pages, Netlify “static”, etc.). No Node process is required at request time.
- **Caching:** Configure your host so **hashed** assets (`_next/static/...`) can be cached for a long time; keep **HTML** cache-busting or short TTL if you need users to pick up new deployments quickly.
- **Service worker:** The app registers `public/sw.js` to cache the shell and build assets so a reload can work when the network is unavailable, alongside normal HTTP caching.

Together, static files + CDN/browser cache + the service worker form the offline-oriented setup.

## Stack

- **Framework:** Next.js (App Router), **static export** (`output: 'export'`)
- **UI:** React, **Mantine**, **Tailwind CSS**
- **State:** **Valtio** (feature-scoped stores)
- **Logging:** **loglevel** (quiet by default)
- **Math:** **mathjs**
- **Clocks:** **react-clock**
- **Timer digits:** **@pqina/flip**
- **Tests:** **Jest** (+ **@swc/jest** / **ts-jest** as configured in the repo)
