import { proxy, useSnapshot } from "valtio";
import { subscribe } from "valtio/vanilla";

import { localDayKey } from "@/app/_stores/pomodoroStore";
import log from "@/lib/logger";
import {
  migrateLegacyPersistKeysOnce,
  TODO_AUTO_ROLLOVER_MARKER_PREFIX,
  TODO_BACKLOG_STORAGE_KEY,
  TODO_DAY_STORAGE_KEY_PREFIX,
} from "@/lib/persistKeys";

const DEBOUNCE_MS = 400;
const DAY_CHECK_INTERVAL_MS = 1000;

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

/** Persisted JSON for one calendar day: today list only. */
export type TodoDayDocumentV3 = {
  items: TodoItem[];
};

/** @deprecated Import migration only; per-day backlog lived here before v3. */
export type TodoDayDocumentV2 = {
  items: TodoItem[];
  backlogItems: TodoItem[];
};

/** @deprecated Import migration only. */
export type TodoDayDocumentV1 = {
  items: TodoItem[];
};

export type TodoItem = {
  id: string;
  text: string;
  done: boolean;
};

export const TODO_EXPORT_VERSION = 3 as const;

export type TodoExportV3 = {
  version: typeof TODO_EXPORT_VERSION;
  todosByDay: Record<string, TodoDayDocumentV3>;
  backlogItems: TodoItem[];
  todoRolloverMarkers: Record<string, string>;
};

/** @deprecated Use {@link TodoExportV3}. */
export type TodoExportV2 = {
  version: 2;
  todosByDay: Record<string, TodoDayDocumentV2>;
  todoRolloverMarkers: Record<string, string>;
};

