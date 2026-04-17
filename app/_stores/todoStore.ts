import { proxy, useSnapshot } from "valtio";

import { localDayKey } from "@/app/_stores/pomodoroStore";
import log from "@/lib/logger";
import {
  migrateLegacyPersistKeysOnce,
  TODO_BACKLOG_STORAGE_KEY,
  TODO_DAY_STORAGE_KEY_PREFIX,
} from "@/lib/persistKeys";
import {
  applyTodoTaskWrites,
  collectTodoTasksForExport,
  getSortedTodoItemsForDay,
  migrateLegacyTodoLocalStorageToIndexedDb,
  replaceAllTodoTasksFromImport,
  rolloverIncompleteVisibleTasksFromDayToDay,
  TODO_IDB_BACKLOG_DAY,
  type TodoItemWithRank,
  type TodoTaskRecordInput,
} from "@/lib/todoIndexedDb";

const DAY_CHECK_INTERVAL_MS = 1000;
const TEXT_PERSIST_DEBOUNCE_MS = 1000;

/** Chains IndexedDB writes so `flushTodoPersistToStorage` can await completion. */
let persistTail: Promise<void> = Promise.resolve();

/** Latest `loadFromStorageAsync` invocation (for tests). */
let lastTodoLoadPromise: Promise<void> = Promise.resolve();

const todoStore = proxy({
  /**
   * When false, subscribe must not write to localStorage until `loadFromStorage()` finishes —
   * defaults in memory would overwrite the user’s saved data before load completes.
   */
  hydrated: false,
  /** Local calendar-day key for the bucket currently loaded into `items`. */
  dayKey: "" as string,
  /** Tasks in the “Today’s tasks” list for {@link dayKey} (rollover appends here). */
  items: [] as TodoItem[],
  /** Global backlog — not tied to a calendar day. */
  backlogItems: [] as TodoItem[],
});

/** JSON shape for one calendar day (no `rank`; ordering is array order). */
export type TodoDayDocumentV3 = {
  items: TodoItemPublic[];
};

/** @deprecated Import migration only; per-day backlog lived here before v3. */
export type TodoDayDocumentV2 = {
  items: TodoItemPublic[];
  backlogItems: TodoItemPublic[];
};

/** @deprecated Import migration only. */
export type TodoDayDocumentV1 = {
  items: TodoItemPublic[];
};

/** JSON / export row (matches on-disk bundle; no fractional `rank`). */
export type TodoItemPublic = { id: string; text: string; done: boolean };

/** Live list row: includes persisted `rank` from IndexedDB. */
export type TodoItem = TodoItemWithRank;

export const TODO_EXPORT_VERSION = 3 as const;

export type TodoExportV3 = {
  version: typeof TODO_EXPORT_VERSION;
  todosByDay: Record<string, TodoDayDocumentV3>;
  backlogItems: TodoItemPublic[];
};

/** @deprecated Use {@link TodoExportV3}. */
export type TodoExportV2 = {
  version: 2;
  todosByDay: Record<string, TodoDayDocumentV2>;
};

/** @deprecated Use {@link TodoExportV3}. */
export type TodoExportV1 = {
  version: 1;
  todosByDay: Record<string, TodoDayDocumentV1>;
};

export type TodoListKind = "today" | "backlog";

export function useTodoList(): {
  hydrated: boolean;
  items: readonly TodoItem[];
  backlogItems: readonly TodoItem[];
} {
  const snap = useSnapshot(todoStore);
  return {
    hydrated: snap.hydrated,
    items: snap.items,
    backlogItems: snap.backlogItems,
  };
}

