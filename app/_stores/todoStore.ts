import { proxy, useSnapshot } from "valtio";
import { subscribe } from "valtio/vanilla";

import { localDayKey } from "@/app/_stores/pomodoroStore";
import log from "@/lib/logger";
import {
  TODO_AUTO_ROLLOVER_MARKER_PREFIX,
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
  items: [] as TodoItem[],
});

/** Persisted JSON for one calendar day (persisted rows only; no trailing editor). */
export type TodoDayDocumentV1 = {
  items: TodoItem[];
};

export type TodoItem = {
  id: string;
  text: string;
  done: boolean;
};

export const TODO_EXPORT_VERSION = 1 as const;
export type TodoExportV1 = {
  version: typeof TODO_EXPORT_VERSION;
  todosByDay: Record<string, TodoDayDocumentV1>;
  todoRolloverMarkers: Record<string, string>;
};

export function useTodoList(): { hydrated: boolean; items: readonly TodoItem[] } {
  const snap = useSnapshot(todoStore);
  return { hydrated: snap.hydrated, items: snap.items };
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
    const i = indexOfId(id);
    if (i < 0) return;
    todoStore.items[i].text = text;
  },

  toggleDone: function toggleDone(id: string): void {
    const i = indexOfId(id);
    if (i < 0) return;
    todoStore.items[i].done = !todoStore.items[i].done;
  },

  addItem: function addItem(text: string, done = false): string {
    const id = crypto.randomUUID();
    todoStore.items.push({ id, text, done });
    return id;
  },

  insertEmptyAt: function insertEmptyAt(index: number): string {
    const id = crypto.randomUUID();
    const clamped = Math.max(0, Math.min(index, todoStore.items.length));
    todoStore.items.splice(clamped, 0, { id, text: "", done: false });
    return id;
  },

  splitItemAt: function splitItemAt(id: string, caret: number): string | null {
    const i = indexOfId(id);
    if (i < 0) return null;
    const t = todoStore.items[i].text;
    if (caret <= 0 || caret >= t.length) return null;
    const left = t.slice(0, caret);
    const right = t.slice(caret);
    const row = todoStore.items[i];
    todoStore.items[i] = { ...row, text: left };
    const newId = crypto.randomUUID();
    todoStore.items.splice(i + 1, 0, { id: newId, text: right, done: false });
    return newId;
  },

  mergeWithNext: function mergeWithNext(id: string): void {
    const i = indexOfId(id);
    if (i < 0 || i >= todoStore.items.length - 1) return;
    const cur = todoStore.items[i];
    const next = todoStore.items[i + 1];
    const merged = `${cur.text} ${next.text}`;
    todoStore.items.splice(i, 2, {
      id: cur.id,
      text: merged,
      done: cur.done,
    });
  },

  mergeWithPrev: function mergeWithPrev(id: string): void {
    const i = indexOfId(id);
    if (i <= 0) return;
    const prev = todoStore.items[i - 1];
    const cur = todoStore.items[i];
    const merged = `${prev.text} ${cur.text}`;
    todoStore.items.splice(i - 1, 2, {
      id: prev.id,
      text: merged,
      done: prev.done,
    });
  },

  removeItem: function removeItem(id: string): void {
    const i = indexOfId(id);
    if (i < 0) return;
    todoStore.items.splice(i, 1);
  },

  /** Removes a row if it still exists and its text is empty/whitespace (e.g. after blur). */
  removeItemIfEmpty: function removeItemIfEmpty(id: string): void {
    const i = indexOfId(id);
    if (i < 0) return;
    if (todoStore.items[i].text.trim() !== "") return;
    todoStore.items.splice(i, 1);
  },

  exportData: function exportData(): TodoExportV1 {
    return collectTodoExportFromLocalStorage();
  },

  /**
   * Replaces all todo day buckets and rollover markers. Does not run auto-rollover side effects.
   * Accepts `{ version, todosByDay, todoRolloverMarkers }` or a legacy object with those fields and no `version`.
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
    for (const [yKey, todayKey] of Object.entries(slice.todoRolloverMarkers)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(yKey)) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) continue;
      storageSetItemStrict(autoRolloverMarkerKey(yKey), todayKey);
    }
    const today = localDayKey();
    applyLoadedDay(today, readValidatedDayItems(today));
    lastWrittenJson = JSON.stringify(pickPersistedDocument());
  },
};

// --- domain helpers ---

function indexOfId(id: string): number {
  return todoStore.items.findIndex((x) => x.id === id);
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

let lastWrittenJson = "";
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

function persistNow(): void {
  if (typeof window === "undefined") return;
  if (!todoStore.hydrated) return;
  const doc = pickPersistedDocument();
  const s = JSON.stringify(doc);
  if (s === lastWrittenJson) return;
  lastWrittenJson = s;
  storageSetItem(dayStorageKey(todoStore.dayKey), s);
}

function pickPersistedDocument(): TodoDayDocumentV1 {
  return {
    items: todoStore.items.map((t) => ({
      id: t.id,
      text: t.text,
      done: t.done,
    })),
  };
}

function applyLoadedDay(dayKey: string, items: TodoItem[]): void {
  todoStore.dayKey = dayKey;
  todoStore.items = items;
}

function syncTodayPersistSnapshot(): void {
  const doc = pickPersistedDocument();
  lastWrittenJson = JSON.stringify(doc);
  storageSetItem(dayStorageKey(todoStore.dayKey), lastWrittenJson);
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

function parseTodoDayDocument(raw: unknown): TodoItem[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.items)) return [];
  return o.items.filter(isTodoItem);
}

function readValidatedDayItems(dayKey: string): TodoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(dayStorageKey(dayKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return parseTodoDayDocument(parsed);
  } catch (e: unknown) {
    log.warn("todo: parse failed for day", dayKey, e);
    return [];
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

/** Rewrite one day bucket so non-empty incomplete rows are dropped (completed + empty rows stay). */
function stripPendingFromDayBucket(dayKey: string): void {
  const items = readValidatedDayItems(dayKey);
  const kept = items.filter((t) => t.done || t.text.trim() === "");
  if (kept.length === items.length) return;
  const yDoc: TodoDayDocumentV1 = {
    items: kept.map((t) => ({ id: t.id, text: t.text, done: t.done })),
  };
  storageSetItem(dayStorageKey(dayKey), JSON.stringify(yDoc));
}

