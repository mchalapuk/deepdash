# World clock functionality removal
_Exported on 5/7/2026 at 07:45:56 GMT+2 from Cursor (3.2.16)_

---

**User**

Please completely remove the world clock functionality from the app.

---

**Cursor**

Got it. I’ll (1) locate every UI/component/store/export slice tied to the world clock, (2) remove the feature end-to-end (UI entry points, routes, state, persistence/export/import, tests), and (3) run lint/tests to ensure nothing still references it.

Nice — the world clock is pretty self-contained (`app/_stores/worldClockStore.ts`, `app/_components/WorldClocks.tsx`) plus hooks in `DashboardShell` and export/import via `lib/dataExport.ts`. Next I’ll read those files and remove the feature while keeping import backwards-compatible.

Next I’ll remove the `WorldClocks` header and the `worldClock` store, then update `lib/dataExport.ts` to bump the bundle version and migrate old v1 exports by simply dropping the world-clock slice (so older exports still import cleanly).

Now I’ll remove the world clock store/component files and then clean up persistence + export/import so old exports still import (we’ll just ignore the removed slice). After that, we’ll drop the now-unused dependencies and update tests.

### World clock removed (end-to-end)

- **UI removed**: Deleted `app/_components/WorldClocks.tsx` and removed it from `app/_components/DashboardShell.tsx` (no more header clocks).
- **State/persistence removed**: Deleted `app/_stores/worldClockStore.ts`, removed `WORLD_CLOCK_STORAGE_KEY` and its legacy migration from `lib/persistKeys.ts`.
- **Export/import kept backwards-compatible**:
  - Updated `lib/dataExport.ts` to **bundle version 2** and **drop the `worldClock` slice** entirely.
  - Imports still accept **bundle v1** files (including ones that contain `worldClock` / `worldClocks`) and just ignore that slice.
- **Demo seed updated**: Removed seeded clocks + updated seeded todo text in `lib/firstRunSeed.ts` (and its test).
- **Dependencies cleaned**: Removed `react-clock` and `tz-lookup`, removed `@import "react-clock/dist/Clock.css";` + related CSS from `app/globals.css`, deleted `lib/timezones.ts` and `types/tz-lookup.d.ts`, and updated `tsconfig.json`.
- **Docs updated**: Removed world clock mentions from `README.md`.

Build/tests/lint all pass now (`npm test`, `npm run lint`, `npm run build`).

---

**User**

@__tests__/smoke.test.ts is not needed any more. Can be completely removed.

---

**Cursor**

I’ll delete `__tests__/smoke.test.ts` and then re-run the Jest suite to ensure nothing else depended on it.

### Done

- Deleted `__tests__/smoke.test.ts`
- Confirmed tests still pass (`npm test`)

---

**User**

I added a logo at the top of the dashboard.

Now that there's much more space for everything, we need to create more seed data.

Seed tasks should be as follows:

Today's tasks:
- Star DeepDash on Github
- Play with the calculator
- Add tasks to this list
- Start working using Pomodoro
- Clear your inbox
- Write an entry in your journal

Backlog:
- Write an essay about AI

---

**Cursor**

Updating the first-run seed bundle with the new today and backlog tasks, then aligning tests.



Updating seed data and the test to match the new task copy and backlog.



Here’s what changed:

### `lib/firstRunSeed.ts`
- **Today** (`todosByDay[localDayKey()]`): six items in your order, with ids `seed-todo-1` … `seed-todo-6`.
- **Backlog**: one item — “Write an essay about AI” (`seed-backlog-1`).
- First task text is **“Star DeepDash on Github”** (matching your wording).

### `__tests__/firstRunSeed.test.ts`
- Expectations updated for the six today tasks and the backlog line.

`npm test` passes.

---

**User**

DY have any ideas for other tasks that could be in the initial backlog?

---

**Cursor**

Here are some backlog ideas that fit a “first day with DeepDash” vibe and stay generic (no heavy personal data):

- **Skim the import/export flow** — export a backup, then import it in a throwaway profile (or after clearing storage).
- **Pick one Pomodoro length** you’ll actually use and stick with it for a week.
- **Block 25 minutes** for one task with no tab switching.
- **Review yesterday’s work log** and note what dragged on.
- **Name one “deep work” block** on the calendar for tomorrow.
- **Unsubscribe or archive** three newsletters you never read.
- **Draft a short “definition of done”** for your current main project.
- **List three recurring chores** you could batch (errands, admin, email).
- **Try one calculator expression** you use in real life (tip split, unit conversion, quick estimate).

If you tell me your target audience (solo dev, students, managers), I can tighten the list to 5–8 lines that match that group.

---

**User**

Let's add:
- Unsubscribe from newsletters that are distracting you
- Add deep work slots for the week to your calendar
- Export DeepDash data and store it in your cloud

---

**Cursor**

Here’s what was updated:

### `lib/firstRunSeed.ts`
Backlog now has four items (after the essay):
1. Write an essay about AI *(unchanged)*  
2. Unsubscribe from newsletters that are distracting you — `seed-backlog-2`  
3. Add deep work slots for the week to your calendar — `seed-backlog-3`  
4. Export DeepDash data and store it in your cloud — `seed-backlog-4`

### `__tests__/firstRunSeed.test.ts`
Expectations updated for the full backlog list.

`jest __tests__/firstRunSeed.test.ts` passes.

---

**User**

We need two more. Give me more ideas.

---

**Cursor**

Here are backlog-style ideas in the same spirit as what you already have:

1. **Turn off non-essential notifications** for one work block each day (or for your whole work profile).
2. **Pick one “when I’m stuck” ritual** (5‑minute walk, single Pomodoro on a tiny subtask, rewrite the next step in one sentence).
3. **Write down your top 3 outcomes for the week** and put them somewhere you’ll see daily.
4. **Schedule a weekly review** (15–30 min): clear backlog, skim work log, adjust next week’s focus.
5. **Try import/export once** with a real backup filename and date in the name.
6. **Define “done” for your biggest in-progress task** in one line each for: scope, quality bar, who needs to know.
7. **Batch shallow work** (email, Slack, admin) into 1–2 fixed windows instead of all day.
8. **Name one thing you’ll stop doing this week** (a meeting, a habit, a tool tab) to protect focus.

If you tell me which **two** you want (or rephrase any of these), I can drop them into `firstRunSeed.ts` and the test for you.

---

**User**

Let's add:
- Do this one thing you've been putting off for a while

---

**Cursor**

Here’s what changed:

### `lib/firstRunSeed.ts`
- Appended backlog item **`seed-backlog-5`**: “Do this one thing you've been putting off for a while”.

### `__tests__/firstRunSeed.test.ts`
- Extended the expected backlog list with that line.

`jest __tests__/firstRunSeed.test.ts` passes.

---

**User**

We also need 10 more entries in the seed calculator history.

---

**Cursor**

I’ll add 10 more realistic calculator history rows in `buildFirstRunSeedBundle()` (unique ids, varied expressions/results), update the seed test to expect 20 history entries, and run the `firstRunSeed` Jest test to confirm it still migrates cleanly.

Added **10 more** seed calculator history entries (`seed-calc-h11` … `seed-calc-h20`) in `lib/firstRunSeed.ts` and updated `__tests__/firstRunSeed.test.ts` to expect **20** history items.

`npm test -- __tests__/firstRunSeed.test.ts` passes.

