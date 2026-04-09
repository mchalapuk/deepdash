import {
  calculatorActions,
  type CalculatorExportV1,
  migrateCalculatorSliceToLatest,
} from "@/app/_stores/calculatorStore";
import {
  migratePomodoroSliceToLatest,
  pomodoroActions,
  type PomodoroExportV1,
} from "@/app/_stores/pomodoroStore";
import {
  flushTodoPersistToStorage,
  migrateTodoSliceToLatest,
  todoActions,
  type TodoExportV2,
} from "@/app/_stores/todoStore";
import {
  migrateWorldClockSliceToLatest,
  worldClockActions,
  type WorldClockExportV1,
} from "@/app/_stores/worldClockStore";
import log from "@/lib/logger";

/** Bump when the **bundle** layout changes (not necessarily every slice bump). */
export const CURRENT_DEEPDASH_EXPORT_VERSION = 1 as const;

export type DeepdashExportLatest = {
  version: typeof CURRENT_DEEPDASH_EXPORT_VERSION;
  exportedAt: string;
  worldClock: WorldClockExportV1;
  pomodoro: PomodoroExportV1;
  todo: TodoExportV2;
  calculator: CalculatorExportV1;
};

/** Builds the bundle from live stores / `localStorage` (browser only). */
export function collectDeepdashExport(): DeepdashExportLatest {
  if (typeof localStorage === "undefined") {
    throw new Error("Export is only available in the browser.");
  }
  flushTodoPersistToStorage();
  return {
    version: CURRENT_DEEPDASH_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    worldClock: worldClockActions.exportData(),
    pomodoro: pomodoroActions.exportData(),
    todo: todoActions.exportData(),
    calculator: calculatorActions.exportData(),
  };
}

export function downloadDeepdashJson(data: DeepdashExportLatest): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const day = new Date();
  const stamp = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  a.href = url;
  a.download = `deepdash-export-${stamp}.json`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type DeepdashJsonImportRunResult =
  | { ok: true }
  | { ok: false; errors: DeepdashImportError[] };

export type DeepdashImportError = {
  phase: DeepdashImportErrorPhase;
  module?: DeepdashImportModuleId;
  message: string;
};

export type DeepdashImportModuleId = "worldClock" | "pomodoro" | "todo" | "calculator";
export type DeepdashImportErrorPhase = "bundle" | "migration" | "import" | "rollback" | "backup";

/**
 * Full client pipeline: `JSON.parse` → migrate all slices → apply with rollback.
 * Does not reload the page.
 */
export function runDeepdashJsonImportFromText(text: string): DeepdashJsonImportRunResult {
  log.debug("deepdash import pipeline: JSON.parse");
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    log.error("deepdash import pipeline: invalid JSON", e);
    return {
      ok: false,
      errors: [{ phase: "bundle", message: `Invalid JSON: ${detail}` }],
    };
  }

  const mig = tryMigrateDeepdashBundle(raw);
  if (!mig.ok) {
    return { ok: false, errors: mig.errors };
  }

  const latest: DeepdashExportLatest = {
    version: CURRENT_DEEPDASH_EXPORT_VERSION,
    exportedAt: mig.exportedAt,
    worldClock: mig.worldClock,
    pomodoro: mig.pomodoro,
    todo: mig.todo,
    calculator: mig.calculator,
  };

  const applied = applyDeepdashImportWithRollback(latest);
  if (!applied.ok) {
    return { ok: false, errors: applied.errors };
  }
  return { ok: true };
}

export type TryMigrateDeepdashBundleResult =
  | {
      ok: true;
      exportedAt: string;
      worldClock: WorldClockExportV1;
      pomodoro: PomodoroExportV1;
      todo: TodoExportV2;
      calculator: CalculatorExportV1;
    }
  | { ok: false; errors: DeepdashImportError[] };

/**
 * Runs bundle validation and **all** per-module migrations, collecting every failure (does not stop at the first slice error).
 */
export function tryMigrateDeepdashBundle(raw: unknown): TryMigrateDeepdashBundleResult {
  log.debug("deepdash migration phase: start");
  const bundleErr = bundleValidationErrors(raw);
  if (bundleErr) {
    log.warn("deepdash migration phase: bundle validation failed", bundleErr);
    return { ok: false, errors: bundleErr };
  }

  const r = raw as Record<string, unknown>;
  const { exportedAt, worldClockPayload, pomodoroPayload, todoPayload, calculatorPayload } =
    extractSlicePayloads(r);

  log.debug("deepdash migration phase: slice payloads prepared", {
    exportedAt,
    worldClockKind: Array.isArray(worldClockPayload) ? "array" : typeof worldClockPayload,
  });

  const errors: DeepdashImportError[] = [];
  let worldClock: WorldClockExportV1 | undefined;
  let pomodoro: PomodoroExportV1 | undefined;
  let todo: TodoExportV2 | undefined;
  let calculator: CalculatorExportV1 | undefined;

  const trySlice = (module: DeepdashImportModuleId, fn: () => void): void => {
    try {
      fn();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log.error(`deepdash migration phase: ${module} failed`, e);
      errors.push({ phase: "migration", module, message });
    }
  };

  trySlice("worldClock", () => {
    worldClock = migrateWorldClockSliceToLatest(worldClockPayload);
  });
  trySlice("pomodoro", () => {
    pomodoro = migratePomodoroSliceToLatest(pomodoroPayload);
  });
  trySlice("todo", () => {
    todo = migrateTodoSliceToLatest(todoPayload);
  });
  trySlice("calculator", () => {
    calculator = migrateCalculatorSliceToLatest(calculatorPayload);
  });

  if (errors.length > 0) {
    log.warn("deepdash migration phase: completed with errors", {
      count: errors.length,
      modules: errors.map((x) => x.module).filter(Boolean),
    });
    return { ok: false, errors };
  }

  log.debug("deepdash migration phase: all slices ok");
  return {
    ok: true,
    exportedAt,
    worldClock: worldClock!,
    pomodoro: pomodoro!,
    todo: todo!,
    calculator: calculator!,
  };
}

