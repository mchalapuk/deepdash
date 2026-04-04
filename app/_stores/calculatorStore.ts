import { create, all } from "mathjs";
import { proxy, useSnapshot } from "valtio";
import { subscribe } from "valtio/vanilla";
import log from "@/lib/logger";

const STORAGE_KEY = "worktools.calculator.v1";
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
  const { nextId, history } = useSnapshot(calculatorStore);
  const lastEntry = history[0];
  return lastEntry && lastEntry.id === nextId ? history.slice(1) : history;
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