export const todoActions = {
  init: function init(): () => void {
    lastTodoLoadPromise = loadFromStorageAsync();
    void lastTodoLoadPromise;

    const flush = (): void => {
      void flushTodoPersistToStorage();
    };

    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") flush();
      else void syncCalendarDayIfNeededAsync();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", flush);
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", onVisibility);
    }

    const dayTimer =
      typeof window !== "undefined"
        ? window.setInterval(() => {
            void syncCalendarDayIfNeededAsync();
          }, DAY_CHECK_INTERVAL_MS)
        : null;

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", flush);
        window.removeEventListener("pagehide", flush);
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (dayTimer != null) window.clearInterval(dayTimer);
      void flushTodoPersistToStorage();
    };
  },

  setItemText: function setItemText(id: string, text: string): void {
    const loc = findItemLocation(id);
    if (!loc) return;
    itemsForList(loc.kind)[loc.index].text = text;
    scheduleDebouncedTextPersist(id);
  },

  toggleDone: function toggleDone(id: string): void {
    const loc = findItemLocation(id);
    if (!loc) return;
    const row = itemsForList(loc.kind)[loc.index];
    row.done = !row.done;
    enqueueTodoPersist([id]);
  },

  addItem: function addItem(text: string, done = false, list: TodoListKind = "today"): string {
    const id = crypto.randomUUID();
    const arr = itemsForList(list);
    const rank = appendRankForList(arr);
    arr.push({ id, text, done, rank });
    enqueueTodoPersist([id]);
    return id;
  },

  insertEmptyAt: function insertEmptyAt(index: number, list: TodoListKind = "today"): string {
    const id = crypto.randomUUID();
    const arr = itemsForList(list);
    const clamped = Math.max(0, Math.min(index, arr.length));
    const prev = clamped > 0 ? arr[clamped - 1] : undefined;
    const next = clamped < arr.length ? arr[clamped] : undefined;
    let rank: number;
    if (!prev && !next) rank = 0;
    else if (!prev) rank = next ? next.rank / 2 : 0;
    else if (!next) rank = prev.rank + 1000;
    else rank = (prev.rank + next.rank) / 2;
    arr.splice(clamped, 0, { id, text: "", done: false, rank });
    enqueueTodoPersist([id]);
    return id;
  },

  splitItemAt: function splitItemAt(id: string, caret: number): string | null {
    const loc = findItemLocation(id);
    if (!loc) return null;
    const arr = itemsForList(loc.kind);
    const i = loc.index;
    const t = arr[i].text;
    if (caret <= 0 || caret >= t.length) return null;
    const left = t.slice(0, caret);
    const right = t.slice(caret);
    const row = arr[i];
    const leftRank = row.rank;
    const oldNext = arr[i + 1];
    const rRank = !oldNext ? leftRank + 1000 : (leftRank + oldNext.rank) / 2;
    arr[i] = { ...row, text: left };
    const newId = crypto.randomUUID();
    arr.splice(i + 1, 0, { id: newId, text: right, done: false, rank: rRank });
    enqueueTodoPersist([id, newId]);
    return newId;
  },

  mergeWithNext: function mergeWithNext(id: string): void {
    const loc = findItemLocation(id);
    if (!loc) return;
    const arr = itemsForList(loc.kind);
    const i = loc.index;
    if (i < 0 || i >= arr.length - 1) return;
    const cur = arr[i];
    const next = arr[i + 1];
    const nextId = next.id;
    const merged = `${cur.text} ${next.text}`;
    const mergedDone = cur.done;
    const mergedId = cur.id;
    arr.splice(i, 2, {
      id: cur.id,
      text: merged,
      done: mergedDone,
      rank: cur.rank,
    });
    enqueueTodoPersist([mergedId], [nextId]);
  },

  mergeWithPrev: function mergeWithPrev(id: string): void {
    const loc = findItemLocation(id);
    if (!loc) return;
    const arr = itemsForList(loc.kind);
    const i = loc.index;
    if (i <= 0) return;
    const prev = arr[i - 1];
    const cur = arr[i];
    const curId = cur.id;
    const merged = `${prev.text} ${cur.text}`;
    const mergedDone = prev.done && cur.done;
    const mergedId = prev.id;
    arr.splice(i - 1, 2, {
      id: prev.id,
      text: merged,
      done: mergedDone,
      rank: prev.rank,
    });
    enqueueTodoPersist([mergedId], [curId]);
  },

  removeItem: function removeItem(id: string): void {
    const loc = findItemLocation(id);
    if (!loc) return;
    itemsForList(loc.kind).splice(loc.index, 1);
    enqueueTodoPersist([], [id]);
  },

  /** Removes a row if it still exists and its text is empty/whitespace (e.g. after blur). */
  removeItemIfEmpty: function removeItemIfEmpty(id: string): void {
    const loc = findItemLocation(id);
    if (!loc) return;
    const arr = itemsForList(loc.kind);
    if (arr[loc.index].text.trim() !== "") return;
    arr.splice(loc.index, 1);
    enqueueTodoPersist([], [id]);
  },

  /** Swaps the item with its neighbor in the given direction (pointer-driven reorder). */
  moveItemRelative: function moveItemRelative(id: string, delta: -1 | 1): void {
    const loc = findItemLocation(id);
    if (!loc) return;
    const arr = itemsForList(loc.kind);
    const from = loc.index;
    const to = from + delta;
    if (to < 0 || to >= arr.length) return;
    const itemA = arr[from]!;
    const itemB = arr[to]!;
    const ar = itemA.rank;
    const br = itemB.rank;
    itemA.rank = br;
    itemB.rank = ar;
    const [row] = arr.splice(from, 1);
    arr.splice(to, 0, row);
    enqueueTodoPersist([itemA.id, itemB.id]);
  },

  /** Moves a task from Today to Backlog (top of backlog list). */
  moveItemToBacklog: function moveItemToBacklog(id: string): void {
    const loc = findItemLocation(id);
    if (!loc || loc.kind !== "today") return;
    const [row] = todoStore.items.splice(loc.index, 1);
    const rank = unshiftRankForList(todoStore.backlogItems);
    todoStore.backlogItems.unshift({ ...row, rank });
    enqueueTodoPersist([row.id]);
  },

  /** Moves a task from Backlog to Today (top of today’s list). */
  moveItemToToday: function moveItemToToday(id: string): void {
    const loc = findItemLocation(id);
    if (!loc || loc.kind !== "backlog") return;
    const [row] = todoStore.backlogItems.splice(loc.index, 1);
    const rank = unshiftRankForList(todoStore.items);
    todoStore.items.unshift({ ...row, rank });
    enqueueTodoPersist([row.id]);
  },

  exportData: async function exportData(): Promise<TodoExportV3> {
    const buckets = await collectTodoTasksForExport();
    return {
      version: TODO_EXPORT_VERSION,
      todosByDay: buckets.todosByDay,
      backlogItems: buckets.backlogItems,
    };
  },

  /**
   * Replaces all todo day buckets and global backlog. Does not run auto-rollover side effects.
   * Accepts `{ version, todosByDay, backlogItems }` or legacy shapes (rollover markers in old files are ignored).
   */
  importData: async function importData(data: unknown): Promise<void> {
    const slice = migrateTodoSliceToLatest(data);
    if (typeof window === "undefined") return;
    await flushTodoPersistToStorage();
    await clearTodoRelatedStorageKeysAsync();

    const todosByDay: Record<string, TodoDayDocumentV3> = {};
    for (const [day, doc] of Object.entries(slice.todosByDay)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      todosByDay[day] = {
        items: doc.items.map((t) => ({ id: t.id, text: t.text, done: t.done })),
      };
    }
    const backlogRows = omitEmptyBacklogItems(
      slice.backlogItems.map((t) => ({ id: t.id, text: t.text, done: t.done })),
    );
    await replaceAllTodoTasksFromImport({ todosByDay, backlogItems: backlogRows });

    const today = localDayKey();
    todoStore.backlogItems = await getSortedTodoItemsForDay(TODO_IDB_BACKLOG_DAY);
    applyLoadedDay(today, { items: await getSortedTodoItemsForDay(today) });
  },
};

