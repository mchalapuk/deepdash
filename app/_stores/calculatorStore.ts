import { create, all } from "mathjs";
import { proxy, useSnapshot } from "valtio";
import { subscribe } from "valtio/vanilla";
import log from "@/lib/logger";
import { CALCULATOR_STORAGE_KEY, migrateLegacyPersistKeysOnce } from "@/lib/persistKeys";

const STORAGE_KEY = CALCULATOR_STORAGE_KEY;
const MAX_HISTORY = 100;

const math = create(all);

const calculatorStore = proxy({
  nextId: "",
  expression: "",
  lastNormalized: "",
  lastResult: "",
  errorMessage: null as string | null,
  /** Successful evaluations only, newest first (max {@link MAX_HISTORY}). */
  history: [] as CalculatorHistoryEntry[],
  /**
   * Client-only: subscribe must not write to localStorage until loadFromStorage() finishes.
   */
  hydrated: false,
});

export type CalculatorPersistedV1 = {
  expression: string;
  history: CalculatorHistoryEntry[];
};

export const CALCULATOR_EXPORT_VERSION = 1 as const;
export type CalculatorExportV1 = {
  version: typeof CALCULATOR_EXPORT_VERSION;
} & CalculatorPersistedV1;

export type CalculatorHistoryEntry = {
  id: string;
  normalized: string;
  result: string;
};

export function useCalculatorNextId(): string {
  return useSnapshot(calculatorStore).nextId;
}

export function useCalculatorExpression(): string {
  return useSnapshot(calculatorStore).expression;
}

export function useCalculatorReadouts(): {
  lastNormalized: string;
  lastResult: string;
  errorMessage: string | null;
} {
  const s = useSnapshot(calculatorStore);
  return {
    lastNormalized: s.lastNormalized,
    lastResult: s.lastResult,
    errorMessage: s.errorMessage,
  };
}

export function useCalculatorHistory(): readonly CalculatorHistoryEntry[] {
  return useSnapshot(calculatorStore).history;
}

export function useCalculatorHydrated(): boolean {
  return useSnapshot(calculatorStore).hydrated;
}

export const calculatorActions = {
  init: function init(): () => void {
    loadFromStorage();
    return subscribe(calculatorStore, () => {
      if (!calculatorStore.hydrated) return;
      persistIfChanged();
    });
  },
  setExpression: function setExpression(value: string): void {
    calculatorStore.lastNormalized = "";
    calculatorStore.lastResult = "";
    calculatorStore.expression = value;
    calculatorStore.errorMessage = null;
    calculatorStore.nextId = crypto.randomUUID();
  },
  evaluate: function evaluate(): void {
    const raw = calculatorStore.expression.trim();
    if (!raw) {
      calculatorStore.errorMessage = null;
      return;
    }
    try {
      const node = math.parse(raw);
      const normalized = node.toString({ parenthesis: "auto" });
      const value = node.evaluate();
      calculatorStore.lastNormalized = normalized;
      calculatorStore.lastResult = formatMathResult(value);
      calculatorStore.expression = normalized;
      calculatorStore.errorMessage = null;
      pushHistoryEntry(calculatorStore.nextId, normalized, formatMathResult(value));
    } catch (e: unknown) {
      calculatorStore.errorMessage = formatMathError(e);
    }
  },

  exportData: function exportData(): CalculatorExportV1 {
    const body = pickPersisted();
    return { version: CALCULATOR_EXPORT_VERSION, ...body };
  },

  /**
   * Accepts `{ version, expression, history }` or a legacy `{ expression, history }` object (pre–slice-version exports).
   */
  importData: function importData(data: unknown): void {
    const slice = migrateCalculatorSliceToLatest(data);
    calculatorStore.expression = slice.expression;
    calculatorStore.errorMessage = null;
    calculatorStore.lastNormalized = "";
    calculatorStore.lastResult = "";
    calculatorStore.history = slice.history.map((h) => ({
      id: h.id,
      normalized: h.normalized,
      result: h.result,
    }));
    calculatorStore.nextId = crypto.randomUUID();
    if (typeof window === "undefined") return;
    lastPersistedJson = JSON.stringify({
      expression: slice.expression,
      history: slice.history,
    });
    storageSetItemStrict(STORAGE_KEY, lastPersistedJson);
  },
};

// --- formatting ---