export function formatDeepdashImportErrorsForUser(errors: DeepdashImportError[]): string {
  return errors
    .map((e) => {
      if (e.phase === "bundle" || e.phase === "backup") {
        return e.message;
      }
      if (e.module) {
        return `${e.phase} — ${e.module}: ${e.message}`;
      }
      return `${e.phase}: ${e.message}`;
    })
    .join("\n");
}

/** Applies a migrated bundle by delegating to each store (no rollback). Used for rollback replay only. */
function applyDeepdashImport(data: DeepdashExportLatest): void {
  if (typeof localStorage === "undefined") {
    throw new Error("Import is only available in the browser.");
  }
  worldClockActions.importData(data.worldClock);
  pomodoroActions.importData(data.pomodoro);
  todoActions.importData(data.todo);
  calculatorActions.importData(data.calculator);
}

type ApplyDeepdashImportWithRollbackResult =
  | { ok: true }
  | { ok: false; errors: DeepdashImportError[] };

/**
 * Snapshots current data, applies `data` module-by-module; on first failure rolls back the snapshot once (best-effort).
 */
export function applyDeepdashImportWithRollback(
  data: DeepdashExportLatest,
): ApplyDeepdashImportWithRollbackResult {
  log.debug("deepdash import phase: capturing backup");
  let backup: DeepdashExportLatest;
  try {
    backup = collectDeepdashExport();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("deepdash import phase: backup snapshot failed", e);
    return {
      ok: false,
      errors: [
        {
          phase: "backup",
          message: `Could not snapshot current data before import: ${message}`,
        },
      ],
    };
  }

  const steps: { module: DeepdashImportModuleId; run: () => void }[] = [
    { module: "worldClock", run: () => worldClockActions.importData(data.worldClock) },
    { module: "pomodoro", run: () => pomodoroActions.importData(data.pomodoro) },
    { module: "todo", run: () => todoActions.importData(data.todo) },
    { module: "calculator", run: () => calculatorActions.importData(data.calculator) },
  ];

  let importFailure: { module: DeepdashImportModuleId; message: string } | null = null;

  for (const { module, run } of steps) {
    try {
      log.debug(`deepdash import phase: applying ${module}`);
      run();
      log.debug(`deepdash import phase: ${module} applied`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log.error(`deepdash import phase: ${module} failed`, e);
      importFailure = { module, message };
      break;
    }
  }

  if (!importFailure) {
    log.debug("deepdash import phase: all modules applied");
    return { ok: true };
  }

  try {
    log.warn("deepdash import phase: rolling back to pre-import snapshot");
    applyDeepdashImport(backup);
    log.warn("deepdash import phase: rollback finished");
  } catch (rb: unknown) {
    const rbMsg = rb instanceof Error ? rb.message : String(rb);
    log.error("deepdash import phase: rollback failed", rb);
    return {
      ok: false,
      errors: [
        { phase: "import", module: importFailure.module, message: importFailure.message },
        {
          phase: "rollback",
          message: `Rollback after a failed ${importFailure.module} import also failed: ${rbMsg}. Data may be inconsistent; restore manually from an export file if needed.`,
        },
      ],
    };
  }

  return {
    ok: false,
    errors: [{ phase: "import", module: importFailure.module, message: importFailure.message }],
  };
}

function bundleValidationErrors(raw: unknown): DeepdashImportError[] | null {
  if (!isRecord(raw)) {
    return [{ phase: "bundle", message: "Import file is not a JSON object." }];
  }
  const bundleVersion = raw.version;
  if (bundleVersion !== CURRENT_DEEPDASH_EXPORT_VERSION) {
    return [
      {
        phase: "bundle",
        message:
          typeof bundleVersion === "number"
            ? `This export uses bundle version ${bundleVersion}, which is not supported. Update the app or use a compatible export file.`
            : "Import file is missing a supported export version.",
      },
    ];
  }
  return null;
}

function extractSlicePayloads(raw: Record<string, unknown>): {
  exportedAt: string;
  worldClockPayload: unknown;
  pomodoroPayload: unknown;
  todoPayload: unknown;
  calculatorPayload: unknown;
} {
  const exportedAt =
    typeof raw.exportedAt === "string" && raw.exportedAt.length > 0
      ? raw.exportedAt
      : new Date(0).toISOString();

  const worldClockPayload =
    raw.worldClock != null
      ? raw.worldClock
      : raw.worldClocks != null
        ? raw.worldClocks
        : { version: 1, clocks: [] };

  const pomodoroPayload = raw.pomodoro != null ? raw.pomodoro : {};

  const todoPayload =
    raw.todo != null
      ? raw.todo
      : {
          todosByDay: raw.todosByDay ?? {},
          todoRolloverMarkers: raw.todoRolloverMarkers ?? {},
        };

  const calculatorPayload = raw.calculator != null ? raw.calculator : {};

  return {
    exportedAt,
    worldClockPayload,
    pomodoroPayload,
    todoPayload,
    calculatorPayload,
  };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}
