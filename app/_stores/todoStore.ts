import { proxy, useSnapshot } from "valtio";
import { subscribe } from "valtio/vanilla";

import { localDayKey } from "@/app/_stores/pomodoroStore";
import log from "@/lib/logger";

const DEBOUNCE_MS = 400;
const DAY_CHECK_INTERVAL_MS = 1000;
/** Prefix for per-calendar-day todo buckets: `{prefix}{YYYY-MM-DD}`. */
const TODO_DAY_STORAGE_KEY_PREFIX = "worktools.todo.day.";
/** Prefix for idempotency markers when rolling open tasks from yesterday into today. */
const TODO_AUTO_ROLLOVER_MARKER_PREFIX = "worktools.todo.autoRolloverFrom.";

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
