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
  type TodoExportV1,
} from "@/app/_stores/todoStore";
import {
  migrateWorldClockSliceToLatest,
  worldClockActions,
  type WorldClockExportV1,
} from "@/app/_stores/worldClockStore";
import log from "@/lib/logger";

/** Bump when the **bundle** layout changes (not necessarily every slice bump). */
export const CURRENT_WORKTOOLS_EXPORT_VERSION = 1 as const;

export type WorktoolsExportLatest = {
  version: typeof CURRENT_WORKTOOLS_EXPORT_VERSION;
  exportedAt: string;
  worldClock: WorldClockExportV1;
  pomodoro: PomodoroExportV1;
  todo: TodoExportV1;
  calculator: CalculatorExportV1;
};

/** Builds the bundle from live stores / `localStorage` (browser only). */
export function collectWorktoolsExport(): WorktoolsExportLatest {
  if (typeof localStorage === "undefined") {
    throw new Error("Export is only available in the browser.");
  }
  flushTodoPersistToStorage();
  return {
    version: CURRENT_WORKTOOLS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    worldClock: worldClockActions.exportData(),
    pomodoro: pomodoroActions.exportData(),
    todo: todoActions.exportData(),
    calculator: calculatorActions.exportData(),
  };
}

export function downloadWorktoolsJson(data: WorktoolsExportLatest): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const day = new Date();
  const stamp = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  a.href = url;
  a.download = `worktools-export-${stamp}.json`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type WorktoolsJsonImportRunResult =
  | { ok: true }
  | { ok: false; errors: WorktoolsImportError[] };

export type WorktoolsImportError = {
  phase: WorktoolsImportErrorPhase;
  module?: WorktoolsImportModuleId;
  message: string;
};

export type WorktoolsImportModuleId = "worldClock" | "pomodoro" | "todo" | "calculator";
export type WorktoolsImportErrorPhase = "bundle" | "migration" | "import" | "rollback" | "backup";

/**
 * Full client pipeline: `JSON.parse` → migrate all slices → apply with rollback.
 * Does not reload the page.
 */
export function runWorktoolsJsonImportFromText(text: string): WorktoolsJsonImportRunResult {
  log.debug("worktools import pipeline: JSON.parse");
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    log.error("worktools import pipeline: invalid JSON", e);
    return {
      ok: false,
      errors: [{ phase: "bundle", message: `Invalid JSON: ${detail}` }],
    };
  }

  const mig = tryMigrateWorktoolsBundle(raw);
  if (!mig.ok) {
    return { ok: false, errors: mig.errors };
  }

  const latest: WorktoolsExportLatest = {
    version: CURRENT_WORKTOOLS_EXPORT_VERSION,
    exportedAt: mig.exportedAt,
    worldClock: mig.worldClock,
    pomodoro: mig.pomodoro,
    todo: mig.todo,
    calculator: mig.calculator,
  };

  const applied = applyWorktoolsImportWithRollback(latest);
  if (!applied.ok) {
    return { ok: false, errors: applied.errors };
  }
  return { ok: true };
}

export type TryMigrateWorktoolsBundleResult =
  | {
      ok: true;
      exportedAt: string;
      worldClock: WorldClockExportV1;
      pomodoro: PomodoroExportV1;
      todo: TodoExportV1;
      calculator: CalculatorExportV1;
    }
  | { ok: false; errors: WorktoolsImportError[] };

/**
 * Runs bundle validation and **all** per-module migrations, collecting every failure (does not stop at the first slice error).
 */