/** @deprecated Use {@link TodoExportV3}. */
export type TodoExportV1 = {
  version: 1;
  todosByDay: Record<string, TodoDayDocumentV1>;
  todoRolloverMarkers: Record<string, string>;
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
    loadFromStorage();
    const unsub = subscribe(todoStore, () => {
      if (!todoStore.hydrated) return;
      schedulePersistDebounced();
    });

    const flush = (): void => {
      flushPersistSync();
    };

    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") flush();
      else syncCalendarDayIfNeeded();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", flush);
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", onVisibility);
    }

    const dayTimer =
      typeof window !== "undefined"
        ? window.setInterval(() => {
            syncCalendarDayIfNeeded();
          }, DAY_CHECK_INTERVAL_MS)
        : null;

    return () => {
      unsub();
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", flush);
        window.removeEventListener("pagehide", flush);
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (dayTimer != null) window.clearInterval(dayTimer);
      clearDebounceTimer();
      flushPersistSync();
    };
  },

  setItemText: function setItemText(id: string, text: string): void {
    const loc = findItemLocation(id);
    if (!loc) return;
    itemsForList(loc.kind)[loc.index].text = text;
  },

  toggleDone: function toggleDone(id: string): void {
    const loc = findItemLocation(id);
    if (!loc) return;
    const row = itemsForList(loc.kind)[loc.index];
    row.done = !row.done;
  },

  addItem: function addItem(text: string, done = false, list: TodoListKind = "today"): string {
    const id = crypto.randomUUID();
    itemsForList(list).push({ id, text, done });
    return id;
  },

  insertEmptyAt: function insertEmptyAt(index: number, list: TodoListKind = "today"): string {
    const id = crypto.randomUUID();
    const arr = itemsForList(list);
    const clamped = Math.max(0, Math.min(index, arr.length));
    arr.splice(clamped, 0, { id, text: "", done: false });
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
    arr[i] = { ...row, text: left };
    const newId = crypto.randomUUID();
    arr.splice(i + 1, 0, { id: newId, text: right, done: false });
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
    const merged = `${cur.text} ${next.text}`;
    arr.splice(i, 2, {
      id: cur.id,
      text: merged,
      done: cur.done,
    });
  },

  mergeWithPrev: function mergeWithPrev(id: string): void {
    const loc = findItemLocation(id);
    if (!loc) return;
    const arr = itemsForList(loc.kind);
    const i = loc.index;
    if (i <= 0) return;
    const prev = arr[i - 1];
    const cur = arr[i];
    const merged = `${prev.text} ${cur.text}`;
    arr.splice(i - 1, 2, {
      id: prev.id,
      text: merged,
      done: prev.done && cur.done,
    });
  },

  removeItem: function removeItem(id: string): void {
    const loc = findItemLocation(id);
    if (!loc) return;
    itemsForList(loc.kind).splice(loc.index, 1);
  },

  /** Removes a row if it still exists and its text is empty/whitespace (e.g. after blur). */
  removeItemIfEmpty: function removeItemIfEmpty(id: string): void {
    const loc = findItemLocation(id);
    if (!loc) return;
    const arr = itemsForList(loc.kind);
    if (arr[loc.index].text.trim() !== "") return;
    arr.splice(loc.index, 1);
  },

  /** Swaps the item with its neighbor in the given direction (pointer-driven reorder). */
  moveItemRelative: function moveItemRelative(id: string, delta: -1 | 1): void {
    const loc = findItemLocation(id);
    if (!loc) return;
    const arr = itemsForList(loc.kind);
    const from = loc.index;
    const to = from + delta;
    if (to < 0 || to >= arr.length) return;
    const [row] = arr.splice(from, 1);
    arr.splice(to, 0, row);
  },

  /** Moves a task from Today to Backlog (top of backlog list). */
  moveItemToBacklog: function moveItemToBacklog(id: string): void {
    const loc = findItemLocation(id);
    if (!loc || loc.kind !== "today") return;
    const [row] = todoStore.items.splice(loc.index, 1);
    todoStore.backlogItems.unshift(row);
  },

  /** Moves a task from Backlog to Today (top of today’s list). */
  moveItemToToday: function moveItemToToday(id: string): void {
    const loc = findItemLocation(id);
    if (!loc || loc.kind !== "backlog") return;
    const [row] = todoStore.backlogItems.splice(loc.index, 1);
    todoStore.items.unshift(row);
  },

  exportData: function exportData(): TodoExportV3 {
    return collectTodoExportFromLocalStorage();
  },

  /**
   * Replaces all todo day buckets, global backlog, and rollover markers. Does not run auto-rollover side effects.
   * Accepts `{ version, todosByDay, backlogItems, todoRolloverMarkers }` or legacy shapes.
   */
  importData: function importData(data: unknown): void {
    const slice = migrateTodoSliceToLatest(data);
    if (typeof window === "undefined") return;
    clearDebounceTimer();
    clearTodoRelatedStorageKeys();
    for (const [day, doc] of Object.entries(slice.todosByDay)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      storageSetItemStrict(dayStorageKey(day), JSON.stringify(doc));
    }
    const backlogRows = omitEmptyBacklogItems(
      slice.backlogItems.map((t) => ({ id: t.id, text: t.text, done: t.done })),
    );
    storageSetItemStrict(TODO_BACKLOG_STORAGE_KEY, JSON.stringify({ backlogItems: backlogRows }));
    for (const [yKey, todayKey] of Object.entries(slice.todoRolloverMarkers)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(yKey)) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) continue;
      storageSetItemStrict(autoRolloverMarkerKey(yKey), todayKey);
    }
    const today = localDayKey();
    todoStore.backlogItems = backlogRows.map((t) => ({ id: t.id, text: t.text, done: t.done }));
    applyLoadedDay(today, readValidatedDayDocument(today));
    lastWrittenDayJson = JSON.stringify(pickPersistedDayDocument());
    lastWrittenBacklogJson = JSON.stringify(pickPersistedBacklogBlob());
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

