/**
 * Visual-line helpers for todo textareas (explicit \n and soft-wrapped lines).
 * Uses an off-screen mirror for layout-accurate line boundaries.
 * Arrow Up/Down **within** a field are left to the browser; we only hook at the first/last
 * visual line for cross-row navigation (see {@link isCaretOnFirstVisualLine},
 * {@link isCaretOnLastVisualLine}).
 */

let mirrorEl: HTMLDivElement | null = null;

function getMirror(): HTMLDivElement {
  if (!mirrorEl) {
    mirrorEl = document.createElement("div");
    mirrorEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(mirrorEl);
  }
  return mirrorEl;
}

function copyTextareaLayoutToMirror(textarea: HTMLTextAreaElement, mirror: HTMLDivElement): void {
  const cs = window.getComputedStyle(textarea);
  mirror.style.cssText = "";
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.left = "-99999px";
  mirror.style.top = "0";
  mirror.style.whiteSpace = cs.whiteSpace;
  mirror.style.wordWrap = cs.wordWrap;
  mirror.style.overflowWrap = cs.overflowWrap;
  mirror.style.wordBreak = cs.wordBreak;
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.boxSizing = cs.boxSizing;
  mirror.style.padding = cs.padding;
  mirror.style.border = cs.border;
  mirror.style.font = cs.font;
  mirror.style.lineHeight = cs.lineHeight;
  mirror.style.letterSpacing = cs.letterSpacing;
  mirror.style.textIndent = cs.textIndent;
  mirror.style.textTransform = cs.textTransform;
  mirror.style.textAlign = cs.textAlign;
}

/** Caret geometry at UTF-16 index `position`, relative to mirror content box. */
export function textareaCaretPoint(
  textarea: HTMLTextAreaElement,
  position: number,
): { top: number; left: number; lineHeight: number } {
  const mirror = getMirror();
  copyTextareaLayoutToMirror(textarea, mirror);
  const value = textarea.value;
  const safePos = Math.max(0, Math.min(position, value.length));
  const before = value.slice(0, safePos);
  const after = value.slice(safePos);
  const tail = document.createElement("span");
  tail.textContent = after.length > 0 ? after : "\u200b";

  mirror.replaceChildren();
  mirror.append(document.createTextNode(before), tail);

  const mirrorRect = mirror.getBoundingClientRect();
  const spanRect = tail.getBoundingClientRect();
  const lineHeight = lineHeightPxForTextarea(textarea, spanRect);
  return {
    top: spanRect.top - mirrorRect.top,
    left: spanRect.left - mirrorRect.left,
    lineHeight,
  };
}

/** Used line height in pixels (for comparing `top` / `getBoundingClientRect` values). */
function lineHeightPxForTextarea(textarea: HTMLTextAreaElement, spanRect: DOMRect): number {
  const cs = window.getComputedStyle(textarea);
  const lh = cs.lineHeight;
  const fs = parseFloat(cs.fontSize) || 16;
  if (lh === "normal") {
    return spanRect.height > 1 ? spanRect.height : fs * 1.2;
  }
  if (lh.endsWith("px")) {
    return parseFloat(lh);
  }
  const n = parseFloat(lh);
  // Unitless multiplier (e.g. "2.1") — must not be confused with pixel `top` values.
  if (!Number.isNaN(n) && n > 0 && n < 10 && !lh.includes("%")) {
    return n * fs;
  }
  if (lh.endsWith("%")) {
    return (parseFloat(lh) / 100) * fs;
  }
  return spanRect.height > 1 ? spanRect.height : fs * 1.2;
}

/** True when the caret is on the first visual line (used to delegate in-field ↑ to the browser). */
export function isCaretOnFirstVisualLine(
  textarea: HTMLTextAreaElement,
  caretIndex: number,
): boolean {
  return textareaVisualLineStartIndex(textarea, caretIndex) === 0;
}

/** True when the caret is on the last visual line (used to delegate in-field ↓ to the browser). */
export function isCaretOnLastVisualLine(
  textarea: HTMLTextAreaElement,
  caretIndex: number,
): boolean {
  const n = textarea.value.length;
  if (n === 0) return true;
  return (
    textareaVisualLineStartIndex(textarea, caretIndex) ===
    textareaVisualLineStartIndex(textarea, n)
  );
}

/** UTF-16 index of the first character on the visual line that contains `caretIndex`. */
export function textareaVisualLineStartIndex(
  textarea: HTMLTextAreaElement,
  caretIndex: number,
): number {
  const safe = Math.max(0, Math.min(caretIndex, textarea.value.length));
  if (safe === 0) return 0;
  const p = textareaCaretPoint(textarea, safe);
  const tCaret = p.top;
  const lh = p.lineHeight;
  let lo = 0;
  let hi = safe - 1;
  let boundary = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const t = textareaCaretPoint(textarea, mid).top;
    if (t < tCaret - lh * 0.2) {
      boundary = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return boundary + 1;
}

/** Character offset from the start of the current visual line to `caretIndex`. */
export function textareaVisualLineColumnOffset(
  textarea: HTMLTextAreaElement,
  caretIndex: number,
): number {
  const safe = Math.max(0, Math.min(caretIndex, textarea.value.length));
  const lineStart = textareaVisualLineStartIndex(textarea, safe);
  return safe - lineStart;
}

/** UTF-16 index of the first character on the last visual line (for caret at end of text). */
export function textareaLastVisualLineStartIndex(textarea: HTMLTextAreaElement): number {
  const n = textarea.value.length;
  if (n === 0) return 0;
  const pEnd = textareaCaretPoint(textarea, n);
  const tEnd = pEnd.top;
  const lh = pEnd.lineHeight;
  let lo = 0;
  let hi = n;
  let lineStart = n;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const t = textareaCaretPoint(textarea, mid).top;
    if (t >= tEnd - lh * 0.25) {
      lineStart = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return lineStart;
}

/**
 * Caret index on the target field’s last visual line, `columnOffset` chars from that line’s start (clamped).
 */
export function textareaCaretIndexOnLastVisualLine(
  textarea: HTMLTextAreaElement,
  columnOffset: number,
): number {
  const n = textarea.value.length;
  if (n === 0) return 0;
  const lineStart = textareaLastVisualLineStartIndex(textarea);
  const lineLen = n - lineStart;
  const col = Math.max(0, Math.min(columnOffset, lineLen));
  return lineStart + col;
}

/**
 * Largest caret index still on the first visual line (same convention as {@link textareaCaretIndexOnLastVisualLine}).
 */
function textareaFirstVisualLineMaxCaretIndex(textarea: HTMLTextAreaElement): number {
  const n = textarea.value.length;
  if (n === 0) return 0;
  let lo = 0;
  let hi = n;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (textareaVisualLineStartIndex(textarea, mid) === 0) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Caret index on the first visual line, `columnOffset` characters from that line’s start (clamped).
 * Pairs with {@link textareaCaretIndexOnLastVisualLine} for ArrowDown / ArrowUp between rows.
 */
export function textareaCaretIndexOnFirstVisualLine(
  textarea: HTMLTextAreaElement,
  columnOffset: number,
): number {
  const n = textarea.value.length;
  if (n === 0) return 0;
  const lineStart = textareaVisualLineStartIndex(textarea, 0);
  const maxCaret = textareaFirstVisualLineMaxCaretIndex(textarea);
  const lineSpan = maxCaret - lineStart;
  const col = Math.max(0, Math.min(columnOffset, lineSpan));
  return lineStart + col;
}