export function tryMigrateWorktoolsBundle(raw: unknown): TryMigrateWorktoolsBundleResult {
  log.debug("worktools migration phase: start");
  const bundleErr = bundleValidationErrors(raw);
  if (bundleErr) {
    log.warn("worktools migration phase: bundle validation failed", bundleErr);
    return { ok: false, errors: bundleErr };
  }

  const r = raw as Record<string, unknown>;
  const { exportedAt, worldClockPayload, pomodoroPayload, todoPayload, calculatorPayload } =
    extractSlicePayloads(r);

  log.debug("worktools migration phase: slice payloads prepared", {
    exportedAt,
    worldClockKind: Array.isArray(worldClockPayload) ? "array" : typeof worldClockPayload,
  });

  const errors: WorktoolsImportError[] = [];
  let worldClock: WorldClockExportV1 | undefined;
  let pomodoro: PomodoroExportV1 | undefined;
  let todo: TodoExportV1 | undefined;
  let calculator: CalculatorExportV1 | undefined;

  const trySlice = (module: WorktoolsImportModuleId, fn: () => void): void => {
    try {
      fn();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log.error(`worktools migration phase: ${module} failed`, e);
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
    log.warn("worktools migration phase: completed with errors", {
      count: errors.length,
      modules: errors.map((x) => x.module).filter(Boolean),
    });
    return { ok: false, errors };
  }

  log.debug("worktools migration phase: all slices ok");
  return {
    ok: true,
    exportedAt,
    worldClock: worldClock!,
    pomodoro: pomodoro!,
    todo: todo!,
    calculator: calculator!,
  };
}

export function formatWorktoolsImportErrorsForUser(errors: WorktoolsImportError[]): string {
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
function applyWorktoolsImport(data: WorktoolsExportLatest): void {
  if (typeof localStorage === "undefined") {
    throw new Error("Import is only available in the browser.");
  }
  worldClockActions.importData(data.worldClock);
  pomodoroActions.importData(data.pomodoro);
  todoActions.importData(data.todo);
  calculatorActions.importData(data.calculator);
}

type ApplyWorktoolsImportWithRollbackResult =
  | { ok: true }
  | { ok: false; errors: WorktoolsImportError[] };

/**
 * Snapshots current data, applies `data` module-by-module; on first failure rolls back the snapshot once (best-effort).
 */
export function applyWorktoolsImportWithRollback(
  data: WorktoolsExportLatest,
): ApplyWorktoolsImportWithRollbackResult {
  log.debug("worktools import phase: capturing backup");
  let backup: WorktoolsExportLatest;
  try {
    backup = collectWorktoolsExport();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("worktools import phase: backup snapshot failed", e);
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

  const steps: { module: WorktoolsImportModuleId; run: () => void }[] = [
    { module: "worldClock", run: () => worldClockActions.importData(data.worldClock) },
    { module: "pomodoro", run: () => pomodoroActions.importData(data.pomodoro) },
    { module: "todo", run: () => todoActions.importData(data.todo) },
    { module: "calculator", run: () => calculatorActions.importData(data.calculator) },
  ];

  let importFailure: { module: WorktoolsImportModuleId; message: string } | null = null;

  for (const { module, run } of steps) {
    try {
      log.debug(`worktools import phase: applying ${module}`);
      run();
      log.debug(`worktools import phase: ${module} applied`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log.error(`worktools import phase: ${module} failed`, e);
      importFailure = { module, message };
      break;
    }
  }

  if (!importFailure) {
    log.debug("worktools import phase: all modules applied");
    return { ok: true };
  }

  try {
    log.warn("worktools import phase: rolling back to pre-import snapshot");
    applyWorktoolsImport(backup);
    log.warn("worktools import phase: rollback finished");
  } catch (rb: unknown) {
    const rbMsg = rb instanceof Error ? rb.message : String(rb);
    log.error("worktools import phase: rollback failed", rb);
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

function bundleValidationErrors(raw: unknown): WorktoolsImportError[] | null {
  if (!isRecord(raw)) {
    return [{ phase: "bundle", message: "Import file is not a JSON object." }];
  }
  const bundleVersion = raw.version;
  if (bundleVersion !== CURRENT_WORKTOOLS_EXPORT_VERSION) {
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

