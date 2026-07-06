import { proxy, useSnapshot } from "valtio";
import { subscribe } from "valtio/vanilla";
import log from "@/lib/logger";
import { TAG_COLOR_STORAGE_KEY } from "@/lib/persistKeys";

const STORAGE_KEY = TAG_COLOR_STORAGE_KEY;

/** Standard Mantine theme colors (excludes `gray`/`dark`, which read as neutral rather than tag-like). */
const TAG_COLOR_PALETTE = [
  "pink",
  "violet",
  "grape",
  "cyan",
  "gray",
] as const;

export const TAG_COLOR_EXPORT_VERSION = 1 as const;

const tagColorStore = proxy({
  /**
   * When false, subscribe must not write to localStorage until `loadFromStorage()` finishes —
   * defaults in memory would overwrite the user’s saved colors before load completes.
   */
  hydrated: false,
  /** Random Mantine color name per normalized `[tag]` text; assigned once, reused thereafter. */
  colors: {} as Record<string, string>,
});

/** Persisted: normalized tag text → Mantine color name. */
export type TagColorsV1 = {
  colors: Record<string, string>;
};

export type TagColorExportV1 = {
  version: typeof TAG_COLOR_EXPORT_VERSION;
  colors: Record<string, string>;
};

/** Normalizes `[tag]` text so "Errand" and "errand" share a color. */
export function normalizeTagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

export function useTagColors(): Record<string, string> {
  return useSnapshot(tagColorStore).colors;
}

export const tagColorActions = {
  init: function init(): () => void {
    loadFromStorage();
    return subscribe(tagColorStore, () => {
      if (!tagColorStore.hydrated) return;
      persistIfChanged();
    });
  },

  /** Assigns a random palette color to `tag` if it doesn't have one yet; no-op otherwise. */
  ensureColor: function ensureColor(tag: string): void {
    const key = normalizeTagKey(tag);
    if (!key || tagColorStore.colors[key]) return;
    const color = pickLeastUsedPaletteColor();
    tagColorStore.colors[key] = color;
    lastAssignedColor = color;
  },

  exportData: function exportData(): TagColorExportV1 {
    return {
      version: TAG_COLOR_EXPORT_VERSION,
      colors: pickPersisted().colors,
    };
  },

  /** Accepts `{ version, colors }` or a legacy/absent slice (treated as empty). */
  importData: function importData(data: unknown): void {
    const slice = migrateTagColorSliceToLatest(data);
    tagColorStore.colors = slice.colors;
    if (typeof window === "undefined") return;
    lastColorsJson = JSON.stringify(pickPersisted());
    storageSetItemStrict(STORAGE_KEY, lastColorsJson);
  },
};

/**
 * Color assigned by the most recent {@link ensureColor} call, so {@link pickLeastUsedPaletteColor}
 * can avoid repeating it back-to-back at round boundaries (within a round, usage counts already
 * rule out repeats on their own).
 */
let lastAssignedColor: string | undefined;

/**
 * Picks a random color among those currently used the least often across all assigned tags, so
 * every palette color is handed out once before any repeats, then again for a second round, and so
 * on — instead of a plain uniform pick, which could reuse a color while others sit unused. Avoids
 * repeating {@link lastAssignedColor} unless it's the only least-used color left to pick from.
 */
function pickLeastUsedPaletteColor(): string {
  const usageCounts = new Map<string, number>(TAG_COLOR_PALETTE.map((c) => [c, 0]));
  for (const assigned of Object.values(tagColorStore.colors)) {
    const count = usageCounts.get(assigned);
    if (count !== undefined) usageCounts.set(assigned, count + 1);
  }
  const minCount = Math.min(...usageCounts.values());
  const leastUsed = TAG_COLOR_PALETTE.filter((c) => usageCounts.get(c) === minCount);
  const candidates =
    leastUsed.length > 1 ? leastUsed.filter((c) => c !== lastAssignedColor) : leastUsed;
  const i = Math.floor(Math.random() * candidates.length);
  return candidates[i]!;
}

// --- storage ---

let lastColorsJson = "";

function pickPersisted(): TagColorsV1 {
  return { colors: { ...tagColorStore.colors } };
}

function storageSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e: unknown) {
    log.warn("tagColor: localStorage setItem failed", key, e);
  }
}

function storageSetItemStrict(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`tagColor: could not write ${key} (${detail})`);
  }
}

function persistIfChanged(): void {
  if (typeof window === "undefined") return;
  const s = JSON.stringify(pickPersisted());
  if (s === lastColorsJson) return;
  lastColorsJson = s;
  storageSetItem(STORAGE_KEY, s);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isPaletteColor(x: unknown): x is (typeof TAG_COLOR_PALETTE)[number] {
  return typeof x === "string" && (TAG_COLOR_PALETTE as readonly string[]).includes(x);
}

function parseColorsRecord(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isPaletteColor(value)) out[key] = value;
  }
  return out;
}

function loadFromStorage(): void {
  if (typeof window === "undefined") {
    tagColorStore.hydrated = true;
    return;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isRecord(parsed)) {
        tagColorStore.colors = parseColorsRecord(parsed.colors);
      }
    }
  } catch (e: unknown) {
    log.error("tagColor: failed to load from storage", e);
    tagColorStore.colors = {};
  }
  lastColorsJson = JSON.stringify(pickPersisted());
  tagColorStore.hydrated = true;
}

/** Normalize any supported tag-color slice to {@link TagColorExportV1}. Absent/legacy shapes default to empty. */
export function migrateTagColorSliceToLatest(data: unknown): TagColorExportV1 {
  log.debug("tagColor migration: start");
  if (!isRecord(data)) {
    log.debug("tagColor migration: no slice, defaulting to empty");
    return { version: TAG_COLOR_EXPORT_VERSION, colors: {} };
  }
  const v = data.version;
  if (v !== undefined && v !== TAG_COLOR_EXPORT_VERSION) {
    log.error("tagColor migration: unsupported version", { version: v });
    throw new Error(
      `tagColor: unsupported export slice version ${String(v)}. Update the app or re-export your data.`,
    );
  }
  const colors = parseColorsRecord(data.colors);
  log.debug("tagColor migration: ok", { count: Object.keys(colors).length });
  return { version: TAG_COLOR_EXPORT_VERSION, colors };
}

/** @internal */
export function __resetTagColorStoreForTests(): void {
  tagColorStore.colors = {};
  tagColorStore.hydrated = false;
  lastColorsJson = "";
  lastAssignedColor = undefined;
}

/** @internal */
export function __tagColorPaletteSizeForTests(): number {
  return TAG_COLOR_PALETTE.length;
}
