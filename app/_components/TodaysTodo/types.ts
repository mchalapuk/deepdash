import type { PointerEvent, RefObject } from "react";

import type { TodoItem, TodoListKind } from "@/app/_stores/todoStore";

/** Trailing “add task” field: value, setter, commit. */
export type TodaysTodoDraftApi = {
  draft: string;
  setDraft: (v: string) => void;
  commitTrailing: (raw: string) => void;
};

/** Focus, refs, list edges, and trailing-field length shared by persisted rows and the add row. */
export type TodaysTodoFocusApi = {
  focusedId: string | null;
  /** Target list for the trailing add row (scroll-driven). Persisted rows use their own `listKind`. */
  listKind: TodoListKind;
  trailingDraftLength: number;
  setRowInputRef: (itemId: string) => (el: HTMLTextAreaElement | null) => void;
  setTrailingInputRef: (el: HTMLTextAreaElement | null) => void;
  focusRow: (id: string, pos: number) => void;
  /** Arrow up from the row below: caret on last visual line, matching column. */
  focusRowFromBelow: (id: string, columnOffset: number) => void;
  focusTrailing: (pos: number) => void;
  /** Last “today” row ↓: first backlog row, or trailing if backlog empty. */
  arrowDownFromLastToday: (column: number) => void;
  /** First “backlog” row ↑: last “today” row, or trailing if today empty. */
  arrowUpFromFirstBacklog: (column: number) => void;
};

/** Row roots, grip handler, and active drag id for task reordering. */
export type TodaysTodoDragApi = {
  registerRowRoot: (id: string) => (el: HTMLElement | null) => void;
  onGripPointerDown: (itemId: string) => (e: PointerEvent<HTMLElement>) => void;
  draggingId: string | null;
};

export type TodaysTodoUnifiedMechanics = {
  hydrated: boolean;
  todayItems: readonly TodoItem[];
  backlogItems: readonly TodoItem[];
  draftAPI: TodaysTodoDraftApi;
  focusAPI: TodaysTodoFocusApi;
  lastRowScrollRef: RefObject<HTMLDivElement | null>;
  dragAPIToday: TodaysTodoDragApi;
  dragAPIBacklog: TodaysTodoDragApi;
};

export type TodoPersistedRowProps = {
  item: TodoItem;
  index: number;
  items: readonly TodoItem[];
  listKind: TodoListKind;
  focusAPI: TodaysTodoFocusApi;
  dragAPI: TodaysTodoDragApi;
};

export type TodoTrailingRowProps = {
  draftAPI: TodaysTodoDraftApi;
  lastItem: TodoItem | null;
  focusAPI: TodaysTodoFocusApi;
};