function dayStorageKey(dayKey: string): string {
  return `${TODO_DAY_STORAGE_KEY_PREFIX}${dayKey}`;
}

function autoRolloverMarkerKey(yesterdayKey: string): string {
  return `${TODO_AUTO_ROLLOVER_MARKER_PREFIX}${yesterdayKey}`;
}

let lastWrittenDayJson = "";
let lastWrittenBacklogJson = "";
/** Browser `setTimeout` id (`number`); avoid `NodeJS.Timeout` from Node typings. */
let debounceTimer: number | null = null;

function clearDebounceTimer(): void {
  if (debounceTimer != null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function schedulePersistDebounced(): void {
  if (typeof window === "undefined") return;
  clearDebounceTimer();
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    persistNow();
  }, DEBOUNCE_MS);
}

function flushPersistSync(): void {
  clearDebounceTimer();
  persistNow();
}

function mapRow(t: TodoItem): { id: string; text: string; done: boolean } {
  return { id: t.id, text: t.text, done: t.done };
}

function pickPersistedDayDocument(): TodoDayDocumentV3 {
  return {
    items: todoStore.items.map(mapRow),
  };
}

function pickPersistedBacklogBlob(): { backlogItems: ReturnType<typeof mapRow>[] } {
  return {
    backlogItems: todoStore.backlogItems.map(mapRow),
  };
}

function persistNow(): void {
  if (typeof window === "undefined") return;
  if (!todoStore.hydrated) return;
  const dayS = JSON.stringify(pickPersistedDayDocument());
  if (dayS !== lastWrittenDayJson) {
    lastWrittenDayJson = dayS;
    storageSetItem(dayStorageKey(todoStore.dayKey), dayS);
  }
  const backlogS = JSON.stringify(pickPersistedBacklogBlob());
  if (backlogS !== lastWrittenBacklogJson) {
    lastWrittenBacklogJson = backlogS;
    storageSetItem(TODO_BACKLOG_STORAGE_KEY, backlogS);
  }
}

function applyLoadedDay(dayKey: string, doc: TodoDayDocumentV3): void {
  todoStore.dayKey = dayKey;
  todoStore.items = doc.items;
}

function syncPersistSnapshots(): void {
  const dayDoc = pickPersistedDayDocument();
  lastWrittenDayJson = JSON.stringify(dayDoc);
  storageSetItem(dayStorageKey(todoStore.dayKey), lastWrittenDayJson);
  const backlogBlob = pickPersistedBacklogBlob();
  lastWrittenBacklogJson = JSON.stringify(backlogBlob);
  storageSetItem(TODO_BACKLOG_STORAGE_KEY, lastWrittenBacklogJson);
}

function isTodoItem(x: unknown): x is TodoItem {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.text === "string" &&
    typeof o.done === "boolean"
  );
}

/** Drops persisted rows with no visible text (empty or whitespace-only). */
function todoRowHasVisibleText(t: TodoItem): boolean {
  return t.text.trim() !== "";
}

function omitEmptyTodoDayItems(doc: TodoDayDocumentV3): TodoDayDocumentV3 {
  return {
    items: doc.items.filter(todoRowHasVisibleText),
  };
}

/** Same normalization as {@link omitEmptyTodoDayItems} for global backlog lists. */
function omitEmptyBacklogItems(items: TodoItem[]): TodoItem[] {
  return items.filter(todoRowHasVisibleText);
}

function parseTodoDayDocumentV3(raw: unknown): TodoDayDocumentV3 {
  if (!raw || typeof raw !== "object") return { items: [] };
  const o = raw as Record<string, unknown>;
  const items = Array.isArray(o.items) ? o.items.filter(isTodoItem) : [];
  return omitEmptyTodoDayItems({ items });
}