/**
 * Append yesterday’s non-empty incomplete tasks to today and remove them from yesterday’s bucket.
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

  const yesterdayItems = readValidatedDayItems(yKey);
  const pending = yesterdayItems.filter((t) => !t.done && t.text.trim() !== "");
  if (pending.length === 0) return;

  for (const it of pending) {
    todoStore.items.push({
      id: crypto.randomUUID(),
      text: it.text,
      done: false,
    });
  }
  syncTodayPersistSnapshot();

  stripPendingFromDayBucket(yKey);

  storageSetItem(autoRolloverMarkerKey(yKey), today);
}

function loadFromStorage(): void {
  if (typeof window === "undefined") return;
  const today = localDayKey();
  try {
    applyLoadedDay(today, readValidatedDayItems(today));
    moveYesterdayPendingIntoToday();
    syncTodayPersistSnapshot();
  } catch (e: unknown) {
    log.error("todo: failed to load today’s list", e);
    applyLoadedDay(today, []);
    moveYesterdayPendingIntoToday();
    syncTodayPersistSnapshot();
  }
  todoStore.hydrated = true;
}

function syncCalendarDayIfNeeded(): void {
  if (!todoStore.hydrated) return;
  const today = localDayKey();
  if (todoStore.dayKey === today) return;
  flushPersistSync();
  applyLoadedDay(today, readValidatedDayItems(today));
  moveYesterdayPendingIntoToday();
  syncTodayPersistSnapshot();
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

function parseTodosByDayRecord(raw: unknown): Record<string, TodoDayDocumentV1> {
  if (!isRecord(raw)) return {};
  const out: Record<string, TodoDayDocumentV1> = {};
  for (const [day, doc] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    out[day] = { items: parseTodoDayDocument(doc) };
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

/** Normalize any supported todo import slice to {@link TodoExportV1}. */
export function migrateTodoSliceToLatest(data: unknown): TodoExportV1 {
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
  if (v !== undefined && v !== TODO_EXPORT_VERSION) {
    log.error("todo migration: unsupported version", { version: v });
    throw new Error(
      `todo: unsupported export slice version ${String(v)}. Update the app or re-export your data.`,
    );
  }
  const todosByDay = parseTodosByDayRecord(data.todosByDay);
  const todoRolloverMarkers = parseRolloverMarkersRecord(data.todoRolloverMarkers);
  let itemCount = 0;
  for (const doc of Object.values(todosByDay)) {
    itemCount += doc.items.length;
  }
  log.debug("todo migration: ok", {
    dayCount: Object.keys(todosByDay).length,
    itemCount,
    markerCount: Object.keys(todoRolloverMarkers).length,
  });
  return {
    version: TODO_EXPORT_VERSION,
    todosByDay,
    todoRolloverMarkers,
  };
}

function collectTodoExportFromLocalStorage(): TodoExportV1 {
  if (typeof window === "undefined") {
    return {
      version: TODO_EXPORT_VERSION,
      todosByDay: {},
      todoRolloverMarkers: {},
    };
  }
  const todosByDay: Record<string, TodoDayDocumentV1> = {};
  const todoRolloverMarkers: Record<string, string> = {};
  for (const key of listLocalStorageKeys()) {
    if (key.startsWith(TODO_DAY_STORAGE_KEY_PREFIX)) {
      const day = key.slice(TODO_DAY_STORAGE_KEY_PREFIX.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const parsed = readJsonKey(key);
      todosByDay[day] = { items: parseTodoDayDocument(parsed) };
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
  return {
    version: TODO_EXPORT_VERSION,
    todosByDay,
    todoRolloverMarkers,
  };
}

function clearTodoRelatedStorageKeys(): void {
  const toRemove: string[] = [];
  for (const key of listLocalStorageKeys()) {
    if (
      key.startsWith(TODO_DAY_STORAGE_KEY_PREFIX) ||
      key.startsWith(TODO_AUTO_ROLLOVER_MARKER_PREFIX)
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

/** Synchronous write of today’s todo document (clears debounce). Use before export/download. */
export function flushTodoPersistToStorage(): void {
  flushPersistSync();
}