// --- domain helpers ---

function itemsForList(kind: TodoListKind): TodoItem[] {
  return kind === "today" ? todoStore.items : todoStore.backlogItems;
}

function findItemLocation(id: string): { kind: TodoListKind; index: number } | null {
  const ti = todoStore.items.findIndex((x) => x.id === id);
  if (ti >= 0) return { kind: "today", index: ti };
  const bi = todoStore.backlogItems.findIndex((x) => x.id === id);
  if (bi >= 0) return { kind: "backlog", index: bi };
  return null;
}

function previousLocalDayKey(d = new Date()): string {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  return localDayKey(x);
}

// --- persistence ---

let textDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let textDebounceTaskId: string | null = null;

/**
 * Flush pending debounced text, then write tasks to IndexedDB from current store state.
 * @param writeIds - Rows to upsert (omit or pass `[]` for delete-only).
 * @param deleteIds - Row ids to remove from IndexedDB (already dropped or merged out in the UI).
 */
function enqueueTodoPersist(writeIds: string[], deleteIds: readonly string[] = []): void {
  persistTail = persistTail
    .then(() => flushPendingTextDebounced())
    .then(async () => {
      if (deleteIds.length === 0 && writeIds.length === 1) {
        await persistTaskById(writeIds[0]!);
        return;
      }
      await applyTodoTaskWrites({
        deleteIds: [...deleteIds],
        putRecords: recordsForTaskIds(writeIds),
      });
    })
    .catch((e: unknown) => {
      log.warn("todo: IndexedDB persist failed", e);
    });
}

