# App name change to deepdash
_Exported on 4/6/2026 at 00:31:41 GMT+2 from Cursor (2.6.21)_

---

**User**

We're changing the name of the app to deepdash. Please look in the code for name "worktools" and change it to "deepdash".

---

**Cursor**


Searching the codebase for "worktools" to identify occurrences to rename.




Renaming branding and identifiers to `deepdash` / `Deepdash`, adding a one-time localStorage migration from the legacy `worktools.*` keys so existing data is preserved, and updating docs that reference the old symbols.




Implementing renames: writing updated files.




Here’s what was renamed and what was added.

### Branding & package
- **`package.json` / `package-lock.json`**: `name` → `deepdash`
- **`app/layout.tsx`**: document title → **Deepdash**
- **`README.md`**: heading → **Deepdash**
- **`public/sw.js`**: cache name → `deepdash-v1` (forces a fresh cache after deploy)

### `localStorage` keys (`lib/persistKeys.ts`)
- All active keys now use the **`deepdash.`** prefix.
- **`migrateLegacyPersistKeysOnce()`** runs from each store’s `loadFromStorage`: copies from the old **`worktools.*`** keys into **`deepdash.*`** when the new key is missing, then **removes** the legacy keys. The substring `worktools` is **only** kept here (and in `__tests__/persistKeys.test.ts`) so existing installs keep their data.

### Export/import API (`lib/dataExport.ts`)
- Renamed to the Deepdash naming pattern, e.g. `CURRENT_DEEPDASH_EXPORT_VERSION`, `DeepdashExportLatest`, `collectDeepdashExport`, `downloadDeepdashJson`, `tryMigrateDeepdashBundle`, `runDeepdashJsonImportFromText`, `applyDeepdashImportWithRollback`, etc.
- Export download filename: **`deepdash-export-YYYY-MM-DD.json`**
- **JSON shape and bundle `version: 1` are unchanged**, so older export files still import.

### Call sites
- **`DataImportExport.tsx`**, all four **`app/_stores/*Store.ts`** (migration hook), **`AGENTS.md`**, **`STORE_STYLEGUIDE.md`**

### Tests
- **`__tests__/dataExport.test.ts`** updated for the new symbols.
- **`__tests__/persistKeys.test.ts`** added for legacy key migration.

`npm test` (14 tests) and `tsc --noEmit` both pass.

**Note:** `.cursor/plans/work_tools_dashboard_9a1d4215.plan.md` still mentions “Work Tools” / `worktools` paths; it’s an old plan file, not app code. Say if you want that updated too.

---

**User**

Please also mention somewhere at the top of the README that the app is deployed to https://deepda.sh/ and free for everyone to use.

---

**Cursor**


Update applied at the top of `README.md`, directly under the title: it links to https://deepda.sh/ and states the app is deployed there and free for everyone to use.

---

**User**

Great! Please also create a lincence file (MIT), mention the linence in README, and create deploy.sh script that builds the app and publishes the build to "pages" branch.

---

**Cursor**


Checking the build setup and README structure.




Adding MIT `LICENSE`, a `public/.nojekyll` file so GitHub Pages serves `_next` assets, updating the README, and creating `deploy.sh`.




Here’s what was added and updated:

### `LICENSE`
Standard MIT text with copyright line: **Copyright (c) 2026 Deepdash**. Change that line if you want a personal or org name.

### `public/.nojekyll`
Empty file so **GitHub Pages** doesn’t treat `_next` as Jekyll metadata and drop your assets.

### `README.md`
- **Scripts** table: `./deploy.sh` with a short description.
- **License**: points to [MIT](LICENSE).
- **Deploy to `pages` branch**: how to run `./deploy.sh`, what it does (build → temp repo → force-push `pages`), and `DEPLOY_REMOTE` / `DEPLOY_BRANCH`. Notes `.nojekyll` for GitHub Pages.

### `deploy.sh` (executable)
- `set -euo pipefail`, must be run from the repo root.
- Runs `npm run build`, checks that `out/` is non-empty.
- Copies `out/` to a temp dir, `git init`, commits on branch `pages` (default), force-pushes to `origin` as `HEAD:pages`.
- Override with `DEPLOY_REMOTE` and/or `DEPLOY_BRANCH` if needed.

**Note:** A force-push **rewrites** the remote `pages` branch history each time, which is normal for this style of deploy. If you want the copyright line to use your legal name instead of “Deepdash”, say what to put there and we can match it.

---

**User**

Please add more info about the licenses to the README.

All code and configuration -> MIT
All media (including images and audio) -> most restrictive CC

---

**Cursor**


Expanding the README's License section and scoping the MIT file so it clearly applies to code and configuration only.




Here’s what changed:

### `README.md` — **License**
- Explains that **npm dependencies** stay under their own licenses.
- **Code and configuration**: MIT, with concrete examples (TS/JS, CSS, `package.json`, `next.config.ts`, `deploy.sh`, CI, etc.).
- **Media** (images, audio, video, similar files, e.g. `public/`, `app/fonts/`): **[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/)**, described as the strictest of the six main CC public licenses (share with attribution only; no commercial use; no sharing adapted works), with a pointer to the legal text.
- **Exception**: if a file or folder has its own license (e.g. bundled fonts), that applies to that material.

### `LICENSE`
- Short note after the copyright line: MIT covers **code and configuration** only; **media** is covered in the README, so the MIT file and README stay aligned.

If you want a small `LICENSE-MEDIA` or `CC-BY-NC-ND.txt` in the repo as well, that can be added next.

