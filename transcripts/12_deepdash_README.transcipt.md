# README to-do implementation
_Exported on 4/4/2026 at 18:14:10 GMT+2 from Cursor (2.6.21)_

---

**User**

Implement the following to-dos from the plan (the plan is attached for your reference). Do NOT edit the plan file itself.

You have been assigned the following 1 to-do(s) with IDs: readme

1. [readme] README: static deploy, CSP note, features, todo debounced localStorage + flush on close, stack, offline (hosting+cache+SW) — no long per-tool docs

These to-dos have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the assigned to-dos.

---

**Cursor**


Implementing the README per the plan: checking `README.md`, `package.json`, and project setup.




Writing a concise README that matches the project and the plan.




Here is what changed in **`README.md`**:

### Contents added (per Task 8 / your brief)

1. **What it is** — Short product description and “local-only” framing.  
2. **Prerequisites** — Node + npm.  
3. **Scripts** — Table for `dev`, `build`, `start`, `lint`, `test`, with **`build`** described as static export to `out/` plus CSP injection.  
4. **Features** — High-level bullets (pomodoro, clocks, calculator, todo, import/export), no long how-tos.  
5. **Data** — Local-only storage; **todo** uses **debounced** `localStorage` with **flush on close**; other slices **immediate** saves.  
6. **CSP** — Dev vs prod (`inject-csp-meta.mjs`, first `<meta>` in `<head>`), and a note to verify after changes.  
7. **Static deploy & offline** — Deploy `out/`; long-cache hashed assets vs HTML; **`public/sw.js`** registration for offline reload; hosting + cache + SW called out as the three layers.  
8. **Stack** — Next (static export), React, Mantine, Tailwind, Valtio, loglevel, mathjs, react-clock, **@pqina/flip**, Jest.

The plan file was not modified. The **readme** todo is marked **completed**.

