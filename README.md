# DeepDash

> A local-only, privacy-oriented, feature-rich productivity dashboard.

🟢 **Live on [https://deepda.sh/](https://deepda.sh/) and free for everyone to use**.

## Features

- **World clocks** — Configurable analog clocks with IANA time zones and labels.
- **Pomodoro** — Work / short break / long break with configurable durations, daily work-time tracking, phase-colored backdrop, optional chime and desktop notifications.
- **Work Log** — Log of each pomodoro session and pauses in them; Total workd time calculation.
- **Calculator** — Single expression field; normalized parse and numeric result (evaluated on enter). Calculation history of 200 entries.
- **Daily TODO** — Checkbox list with keyboard-oriented editing; carrying incomplete items into a new day.
- **Import / Export** — Versioned JSON snapshot of dashboard data for backup and restore.

There is no server-side API: the app is built as static HTML, CSS, and JavaScript.

### 🔒 Data Privacy

All data is stored **locally** in the browser (`localStorage` and optional export files). The app doesn't have any backend components. No cookies. No trackers. Nothing is sent anywhere.

A restrictive CSP is intended to block cross-origin scripts, styles, fonts, and other loads except what the static app needs (including allowances required for Next.js hydration).

## Tech Stack

- **Framework:** Next.js (App Router), **static export** (`output: 'export'`)
- **UI:** React, **Mantine**, **Tailwind CSS**
- **State:** **Valtio** (feature-scoped stores)
- **Logging:** **loglevel** (quiet by default)
- **Math:** **mathjs**
- **Clocks:** **react-clock**
- **Timer digits:** **@pqina/flip**
- **Tests:** **Jest** (+ **@swc/jest** / **ts-jest** as configured in the repo)

### 💻 Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build` | Production build: static export to `out/`, then injects the Content-Security-Policy `<meta>` into the exported HTML |
| `npm run start` | Runs `next start` (see **Static deploy** below) |
| `npm run lint` | ESLint |
| `npm test` | Jest (import/export migrations and related unit tests) |
| `./deploy.sh` | Production build, then force-push `out/` to the remote **`pages`** branch (see **Deploy to `pages` branch** below) |

### Static deploy and offline work

- **Hosting:** `npm run build` produces a complete static site in **`out/`**. Deploy that folder to any static host or CDN (S3, GitHub Pages, Netlify “static”, etc.). No Node process is required at request time.
- **Caching:** Configure your host so **hashed** assets (`_next/static/...`) can be cached for a long time; keep **HTML** cache-busting or short TTL if you need users to pick up new deployments quickly.
- **Service worker:** The app registers `public/sw.js` to cache the shell and build assets so a reload can work when the network is unavailable, alongside normal HTTP caching.

Together, static files + CDN/browser cache + the service worker form the offline-oriented setup.

## 📃 License

All **source code** and **configuration** in this repository are licensed under the **[MIT License](LICENSE)**.

All **media** shipped with the app—**images**, **audio**, **video**, and comparable creative files (for example under `public/` or `app/fonts/`)—are licensed under **[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/)** (*Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International*). That is the **most restrictive** of the six standard Creative Commons public licenses: you may **redistribute** the material **with attribution**, but **not** use it for **commercial** purposes and **not** share **adapted** or **remixed** versions (no derivatives), except as allowed by law outside the license.

If a specific file or directory includes **its own** license or attribution (for example a bundled font or icon set from upstream), that notice takes precedence for **that** material.
