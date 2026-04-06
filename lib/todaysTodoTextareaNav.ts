/**
 * Visual-line caret movement for todo textareas (explicit \n and soft-wrapped lines).
 * Uses an off-screen mirror div with the same width and text styles as the textarea.
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
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
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
  const cs = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(cs.lineHeight) || spanRect.height || 16;
  return {
    top: spanRect.top - mirrorRect.top,
    left: spanRect.left - mirrorRect.left,
    lineHeight,
  };
}

function approxSameLine(a: number, b: number, lh: number): boolean {
  return Math.abs(a - b) < lh * 0.35;
}

/**
 * Move caret one visual line up/down inside the textarea.
 * @returns true if the caret moved within the field; false → cross-field navigation.
 */
export function moveTextareaCaretOneVisualLine(
  textarea: HTMLTextAreaElement,
  direction: -1 | 1,
): boolean {
  const value = textarea.value;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  if (start !== end || value.length === 0) return false;

  const pStart = textareaCaretPoint(textarea, start);
  const lh = pStart.lineHeight || 16;
  const topStart = pStart.top;

  if (direction === -1) {
    if (start === 0) return false;

    let lo = 0;
    let hi = start - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const t = textareaCaretPoint(textarea, mid).top;
      if (t < topStart - lh * 0.2) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best < 0) return false;

    const tPrev = textareaCaretPoint(textarea, best).top;
    let lineStart = best;
    while (
      lineStart > 0 &&
      approxSameLine(textareaCaretPoint(textarea, lineStart - 1).top, tPrev, lh)
    ) {
      lineStart--;
    }
    let lineEnd = best;
    while (
      lineEnd < start - 1 &&
      approxSameLine(textareaCaretPoint(textarea, lineEnd + 1).top, tPrev, lh)
    ) {
      lineEnd++;
    }

    const col = textareaVisualLineColumnOffset(textarea, start);
    const bestPos = Math.min(lineStart + col, lineEnd);
    textarea.focus();
    textarea.setSelectionRange(bestPos, bestPos);
    return true;
  }

  // direction === 1
  if (start === value.length) return false;

  const topAtEnd = textareaCaretPoint(textarea, value.length).top;
  if (topStart >= topAtEnd - lh * 0.12) return false;

  let lo = start + 1;
  let hi = value.length;
  let firstOnNext = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const t = textareaCaretPoint(textarea, mid).top;
    if (t > topStart + lh * 0.15) {
      firstOnNext = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  if (firstOnNext < 0) return false;

  const tNext = textareaCaretPoint(textarea, firstOnNext).top;
  let lineStart = firstOnNext;
  while (
    lineStart > start &&
    approxSameLine(textareaCaretPoint(textarea, lineStart - 1).top, tNext, lh)
  ) {
    lineStart--;
  }
  let lineEnd = firstOnNext;
  while (
    lineEnd < value.length &&
    approxSameLine(textareaCaretPoint(textarea, lineEnd + 1).top, tNext, lh)
  ) {
    lineEnd++;
  }

  const col = textareaVisualLineColumnOffset(textarea, start);
  const bestPos = Math.min(lineStart + col, lineEnd);
  textarea.focus();
  textarea.setSelectionRange(bestPos, bestPos);
  return true;
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
