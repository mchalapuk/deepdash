import type { KeyboardEvent } from "react";

/**
 * Enter splits into two tasks; Shift+Enter keeps the default newline.
 * Ctrl/Cmd+Enter is handled separately for trailing (commit full draft).
 */
export function isSplitEnter(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing;
}