/** Debounced text sync; switching tasks flushes the previous id onto {@link persistTail} immediately. */
function scheduleDebouncedTextPersist(id: string): void {
  if (textDebounceTaskId !== null && textDebounceTaskId !== id) {
    if (textDebounceTimer !== null) {
      clearTimeout(textDebounceTimer);
      textDebounceTimer = null;
    }
    const prevId = textDebounceTaskId;
    textDebounceTaskId = null;
    persistTail = persistTail.then(() => persistTaskById(prevId)).catch((e: unknown) => {
      log.warn("todo: IndexedDB persist failed", e);
    });
  }
  textDebounceTaskId = id;
  if (textDebounceTimer !== null) {
    clearTimeout(textDebounceTimer);
  }
  textDebounceTimer = setTimeout(() => {
    textDebounceTimer = null;
    const tid = textDebounceTaskId;
    textDebounceTaskId = null;
    if (tid) {
      persistTail = persistTail.then(() => persistTaskById(tid)).catch((e: unknown) => {
        log.warn("todo: IndexedDB persist failed", e);
      });
    }
  }, TEXT_PERSIST_DEBOUNCE_MS);
}

async function flushPendingTextDebounced(): Promise<void> {
  if (textDebounceTimer !== null) {
    clearTimeout(textDebounceTimer);
    textDebounceTimer = null;
  }
  const id = textDebounceTaskId;
  textDebounceTaskId = null;
  if (id) {
    await persistTaskById(id);
  }
}

async function persistTaskById(id: string): Promise<void> {
  const loc = findItemLocation(id);
  if (!loc) return;
  const row = itemsForList(loc.kind)[loc.index];
  const day = loc.kind === "today" ? todoStore.dayKey : TODO_IDB_BACKLOG_DAY;
  await applyTodoTaskWrites({
    putRecords: [{ id, day, text: row.text, done: row.done, rank: row.rank }],
  });
}

function recordsForTaskIds(ids: readonly string[]): TodoTaskRecordInput[] {
  const out: TodoTaskRecordInput[] = [];
  for (const id of ids) {
    const loc = findItemLocation(id);
    if (!loc) continue;
    const row = itemsForList(loc.kind)[loc.index];
    const day = loc.kind === "today" ? todoStore.dayKey : TODO_IDB_BACKLOG_DAY;
    out.push({ id, day, text: row.text, done: row.done, rank: row.rank });
  }
  return out;
}

