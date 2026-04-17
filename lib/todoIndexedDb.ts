/**
 * IndexedDB storage for todo tasks: one object per task, indexed by calendar `day`
 * (`YYYY-MM-DD`) or `"backlog"`.
 */

import {
  TODO_BACKLOG_STORAGE_KEY,
  TODO_DAY_STORAGE_KEY_PREFIX,
  TODO_IDB_LEGACY_MIGRATED_KEY,
} from "@/lib/persistKeys";
import log from "@/lib/logger";

// --- exported constants (importance) ---

/** Database name (stable across app versions unless we intentionally fork). */
export const TODO_IDB_NAME = "deepdash.todo.v1";
/** Schema version; bump with `onupgradeneeded` migrations. */
export const TODO_IDB_VERSION = 1;
/** Single object store for all tasks. */
export const TODO_IDB_STORE = "tasks";
/** Sentinel `day` value for the global backlog list. */
export const TODO_IDB_BACKLOG_DAY = "backlog";

/** Object store index on calendar `day` / backlog sentinel. */
export const TODO_IDB_INDEX_DAY = "day";
/**
 * Compound index `[done, day]` — query incomplete non-backlog tasks with
 * {@link INCOMPLETE_CALENDAR_DAY_KEY_RANGE} (see {@link rolloverIncompleteVisibleTasksFromDayToDay}).
 */
export const TODO_IDB_INDEX_DONE_AND_DAY = "doneAndDay";

// --- private constants ---

const CALENDAR_DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Lexicographic bounds covering ISO `YYYY-MM-DD` keys (excludes `"backlog"`). */
const INCOMPLETE_CALENDAR_DAY_KEY_RANGE: [string, string] = ["0000-01-01", "9999-12-31"];

// --- module state ---

let dbPromise: Promise<IDBDatabase> | null = null;

// --- exported types (abstraction: high → low) ---

/** Full todo slice shape for JSON export. */
export type TodoExportBuckets = {
  todosByDay: Record<string, { items: TodoItemShape[] }>;
  backlogItems: TodoItemShape[];
};

/** One persisted row in the `tasks` store (includes ordering metadata). */
export type TodoTaskRecord = {
  id: string;
  day: string;
  text: string;
  /** 0 = incomplete, 1 = done (integers are valid IndexedDB keys; booleans are not). */
  done: 0 | 1;
  /** Sort order within {@link day} (fractional ordering). */
  rank: number;
};

/** Raw row shape before {@link todoRecordForStore} (import / legacy may use boolean `done`). */
export type TodoTaskRecordInput = Omit<TodoTaskRecord, "done"> & { done: boolean | 0 | 1 };

/** Inline shape to avoid circular imports with `todoStore` (JSON / export; no `rank`). */
export type TodoItemShape = { id: string; text: string; done: boolean };

/** Row returned from {@link getSortedTodoItemsForDay} (includes persisted sort key). */
export type TodoItemWithRank = TodoItemShape & { rank: number };

// --- private types (abstraction: high → low) ---

/** Legacy per-day JSON after normalization to v3 `{ items }` only. */
type LegacyDayDocV3 = { items: TodoItemShape[] };

// --- exported functions (getters, setters, app lifecycle, utilities) ---

/** Tasks for one calendar day or backlog, ordered for display (includes `rank` for the store). */
export async function getSortedTodoItemsForDay(day: string): Promise<TodoItemWithRank[]> {
  const rows = await getSortedTodoRecordsForDay(day);
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    done: r.done !== 0,
    rank: r.rank,
  }));
}

export async function getTodoTaskRecord(id: string): Promise<TodoTaskRecord | undefined> {
  const db = await openTodoDatabase();
  const tx = db.transaction(TODO_IDB_STORE, "readonly");
  const store = tx.objectStore(TODO_IDB_STORE);
  const row = await requestToPromise(store.get(id) as IDBRequest<TodoTaskRecordInput | undefined>);
  await txDone(tx);
  return row ? todoRecordForStore(row) : undefined;
}

export type TodoTaskWriteBatch = {
  deleteIds?: string[];
  putRecords?: TodoTaskRecordInput[];
};

/** Single transaction: deletes first, then puts (e.g. merge out a row, update survivor). */
export async function applyTodoTaskWrites(batch: TodoTaskWriteBatch): Promise<void> {
  const deleteIds = batch.deleteIds ?? [];
  const putRecords = batch.putRecords ?? [];
  if (deleteIds.length === 0 && putRecords.length === 0) return;
  const db = await openTodoDatabase();
  const tx = db.transaction(TODO_IDB_STORE, "readwrite");
  const store = tx.objectStore(TODO_IDB_STORE);
  for (const delId of deleteIds) {
    store.delete(delId);
  }
  for (const rec of putRecords) {
    store.put(todoRecordForStore(rec));
  }
  await txDone(tx);
}

/**
 * Rollover: moves non-empty incomplete tasks from `fromDay` onto `toDay` by updating `day` and
 * `rank` only (same task ids).
 */
