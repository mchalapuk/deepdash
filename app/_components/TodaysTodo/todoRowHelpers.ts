import type { KeyboardEvent } from "react";

/**
 * Enter splits into two tasks; Shift+Enter keeps the default newline.
 * Ctrl/Cmd+Enter is handled separately for trailing (commit full draft).
 */
export function isSplitEnter(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing;
}

export type TodoTextSegment =
  | { kind: "text"; value: string }
  | { kind: "tag"; value: string };

/** Splits task text on `[tag]` runs so callers can render tags as Pills. */
export function parseTodoTextSegments(text: string): TodoTextSegment[] {
  const segments: TodoTextSegment[] = [];
  const re = /\[([^[\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "tag", value: match[1]! });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return segments;
}