function dayStorageKey(dayKey: string): string {
  return `${TODO_DAY_STORAGE_KEY_PREFIX}${dayKey}`;
}

function applyLoadedDay(dayKey: string, doc: { items: TodoItem[] }): void {
  todoStore.dayKey = dayKey;
  todoStore.items = doc.items;
}

function isTodoItemJson(x: unknown): x is TodoItemPublic {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.text === "string" &&
    typeof o.done === "boolean"
  );
}

/** Drops persisted rows with no visible text (empty or whitespace-only). */
function todoRowHasVisibleText(t: TodoItemPublic): boolean {
  return t.text.trim() !== "";
}

function omitEmptyTodoDayItems(doc: TodoDayDocumentV3): TodoDayDocumentV3 {
  return {
    items: doc.items.filter(todoRowHasVisibleText),
  };
}

/** Same normalization as {@link omitEmptyTodoDayItems} for global backlog lists. */
function omitEmptyBacklogItems(items: TodoItemPublic[]): TodoItemPublic[] {
  return items.filter(todoRowHasVisibleText);
}

function appendRankForList(items: readonly TodoItem[]): number {
  const last = items[items.length - 1];
  return last ? last.rank + 1000 : 0;
}

function unshiftRankForList(items: readonly TodoItem[]): number {
  const first = items[0];
  return items.length ? first.rank - 1000 : 0;
}

function parseTodoDayDocumentV3(raw: unknown): TodoDayDocumentV3 {
  if (!raw || typeof raw !== "object") return { items: [] };
  const o = raw as Record<string, unknown>;
  const items = Array.isArray(o.items) ? o.items.filter(isTodoItemJson) : [];
  return omitEmptyTodoDayItems({ items });
}

/** Reads legacy per-day docs that may still include `backlogItems` (stripped by migration). */
function parseTodoDayDocumentV2(raw: unknown): TodoDayDocumentV2 {
  if (!raw || typeof raw !== "object") return { items: [], backlogItems: [] };
  const o = raw as Record<string, unknown>;
  const items = Array.isArray(o.items) ? o.items.filter(isTodoItemJson) : [];
  const backlogItems = Array.isArray(o.backlogItems) ? o.backlogItems.filter(isTodoItemJson) : [];
  return {
    items: items.filter(todoRowHasVisibleText),
    backlogItems: omitEmptyBacklogItems(backlogItems),
  };
}

function storageSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e: unknown) {
    log.warn("todo: localStorage setItem failed", key, e);
  }
}

function storageSetItemStrict(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`todo: could not write ${key} (${detail})`);
  }
}

/**
 * Merges `backlogItems` from every per-day JSON blob into {@link TODO_BACKLOG_STORAGE_KEY} and
 * rewrites day files to `{ items }` only (v3). Idempotent.
 */
function migrateLocalStoragePerDayBacklogToGlobal(): void {
  if (typeof window === "undefined") return;
  const seen = new Set<string>();
  const merged: TodoItemPublic[] = [];

  for (const t of readValidatedGlobalBacklogItems()) {
    merged.push({ id: t.id, text: t.text, done: t.done });
    seen.add(t.id);
  }

  const dayKeys = listLocalStorageKeys()
    .filter((k) => k.startsWith(TODO_DAY_STORAGE_KEY_PREFIX))
    .map((k) => k.slice(TODO_DAY_STORAGE_KEY_PREFIX.length))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  for (const day of dayKeys) {
    const key = dayStorageKey(day);
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const o = parsed as Record<string, unknown>;
    const backlogRaw = o.backlogItems;
    const backlogArr = Array.isArray(backlogRaw) ? backlogRaw.filter(isTodoItemJson) : [];
    for (const t of backlogArr) {
      if (!todoRowHasVisibleText(t)) continue;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push({ id: t.id, text: t.text, done: t.done });
    }
    const itemsOnly = parseTodoDayDocumentV3(parsed).items;
    const newDoc: TodoDayDocumentV3 = { items: itemsOnly };
    const newJson = JSON.stringify(newDoc);
    if (newJson !== raw || "backlogItems" in o) {
      storageSetItem(key, newJson);
    }
  }

  storageSetItem(
    TODO_BACKLOG_STORAGE_KEY,
    JSON.stringify({
      backlogItems: merged.map((t) => ({ id: t.id, text: t.text, done: t.done })),
    }),
  );
}