/** Reads legacy per-day docs that may still include `backlogItems` (stripped by migration). */
function parseTodoDayDocumentV2(raw: unknown): TodoDayDocumentV2 {
  if (!raw || typeof raw !== "object") return { items: [], backlogItems: [] };
  const o = raw as Record<string, unknown>;
  const items = Array.isArray(o.items) ? o.items.filter(isTodoItem) : [];
  const backlogItems = Array.isArray(o.backlogItems) ? o.backlogItems.filter(isTodoItem) : [];
  return {
    items: items.filter(todoRowHasVisibleText),
    backlogItems: omitEmptyBacklogItems(backlogItems),
  };
}

function readValidatedDayDocument(dayKey: string): TodoDayDocumentV3 {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = localStorage.getItem(dayStorageKey(dayKey));
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as unknown;
    return parseTodoDayDocumentV3(parsed);
  } catch (e: unknown) {
    log.warn("todo: parse failed for day", dayKey, e);
    return { items: [] };
  }
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
  const merged: TodoItem[] = [];

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
    const backlogArr = Array.isArray(backlogRaw) ? backlogRaw.filter(isTodoItem) : [];
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

function readValidatedGlobalBacklogItems(): TodoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TODO_BACKLOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return omitEmptyBacklogItems(parsed.filter(isTodoItem));
    }
    if (parsed && typeof parsed === "object" && "backlogItems" in parsed) {
      const a = (parsed as { backlogItems: unknown }).backlogItems;
      return Array.isArray(a) ? omitEmptyBacklogItems(a.filter(isTodoItem)) : [];
    }
  } catch (e: unknown) {
    log.warn("todo: parse global backlog failed", e);
  }
  return [];
}

/** Rewrite one day bucket so non-empty incomplete rows are dropped (completed + empty rows stay). */
function stripPendingFromDayBucket(dayKey: string): void {
  const doc = readValidatedDayDocument(dayKey);
  const items = doc.items;
  const kept = items.filter((t) => t.done || t.text.trim() === "");
  if (kept.length === items.length) return;
  const yDoc: TodoDayDocumentV3 = {
    items: kept.map((t) => ({ id: t.id, text: t.text, done: t.done })),
  };
  storageSetItem(dayStorageKey(dayKey), JSON.stringify(yDoc));
}

/**
 * Append yesterday’s non-empty incomplete today-list tasks to today and remove them from yesterday’s bucket.
 * Idempotent per (yesterday → today) via a small marker key so refresh does not duplicate tasks.
 */
function moveYesterdayPendingIntoToday(): void {
  if (typeof window === "undefined") return;
  const today = todoStore.dayKey;
  const yKey = previousLocalDayKey();

  let markerMatches = false;
  try {
    markerMatches = localStorage.getItem(autoRolloverMarkerKey(yKey)) === today;
  } catch (e: unknown) {
    log.warn("todo: read auto-rollover marker failed", e);
  }

  if (markerMatches) {
    stripPendingFromDayBucket(yKey);
    return;
  }

  const yesterdayDoc = readValidatedDayDocument(yKey);
  const pending = yesterdayDoc.items.filter((t) => !t.done && t.text.trim() !== "");
  if (pending.length === 0) return;

  for (const it of pending) {
    todoStore.items.push({
      id: crypto.randomUUID(),
      text: it.text,
      done: false,
    });
  }
  syncPersistSnapshots();

  stripPendingFromDayBucket(yKey);

  storageSetItem(autoRolloverMarkerKey(yKey), today);
}

function loadFromStorage(): void {
  if (typeof window === "undefined") return;
  migrateLegacyPersistKeysOnce();
  migrateLocalStoragePerDayBacklogToGlobal();
  const today = localDayKey();
  const emptyDay: TodoDayDocumentV3 = { items: [] };
  try {
    todoStore.backlogItems = readValidatedGlobalBacklogItems().map((t) => ({
      id: t.id,
      text: t.text,
      done: t.done,
    }));
    applyLoadedDay(today, readValidatedDayDocument(today));
    moveYesterdayPendingIntoToday();
    syncPersistSnapshots();
  } catch (e: unknown) {
    log.error("todo: failed to load today’s list", e);
    todoStore.backlogItems = [];
    applyLoadedDay(today, emptyDay);
    moveYesterdayPendingIntoToday();
    syncPersistSnapshots();
  }
  todoStore.hydrated = true;
}