export async function rolloverIncompleteVisibleTasksFromDayToDay(
  fromDay: string,
  toDay: string,
): Promise<void> {
  const db = await openTodoDatabase();
  const tx = db.transaction(TODO_IDB_STORE, "readwrite");
  const store = tx.objectStore(TODO_IDB_STORE);
  const byDoneAndDay = store.index(TODO_IDB_INDEX_DONE_AND_DAY);
  const rows = await requestToPromise(
    byDoneAndDay.getAll(
      IDBKeyRange.bound(
        [0, INCOMPLETE_CALENDAR_DAY_KEY_RANGE[0]],
        [0, INCOMPLETE_CALENDAR_DAY_KEY_RANGE[1]],
      ),
    ) as IDBRequest<TodoTaskRecordInput[]>,
  );
  const normalized = rows.map((r) => todoRecordForStore(r));
  const toMove = normalized.filter((r) => r.day === fromDay && r.text.trim() !== "");
  if (toMove.length === 0) {
    await txDone(tx);
    return;
  }
  toMove.sort((a, b) => a.rank - b.rank);

  const byDayIdx = store.index(TODO_IDB_INDEX_DAY);
  const destExisting = await requestToPromise(byDayIdx.getAll(toDay) as IDBRequest<TodoTaskRecord[]>);
  destExisting.sort((a, b) => a.rank - b.rank);
  let tailRank = destExisting.length ? destExisting[destExisting.length - 1]!.rank + 1000 : 0;

  for (const r of toMove) {
    store.put(
      todoRecordForStore({
        id: r.id,
        day: toDay,
        text: r.text,
        done: r.done,
        rank: tailRank,
      }),
    );
    tailRank += 1000;
  }
  await txDone(tx);
}

/**
 * Reads every task and groups into per-day export shape + backlog list (sorted by rank).
 */
export async function collectTodoTasksForExport(): Promise<TodoExportBuckets> {
  const db = await openTodoDatabase();
  const tx = db.transaction(TODO_IDB_STORE, "readonly");
  const store = tx.objectStore(TODO_IDB_STORE);
  const all = await requestToPromise(store.getAll() as IDBRequest<TodoTaskRecordInput[]>);
  await txDone(tx);
  const allNorm = all.map((r) => todoRecordForStore(r));

  const byDay: Record<string, TodoTaskRecord[]> = {};
  for (const r of allNorm) {
    if (r.day === TODO_IDB_BACKLOG_DAY) continue;
    if (!CALENDAR_DAY_KEY_RE.test(r.day)) continue;
    (byDay[r.day] ??= []).push(r);
  }
  const backlogRows = allNorm.filter((r) => r.day === TODO_IDB_BACKLOG_DAY);
  backlogRows.sort((a, b) => a.rank - b.rank);

  const todosByDay: Record<string, { items: TodoItemShape[] }> = {};
  for (const [day, rows] of Object.entries(byDay)) {
    rows.sort((a, b) => a.rank - b.rank);
    todosByDay[day] = {
      items: rows.map((r) => ({ id: r.id, text: r.text, done: r.done !== 0 })),
    };
  }
  return {
    todosByDay,
    backlogItems: backlogRows.map((r) => ({ id: r.id, text: r.text, done: r.done !== 0 })),
  };
}

/** Replaces every task row: clears the store, then writes the import payload (JSON import path). */
export async function replaceAllTodoTasksFromImport(payload: {
  todosByDay: Record<string, { items: TodoItemShape[] }>;
  backlogItems: TodoItemShape[];
}): Promise<void> {
  const db = await openTodoDatabase();
  const tx = db.transaction(TODO_IDB_STORE, "readwrite");
  const store = tx.objectStore(TODO_IDB_STORE);
  store.clear();
  for (const [day, doc] of Object.entries(payload.todosByDay)) {
    if (!CALENDAR_DAY_KEY_RE.test(day)) continue;
    doc.items.forEach((t, i) => {
      store.put(
        todoRecordForStore({
          id: t.id,
          day,
          text: t.text,
          done: t.done,
          rank: i * 1000,
        }),
      );
    });
  }
  payload.backlogItems.forEach((t, i) => {
    store.put(
      todoRecordForStore({
        id: t.id,
        day: TODO_IDB_BACKLOG_DAY,
        text: t.text,
        done: t.done,
        rank: i * 1000,
      }),
    );
  });
  await txDone(tx);
}

/**
 * One-time migration: legacy per-day JSON + global backlog JSON → IndexedDB rows, then removes
 * legacy task payloads from `localStorage`.
 */