function readValidatedGlobalBacklogItems(): TodoItemPublic[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TODO_BACKLOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return omitEmptyBacklogItems(parsed.filter(isTodoItemJson));
    }
    if (parsed && typeof parsed === "object" && "backlogItems" in parsed) {
      const a = (parsed as { backlogItems: unknown }).backlogItems;
      return Array.isArray(a) ? omitEmptyBacklogItems(a.filter(isTodoItemJson)) : [];
    }
  } catch (e: unknown) {
    log.warn("todo: parse global backlog failed", e);
  }
  return [];
}

/**
 * Move every non-empty incomplete task from the previous calendar day’s list into today by updating
 * each row’s `day` and `rank` in IndexedDB — same task ids, no duplicate rows.
 */
async function moveAllPendingIntoTodayAsync(): Promise<void> {
  if (typeof window === "undefined") return;
  const today = todoStore.dayKey;
  const yKey = previousLocalDayKey();

  await rolloverIncompleteVisibleTasksFromDayToDay(yKey, today);
  applyLoadedDay(today, { items: await getSortedTodoItemsForDay(today) });
}

async function loadFromStorageAsync(): Promise<void> {
  if (typeof window === "undefined") return;
  migrateLegacyPersistKeysOnce();
  migrateLocalStoragePerDayBacklogToGlobal();
  try {
    await migrateLegacyTodoLocalStorageToIndexedDb();
  } catch (e: unknown) {
    log.error("todo: IndexedDB open/migrate failed", e);
  }

  const today = localDayKey();
  const emptyDay: { items: TodoItem[] } = { items: [] };
  try {
    todoStore.backlogItems = await getSortedTodoItemsForDay(TODO_IDB_BACKLOG_DAY);
    applyLoadedDay(today, { items: await getSortedTodoItemsForDay(today) });
    await moveAllPendingIntoTodayAsync();
  } catch (e: unknown) {
    log.error("todo: failed to load today’s list", e);
    todoStore.backlogItems = [];
    applyLoadedDay(today, emptyDay);
    await moveAllPendingIntoTodayAsync();
  }
  todoStore.hydrated = true;
}

async function syncCalendarDayIfNeededAsync(): Promise<void> {
  if (!todoStore.hydrated) return;
  const today = localDayKey();
  if (todoStore.dayKey === today) return;
  await flushTodoPersistToStorage();
  applyLoadedDay(today, { items: await getSortedTodoItemsForDay(today) });
  await moveAllPendingIntoTodayAsync();
}

// --- bundle export/import (uses persistence helpers above) ---

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function listLocalStorageKeys(): string[] {
  if (typeof localStorage === "undefined") return [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) keys.push(k);
  }
  return keys;
}

function parseTodosByDayRecordV2(raw: unknown): Record<string, TodoDayDocumentV2> {
  if (!isRecord(raw)) return {};
  const out: Record<string, TodoDayDocumentV2> = {};
  for (const [day, doc] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    out[day] = parseTodoDayDocumentV2(doc);
  }
  return out;
}

function stripV2DaysToV3(byDay: Record<string, TodoDayDocumentV2>): Record<string, TodoDayDocumentV3> {
  const out: Record<string, TodoDayDocumentV3> = {};
  for (const [day, doc] of Object.entries(byDay)) {
    out[day] = { items: doc.items.map((t) => ({ id: t.id, text: t.text, done: t.done })) };
  }
  return out;
}