function formatMathResult(value: unknown): string {
  if (value === null || value === undefined) return "";
  return math.format(value, { precision: 14 });
}

function formatMathError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "Invalid expression";
}

function pushHistoryEntry(id: string, normalized: string, result: string): void {
  if (!normalized || !result) return;
  if (calculatorStore.history.find((h) => h.normalized === normalized)) return;

  calculatorStore.history =
    [{ id, normalized, result }, ...calculatorStore.history]
      .slice(0, MAX_HISTORY);
}

// --- storage ---

let lastPersistedJson = "";

function loadFromStorage(): void {
  if (typeof window === "undefined") return;
  migrateLegacyPersistKeysOnce();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isCalculatorPersistRootV1(parsed)) {
        calculatorStore.expression = parsed.expression;
        calculatorStore.errorMessage = null;
        calculatorStore.history = parseHistoryArray(
          (parsed as Record<string, unknown>).history,
        );
      }
    }
  } catch (e: unknown) {
    log.error("calculator: failed to load from localStorage", e);
  }
  lastPersistedJson = JSON.stringify(pickPersisted());
  calculatorStore.hydrated = true;
}

function pickPersisted(): CalculatorPersistedV1 {
  return {
    expression: calculatorStore.expression,
    history: calculatorStore.history.map((h) => ({
      id: h.id,
      normalized: h.normalized,
      result: h.result,
    })),
  };
}

function storageSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e: unknown) {
    log.warn("calculator: localStorage setItem failed", key, e);
  }
}

function storageSetItemStrict(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`calculator: could not write ${key} (${detail})`);
  }
}

function persistIfChanged(): void {
  if (typeof window === "undefined") return;
  const s = JSON.stringify(pickPersisted());
  if (s === lastPersistedJson) return;
  lastPersistedJson = s;
  storageSetItem(STORAGE_KEY, s);
}

function parseHistoryArray(x: unknown): CalculatorHistoryEntry[] {
  if (!Array.isArray(x)) return [];
  const out: CalculatorHistoryEntry[] = [];
  for (const item of x) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.normalized !== "string" || typeof o.result !== "string") continue;
    if (out.find((e) => e.normalized === o.normalized)) continue;
    out.push({
      id: typeof o.id === "string" ? o.id : crypto.randomUUID(),
      normalized: o.normalized,
      result: o.result,
    });
    if (out.length >= MAX_HISTORY) break;
  }
  return out;
}

function isCalculatorPersistRootV1(
  x: unknown,
): x is Pick<
  CalculatorPersistedV1,
  "expression" | "history"
> {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.expression === "string" && Array.isArray(o.history) && o.history.every(isCalculatorHistoryEntry);
}

function isCalculatorHistoryEntry(x: unknown): x is CalculatorHistoryEntry {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.normalized === "string" && typeof o.result === "string";
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function bodyFromCalculatorSlice(data: Record<string, unknown>): CalculatorPersistedV1 {
  const expression = typeof data.expression === "string" ? data.expression : "";
  const history = parseHistoryArray(data.history);
  return { expression, history };
}

/** Normalize any supported calculator import slice to {@link CalculatorExportV1}. */
export function migrateCalculatorSliceToLatest(data: unknown): CalculatorExportV1 {
  log.debug("calculator migration: start");
  if (!isRecord(data)) {
    log.error("calculator migration: not an object");
    throw new Error("calculator: import slice is not an object.");
  }
  const v = data.version;
  log.debug("calculator migration: shape", {
    version: v,
    hasExpression: typeof data.expression === "string",
    historyLen: Array.isArray(data.history) ? data.history.length : null,
  });
  if (v === undefined) {
    const body = bodyFromCalculatorSlice(data);
    log.debug("calculator migration: ok (legacy, no version)", {
      historyEntries: body.history.length,
    });
    return {
      version: CALCULATOR_EXPORT_VERSION,
      ...body,
    };
  }
  if (v === CALCULATOR_EXPORT_VERSION) {
    const body = bodyFromCalculatorSlice(data);
    log.debug("calculator migration: ok (v1)", { historyEntries: body.history.length });
    return {
      version: CALCULATOR_EXPORT_VERSION,
      ...body,
    };
  }
  log.error("calculator migration: unsupported version", { version: v });
  throw new Error(
    `calculator: unsupported export slice version ${String(v)}. Update the app or re-export your data.`,
  );
}
