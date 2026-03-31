<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Deployment: static assets only

This app is **deployed as static files only** (e.g. Next.js **`output: 'export'`**). There is **no server-side runtime** for HTML requests: no API routes that execute on a Node server, no SSR-only data fetching at request time, and **no reliance on a dynamic server** to serve the UI. When adding features, assume **client-side execution** and **static hosting** (CDN, S3, GitHub Pages, etc.).

## No runtime network usage

Do **not** introduce **runtime** `fetch`/`XMLHttpRequest` to the public internet for **fonts**, **images**, telemetry, or other assets. Use **bundled** resources: `next/font/local` with files in the repo, **local images only**, and dependencies that do not pull from CDNs or remote APIs when the app runs. For **IANA timezone names**, use **`Intl.supportedValuesOf('timeZone')`** in supporting browsers (in-process API, not a network call); use a **small compiled fallback list** only if that API is unavailable in a target environment.

## Persisted data: import/export and schema tests

The app includes **versioned data export/import** (JSON). The **import path must remain backwards compatible** across schema changes.

**Whenever you change the export/import schema** (new fields, renames, key moves):

1. Bump the export **`version`** (or add a migration step).
2. Add a **new Jest unit test** that loads a **JSON fixture** from the **previous** version (or an explicit older shape), runs the import migration, and asserts the result matches the **current** in-memory/domain shape.

Keep historical fixtures under something like `__fixtures__/export-v{n}.json` so older formats stay covered.