/** Per-day backlog rows in calendar-day order; skips duplicate ids (later wins ignored). */
function mergePerDayBacklogsFromV2(byDay: Record<string, TodoDayDocumentV2>): TodoItemPublic[] {
  const seen = new Set<string>();
  const out: TodoItemPublic[] = [];
  const days = Object.keys(byDay)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  for (const day of days) {
    for (const t of byDay[day]!.backlogItems) {
      if (!todoRowHasVisibleText(t)) continue;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push({ id: t.id, text: t.text, done: t.done });
    }
  }
  return out;
}

function parseTopLevelBacklog(raw: unknown): TodoItemPublic[] {
  if (!Array.isArray(raw)) return [];
  return omitEmptyBacklogItems(raw.filter(isTodoItemJson));
}

/** Top-level backlog first, then per-day rows, deduping by id. */
function mergeTopAndPerDayBacklogs(top: TodoItemPublic[], fromDays: TodoItemPublic[]): TodoItemPublic[] {
  const seen = new Set<string>();
  const out: TodoItemPublic[] = [];
  for (const t of top) {
    if (!todoRowHasVisibleText(t)) continue;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push({ id: t.id, text: t.text, done: t.done });
  }
  for (const t of fromDays) {
    if (!todoRowHasVisibleText(t)) continue;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push({ id: t.id, text: t.text, done: t.done });
  }
  return out;
}

/** Normalize any supported todo import slice to {@link TodoExportV3}. */
export function migrateTodoSliceToLatest(data: unknown): TodoExportV3 {
  log.debug("todo migration: start");
  if (!isRecord(data)) {
    log.error("todo migration: not an object");
    throw new Error("todo: import slice is not an object.");
  }
  const v = data.version;
  log.debug("todo migration: shape", {
    version: v,
    todosByDayKeys: data.todosByDay != null && isRecord(data.todosByDay) ? Object.keys(data.todosByDay).length : 0,
  });
  if (v !== undefined && v !== 1 && v !== 2 && v !== TODO_EXPORT_VERSION) {
    log.error("todo migration: unsupported version", { version: v });
    throw new Error(
      `todo: unsupported export slice version ${String(v)}. Update the app or re-export your data.`,
    );
  }

  const todosByDayV2 = parseTodosByDayRecordV2(data.todosByDay);
  const fromDaysMerged = mergePerDayBacklogsFromV2(todosByDayV2);
  const todosByDay = stripV2DaysToV3(todosByDayV2);

  const topMerged = Array.isArray(data.backlogItems) ? parseTopLevelBacklog(data.backlogItems) : [];
  const backlogItems = mergeTopAndPerDayBacklogs(topMerged, fromDaysMerged);

  let itemCount = 0;
  for (const doc of Object.values(todosByDay)) {
    itemCount += doc.items.length;
  }
  itemCount += backlogItems.length;

  log.debug("todo migration: ok", {
    dayCount: Object.keys(todosByDay).length,
    itemCount,
  });
  return {
    version: TODO_EXPORT_VERSION,
    todosByDay,
    backlogItems,
  };
}

async function clearTodoRelatedStorageKeysAsync(): Promise<void> {
  const toRemove: string[] = [];
  for (const key of listLocalStorageKeys()) {
    if (key.startsWith(TODO_DAY_STORAGE_KEY_PREFIX) || key === TODO_BACKLOG_STORAGE_KEY) {
      toRemove.push(key);
    }
  }
  for (const k of toRemove) {
    try {
      localStorage.removeItem(k);
    } catch (e: unknown) {
      log.warn("todo: remove key during import failed", k, e);
    }
  }
}

/** Await pending per-task IndexedDB writes. Use before export/download. */
export async function flushTodoPersistToStorage(): Promise<void> {
  await flushPendingTextDebounced();
  await persistTail;
}

/** @internal Wait for the initial IndexedDB load started by {@link todoActions.init}. */
export async function __awaitTodoStoreHydrationForTests(): Promise<void> {
  await lastTodoLoadPromise;
}