function syncCalendarDayIfNeeded(): void {
  if (!todoStore.hydrated) return;
  const today = localDayKey();
  if (todoStore.dayKey === today) return;
  flushPersistSync();
  applyLoadedDay(today, readValidatedDayDocument(today));
  moveYesterdayPendingIntoToday();
  syncPersistSnapshots();
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

function readJsonKey(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
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
function mergePerDayBacklogsFromV2(byDay: Record<string, TodoDayDocumentV2>): TodoItem[] {
  const seen = new Set<string>();
  const out: TodoItem[] = [];
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

function parseTopLevelBacklog(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) return [];
  return omitEmptyBacklogItems(raw.filter(isTodoItem));
}

/** Top-level backlog first, then per-day rows, deduping by id. */
function mergeTopAndPerDayBacklogs(top: TodoItem[], fromDays: TodoItem[]): TodoItem[] {
  const seen = new Set<string>();
  const out: TodoItem[] = [];
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

function parseRolloverMarkersRecord(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;
    out[k] = v;
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
    markerKeys:
      data.todoRolloverMarkers != null && isRecord(data.todoRolloverMarkers)
        ? Object.keys(data.todoRolloverMarkers).length
        : 0,
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
  const todoRolloverMarkers = parseRolloverMarkersRecord(data.todoRolloverMarkers);

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
    markerCount: Object.keys(todoRolloverMarkers).length,
  });
  return {
    version: TODO_EXPORT_VERSION,
    todosByDay,
    backlogItems,
    todoRolloverMarkers,
  };
}

function collectTodoExportFromLocalStorage(): TodoExportV3 {
  if (typeof window === "undefined") {
    return {
      version: TODO_EXPORT_VERSION,
      todosByDay: {},
      backlogItems: [],
      todoRolloverMarkers: {},
    };
  }
  const todosByDay: Record<string, TodoDayDocumentV3> = {};
  const todoRolloverMarkers: Record<string, string> = {};
  for (const key of listLocalStorageKeys()) {
    if (key.startsWith(TODO_DAY_STORAGE_KEY_PREFIX)) {
      const day = key.slice(TODO_DAY_STORAGE_KEY_PREFIX.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const parsed = readJsonKey(key);
      todosByDay[day] = parseTodoDayDocumentV3(parsed);
    } else if (key.startsWith(TODO_AUTO_ROLLOVER_MARKER_PREFIX)) {
      const yKey = key.slice(TODO_AUTO_ROLLOVER_MARKER_PREFIX.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(yKey)) continue;
      try {
        const val = localStorage.getItem(key);
        if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) todoRolloverMarkers[yKey] = val;
      } catch (e: unknown) {
        log.warn("todo: read rollover marker for export failed", yKey, e);
      }
    }
  }
  const backlogItems = readValidatedGlobalBacklogItems();
  return {
    version: TODO_EXPORT_VERSION,
    todosByDay,
    backlogItems,
    todoRolloverMarkers,
  };
}

function clearTodoRelatedStorageKeys(): void {
  const toRemove: string[] = [];
  for (const key of listLocalStorageKeys()) {
    if (
      key.startsWith(TODO_DAY_STORAGE_KEY_PREFIX) ||
      key.startsWith(TODO_AUTO_ROLLOVER_MARKER_PREFIX) ||
      key === TODO_BACKLOG_STORAGE_KEY
    ) {
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

/** Synchronous write of persisted todo state (clears debounce). Use before export/download. */
export function flushTodoPersistToStorage(): void {
  flushPersistSync();
}