export async function migrateLegacyTodoLocalStorageToIndexedDb(): Promise<void> {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  if (localStorage.getItem(TODO_IDB_LEGACY_MIGRATED_KEY) === "1") return;

  const dayKeys = listLocalStorageKeys()
    .filter((k) => k.startsWith(TODO_DAY_STORAGE_KEY_PREFIX))
    .map((k) => k.slice(TODO_DAY_STORAGE_KEY_PREFIX.length))
    .filter((d) => CALENDAR_DAY_KEY_RE.test(d))
    .sort();

  const db = await openTodoDatabase();
  const tx = db.transaction(TODO_IDB_STORE, "readwrite");
  const store = tx.objectStore(TODO_IDB_STORE);

  for (const day of dayKeys) {
    const key = `${TODO_DAY_STORAGE_KEY_PREFIX}${day}`;
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      raw = null;
    }
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      continue;
    }
    const doc = parseDayDocV3(parsed);
    doc.items.forEach((t, i) => {
      store.put(
        todoRecordForStore({
          id: t.id,
          day,
          text: t.text,
          done: t.done,
          rank: i * 1000,
        }),
      );
    });
  }

  const backlogItems = readLegacyBacklogItems();
  for (const [i, t] of backlogItems.entries()) {
    store.put(
      todoRecordForStore({
        id: t.id,
        day: TODO_IDB_BACKLOG_DAY,
        text: t.text,
        done: t.done,
        rank: i * 1000,
      }),
    );
  }

  await txDone(tx);

  for (const day of dayKeys) {
    try {
      localStorage.removeItem(`${TODO_DAY_STORAGE_KEY_PREFIX}${day}`);
    } catch (e: unknown) {
      log.warn("todo idb migration: remove legacy day key failed", day, e);
    }
  }
  try {
    localStorage.removeItem(TODO_BACKLOG_STORAGE_KEY);
  } catch (e: unknown) {
    log.warn("todo idb migration: remove legacy backlog key failed", e);
  }

  try {
    localStorage.setItem(TODO_IDB_LEGACY_MIGRATED_KEY, "1");
  } catch {
    /* best effort */
  }
}

/** Clears the open handle and deletes the database (tests only). */
export async function __resetTodoDatabaseForTests(): Promise<void> {
  dbPromise = null;
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(TODO_IDB_NAME);
    req.onsuccess = (): void => resolve();
    req.onerror = (): void => reject(req.error ?? new Error("IndexedDB deleteDatabase failed"));
  });
}

// --- private functions (importance) ---

function normalizeDone(d: boolean | 0 | 1): 0 | 1 {
  return d === true || d === 1 ? 1 : 0;
}

function todoRecordForStore(rec: TodoTaskRecordInput): TodoTaskRecord {
  return {
    id: rec.id,
    day: rec.day,
    text: rec.text,
    done: normalizeDone(rec.done),
    rank: rec.rank,
  };
}

function openTodoDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available."));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(TODO_IDB_NAME, TODO_IDB_VERSION);
      req.onupgradeneeded = (): void => {
        const db = req.result;
        if (!db.objectStoreNames.contains(TODO_IDB_STORE)) {
          const store = db.createObjectStore(TODO_IDB_STORE, { keyPath: "id" });
          store.createIndex(TODO_IDB_INDEX_DAY, "day", { unique: false });
          store.createIndex(TODO_IDB_INDEX_DONE_AND_DAY, ["done", "day"], { unique: false });
        }
      };
      req.onsuccess = (): void => resolve(req.result);
      req.onerror = (): void => {
        dbPromise = null;
        reject(req.error ?? new Error("IndexedDB open failed"));
      };
    });
  }
  return dbPromise;
}

async function getSortedTodoRecordsForDay(day: string): Promise<TodoTaskRecord[]> {
  const db = await openTodoDatabase();
  const tx = db.transaction(TODO_IDB_STORE, "readonly");
  const store = tx.objectStore(TODO_IDB_STORE);
  const idx = store.index(TODO_IDB_INDEX_DAY);
  const rows = await requestToPromise(idx.getAll(day) as IDBRequest<TodoTaskRecordInput[]>);
  await txDone(tx);
  const normalized = rows.map((r) => todoRecordForStore(r));
  normalized.sort((a, b) => a.rank - b.rank);
  return normalized;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = (): void => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
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

function readLegacyBacklogItems(): TodoItemShape[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(TODO_BACKLOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(isTodoItem).filter(todoRowHasVisibleText);
    }
    if (parsed && typeof parsed === "object" && "backlogItems" in parsed) {
      const a = (parsed as { backlogItems: unknown }).backlogItems;
      return Array.isArray(a) ? a.filter(isTodoItem).filter(todoRowHasVisibleText) : [];
    }
  } catch (e: unknown) {
    log.warn("todo idb migration: parse legacy backlog failed", e);
  }
  return [];
}

function parseDayDocV3(raw: unknown): LegacyDayDocV3 {
  if (!raw || typeof raw !== "object") return { items: [] };
  const o = raw as Record<string, unknown>;
  const items = Array.isArray(o.items) ? o.items.filter(isTodoItem) : [];
  return { items: items.filter(todoRowHasVisibleText) };
}

function isTodoItem(x: unknown): x is TodoItemShape {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.text === "string" &&
    typeof o.done === "boolean"
  );
}

function todoRowHasVisibleText(t: TodoItemShape): boolean {
  return t.text.trim() !== "";
}
