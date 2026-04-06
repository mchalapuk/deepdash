"use client";

import {
  ActionIcon,
  Box,
  Checkbox,
  Group,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  Textarea,
  Space,
  VisuallyHidden,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { todoActions, useTodoList, type TodoItem } from "@/app/_stores/todoStore";
import { usePhaseColor, usePhaseBackgroundColor } from "@/lib/layout";
import log from "@/lib/logger";
import {
  moveTextareaCaretOneVisualLine,
  textareaCaretIndexOnLastVisualLine,
  textareaVisualLineColumnOffset,
} from "@/lib/todaysTodoTextareaNav";

/** Trailing “add task” field: value, setter, commit. */
type TodaysTodoDraftApi = {
  draft: string;
  setDraft: (v: string) => void;
  commitTrailing: (raw: string) => void;
};

/** Focus, refs, list edges, and trailing-field length shared by persisted rows and the add row. */
type TodaysTodoFocusApi = {
  trailingDraftLength: number;
  persistedItemCount: number;
  setRowInputRef: (itemId: string) => (el: HTMLTextAreaElement | null) => void;
  setTrailingInputRef: (el: HTMLTextAreaElement | null) => void;
  focusRow: (id: string, pos: number) => void;
  /** Arrow up from the row below: caret on last visual line, matching column. */
  focusRowFromBelow: (id: string, columnOffset: number) => void;
  focusTrailing: (pos: number) => void;
  isFirstRow: (rowIndex: number) => boolean;
  isLastRow: (rowIndex: number) => boolean;
};

export function TodaysTodo() {
  const {
    hydrated,
    items,
    draftAPI,
    focusAPI,
    lastRowScrollRef,
  } = useTodaysTodoMechanics();
  const backgroundColor = usePhaseBackgroundColor();

  return (
    <Stack
      gap={0}
      w="100%"
      h="100%"
      className="min-h-0"
      style={{ overflow: "hidden" }}
    >
      <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
        Today&apos;s tasks
      </Text>
      <ScrollArea
        pr={18}
        pos="relative"
        mt={8}
        mb={8}
        style={{ minHeight: 0, flexGrow: 1 }}
        styles={{
          thumb: { backgroundColor: "green.8", opacity: 0.5 },
        }}
      >
        {!hydrated ? (
          <TodaysTodoTasksSkeleton />
        ) : (
          <Stack gap={0} pr={6} pb={4}>
            {items.map((item, index) => (
              <TodoPersistedRow
                key={item.id}
                item={item}
                index={index}
                items={items}
                focusAPI={focusAPI}
              />
            ))}
          </Stack>
        )}
        <Space h={28} ref={lastRowScrollRef} />
        <div className="absolute bottom-0 left-0 w-full h-[40px]" style={{
          background: `linear-gradient(to top, ${backgroundColor}, transparent)`,
        }} />
      </ScrollArea>
      <Box style={{ flexShrink: 0 }}>
        <TodoTrailingRow
          draftAPI={draftAPI}
          lastItem={items.length > 0 ? items[items.length - 1]! : null}
          focusAPI={focusAPI}
        />
      </Box>
    </Stack>
  );
}

/** Mimics {@link TodoPersistedRow} layout while todo storage hydrates. */
function TodaysTodoTasksSkeleton() {
  const barWidths = ["88%", "74%", "92%", "67%", "81%"] as const;

  return (
    <Stack gap={12} role="status" aria-live="polite" aria-busy="true" opacity={0.5} pt={6}>
      <VisuallyHidden>Loading tasks</VisuallyHidden>
      {barWidths.map((width, index) => (
        <Group key={index} wrap="nowrap" gap={7} align="flex-start" w="100%" pl={6}>
          <Skeleton circle height={16} flex="0 0 auto" mt={1} aria-hidden animate />
          <Box flex={1} miw={0}>
            <Skeleton height={18} radius="sm" width={width} aria-hidden animate />
          </Box>
        </Group>
      ))}
    </Stack>
  );
}

type TodoPersistedRowProps = {
  item: TodoItem;
  index: number;
  items: readonly TodoItem[];
  focusAPI: TodaysTodoFocusApi;
};

function TodoPersistedRow({
  item,
  index,
  items,
  focusAPI,
}: TodoPersistedRowProps) {
  const { id, text, done } = item;
  const {
    composeInputRef,
    onBlurPersisted,
    onKeyDown,
    onChange,
  } = usePersistedTodoRowInput({
    id,
    text,
    index,
    items,
    focusAPI,
  });

  return (
    <Group wrap="nowrap" gap={7} align="flex-start" w="100%" pl={6}>
      <Checkbox
        checked={done}
        onChange={() => todoActions.toggleDone(id)}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        size="xs"
        color="gray.7"
        opacity={0.9}
        pos="relative"
        top={9}
      />
      <Textarea
        ref={composeInputRef}
        flex={1}
        size="sm"
        minRows={1}
        autosize
        maxRows={12}
        mb={-6}
        value={text}
        onChange={onChange}
        onBlur={onBlurPersisted}
        onKeyDown={onKeyDown}
        variant="unstyled"
        resize="none"
        styles={{
          input: {
            paddingTop: "2px",
            paddingBottom: "2px",
            lineHeight: 2,
            ...(done
              ? {
                  textDecoration: "line-through",
                  opacity: 0.55,
                }
              : {}
            ),
          },
        }}
      />
    </Group>
  );
}

type TodoTrailingRowProps = {
  draftAPI: TodaysTodoDraftApi;
  lastItem: TodoItem | null;
  focusAPI: TodaysTodoFocusApi;
};

function TodoTrailingRow({
  draftAPI,
  lastItem,
  focusAPI,
}: TodoTrailingRowProps) {
  const color = usePhaseColor();
  const {
    bindRef,
    onBlurTrailing,
    onKeyDown,
    onChange,
    onAddButtonClick,
  } = useTrailingTodoRowInput({
    draftAPI,
    lastItem,
    focusAPI,
  });

  return (
    <Group wrap="nowrap" gap={5.5} align="flex-start" w="100%" pos="relative">
      <ActionIcon
        variant="light"
        color={color}
        opacity={0.95}
        size="sm"
        aria-label="Add task"
        radius="sm"
        onClick={onAddButtonClick}
        style={{
          position: "absolute",
          bottom: "5px",
          left: "3px",
        }}
      >
        <IconPlus size={12} stroke={3} />
      </ActionIcon>
      <Textarea
        ref={bindRef}
        flex={1}
        size="sm"
        minRows={1}
        autosize
        maxRows={1}
        placeholder="Add a task…"
        value={draftAPI.draft}
        variant="unstyled"
        resize="none"
        pl={28}
        onChange={onChange}
        onBlur={onBlurTrailing}
        onKeyDown={onKeyDown}
        styles={{
          input: {
            paddingTop: "0px",
            paddingBottom: "0px",
            lineHeight: 2,
            minHeight: "30px",
            maxHeight: "30px",
          },
        }}
      />
    </Group>
  );
}

type TodaysTodoMechanics = {
  hydrated: boolean;
  items: readonly TodoItem[];
  draftAPI: TodaysTodoDraftApi;
  focusAPI: TodaysTodoFocusApi;
  lastRowScrollRef: RefObject<HTMLDivElement | null>;
};

function useTodaysTodoMechanics(): TodaysTodoMechanics {
  const { hydrated, items } = useTodoList();
  const [trailingDraft, setTrailingDraft] = useState("");
  const trailingRef = useRef<HTMLTextAreaElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const lastRowScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollBaselineLen = useRef<number | null>(null);
  const scrollBaselineLastId = useRef<string | undefined>(undefined);

  useEffect(() => {
    return todoActions.init();
  }, []);

  useLayoutEffect(() => {
    if (!hydrated) return;
    const len = items.length;
    const lastId = len > 0 ? items[len - 1]!.id : undefined;
    if (scrollBaselineLen.current === null) {
      scrollBaselineLen.current = len;
      scrollBaselineLastId.current = lastId;
      return;
    }
    const appended =
      len > scrollBaselineLen.current &&
      len > 0 &&
      lastId !== scrollBaselineLastId.current;
    scrollBaselineLen.current = len;
    scrollBaselineLastId.current = lastId;
    if (appended) {
      lastRowScrollRef.current?.scrollIntoView({
        block: "end",
        behavior: "smooth",
      });
    }
  }, [
    hydrated,
    items.length,
    items.length > 0 ? items[items.length - 1]!.id : "",
  ]);

  const focusRow = useCallback((id: string, pos: number) => {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const el = rowRefs.current[id];
        if (!el) return;
        el.focus();
        try {
          el.setSelectionRange(pos, pos);
        } catch (e: unknown) {
          log.warn("todaysTodo: focusRow setSelectionRange failed", e);
        }
      });
    });
  }, []);

  const focusRowFromBelow = useCallback((id: string, columnOffset: number) => {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const tel = rowRefs.current[id];
        if (!tel) return;
        tel.focus();
        const pos = textareaCaretIndexOnLastVisualLine(tel, columnOffset);
        try {
          tel.setSelectionRange(pos, pos);
        } catch (e: unknown) {
          log.warn("todaysTodo: focusRowFromBelow setSelectionRange failed", e);
        }
      });
    });
  }, []);

  const focusTrailing = useCallback((pos: number) => {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const el = trailingRef.current;
        if (!el) return;
        el.focus();
        try {
          el.setSelectionRange(pos, pos);
        } catch (e: unknown) {
          log.warn("todaysTodo: focusTrailing setSelectionRange failed", e);
        }
      });
    });
  }, []);

  const commitTrailing = useCallback(
    (raw: string) => {
      const text = raw.replace(/\s+$/, "");
      if (text.trim() === "") return;
      todoActions.addItem(text, false);
      setTrailingDraft("");
      focusTrailing(0);
    },
    [focusTrailing],
  );

  const setRowInputRef = useCallback((itemId: string) => {
    return (el: HTMLTextAreaElement | null) => {
      if (el) rowRefs.current[itemId] = el;
      else delete rowRefs.current[itemId];
    };
  }, []);

  const setTrailingInputRef = useCallback((el: HTMLTextAreaElement | null) => {
    trailingRef.current = el;
  }, []);

  const focusAPI = useMemo<TodaysTodoFocusApi>(
    () => ({
      trailingDraftLength: trailingDraft.length,
      persistedItemCount: items.length,
      setRowInputRef,
      setTrailingInputRef,
      focusRow,
      focusRowFromBelow,
      focusTrailing,
      isFirstRow: (rowIndex: number) => rowIndex === 0,
      isLastRow: (rowIndex: number) => rowIndex === items.length - 1,
    }),
    [
      trailingDraft.length,
      items.length,
      setRowInputRef,
      setTrailingInputRef,
      focusRow,
      focusRowFromBelow,
      focusTrailing,
    ],
  );

  const draftAPI = useMemo<TodaysTodoDraftApi>(
    () => ({
      draft: trailingDraft,
      setDraft: setTrailingDraft,
      commitTrailing,
    }),
    [trailingDraft, setTrailingDraft, commitTrailing],
  );

  return {
    hydrated,
    items,
    draftAPI,
    focusAPI,
    lastRowScrollRef,
  };
}

type UsePersistedTodoRowInputArgs = {
  id: string;
  text: string;
  index: number;
  items: readonly TodoItem[];
  focusAPI: TodaysTodoFocusApi;
};

function usePersistedTodoRowInput({
  id,
  text,
  index,
  items,
  focusAPI,
}: UsePersistedTodoRowInputArgs): {
  composeInputRef: (el: HTMLTextAreaElement | null) => void;
  onBlurPersisted: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onChange: (ev: ChangeEvent<HTMLTextAreaElement>) => void;
} {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionAfterChangeRef = useRef<{ start: number; end: number } | null>(
    null,
  );

  const {
    focusRow,
    focusRowFromBelow,
    focusTrailing,
    trailingDraftLength,
    setRowInputRef,
  } = focusAPI;

  useLayoutEffect(() => {
    const el = inputRef.current;
    const sel = selectionAfterChangeRef.current;
    if (!el || sel == null) return;
    if (document.activeElement !== el) {
      selectionAfterChangeRef.current = null;
      return;
    }
    try {
      el.setSelectionRange(sel.start, sel.end);
    } catch (e: unknown) {
      log.warn("todaysTodo: persisted row setSelectionRange failed", e);
    }
    selectionAfterChangeRef.current = null;
  }, [text, id]);

  const composeInputRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      inputRef.current = el;
      setRowInputRef(id)(el);
    },
    [id, setRowInputRef],
  );

  const onBlurPersisted = useCallback(() => {
    const rid = id;
    window.setTimeout(() => {
      todoActions.removeItemIfEmpty(rid);
    }, 0);
  }, [id]);

  const onChange = useCallback(
    (ev: ChangeEvent<HTMLTextAreaElement>) => {
      const t = ev.currentTarget;
      selectionAfterChangeRef.current = {
        start: t.selectionStart ?? 0,
        end: t.selectionEnd ?? 0,
      };
      todoActions.setItemText(id, t.value);
    },
    [id],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const isFirst = index === 0;
      const isLast = index === items.length - 1;
      const el = e.currentTarget;
      const value = el.value;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const collapsed = start === end;
      const noFieldNavMod = !e.altKey && !e.ctrlKey && !e.metaKey;

      if (e.key === "Escape") {
        e.preventDefault();
        el.blur();
        return;
      }

      if (noFieldNavMod && collapsed && e.key === "ArrowUp") {
        if (moveTextareaCaretOneVisualLine(el, -1)) {
          e.preventDefault();
          return;
        }
        if (!isFirst) {
          e.preventDefault();
          const prev = items[index - 1]!;
          const col = textareaVisualLineColumnOffset(el, start);
          focusRowFromBelow(prev.id, col);
        }
        return;
      }

      if (noFieldNavMod && collapsed && e.key === "ArrowDown") {
        if (moveTextareaCaretOneVisualLine(el, 1)) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        if (isLast) {
          focusTrailing(clampColumn(start, trailingDraftLength));
        } else {
          const next = items[index + 1]!;
          focusRow(next.id, clampColumn(start, next.text.length));
        }
        return;
      }

      if (noFieldNavMod && collapsed && e.key === "ArrowLeft" && start === 0) {
        if (!isFirst) {
          e.preventDefault();
          const prev = items[index - 1]!;
          focusRow(prev.id, prev.text.length);
        }
        return;
      }

      if (noFieldNavMod && collapsed && e.key === "ArrowRight" && start === value.length) {
        e.preventDefault();
        if (isLast) {
          focusTrailing(0);
        } else {
          const next = items[index + 1]!;
          focusRow(next.id, 0);
        }
        return;
      }

      if (isSplitEnter(e)) {
        if (!collapsed) return;
        e.preventDefault();
        if (start === 0) {
          const newId = todoActions.insertEmptyAt(index);
          focusRow(newId, 0);
          return;
        }
        if (start === value.length) {
          const newId = todoActions.insertEmptyAt(index + 1);
          focusRow(newId, 0);
          return;
        }
        const newId = todoActions.splitItemAt(id, start);
        if (newId) focusRow(newId, 0);
        return;
      }

      if (e.key === "Backspace" && collapsed) {
        if (value === "") {
          e.preventDefault();
          todoActions.removeItem(id);
          if (!isFirst) {
            const prev = items[index - 1];
            if (prev) focusRow(prev.id, prev.text.length);
            else focusTrailing(0);
          } else {
            focusTrailing(0);
          }
          return;
        }
        if (start === 0 && !isFirst) {
          e.preventDefault();
          const prev = items[index - 1]!;
          const caret = prev.text.length + 1;
          todoActions.mergeWithPrev(id);
          focusRow(prev.id, caret);
        }
        return;
      }

      if (e.key === "Delete" && collapsed) {
        if (value === "") {
          e.preventDefault();
          todoActions.removeItem(id);
          if (!isLast) {
            const next = items[index + 1];
            if (next) focusRow(next.id, 0);
            else focusTrailing(0);
          } else {
            focusTrailing(0);
          }
          return;
        }
        if (start === value.length && !isLast) {
          e.preventDefault();
          const caret = value.length + 1;
          todoActions.mergeWithNext(id);
          focusRow(id, caret);
        }
      }
    },
    [
      id,
      index,
      items,
      focusRow,
      focusRowFromBelow,
      focusTrailing,
      trailingDraftLength,
    ],
  );

  return {
    composeInputRef,
    onBlurPersisted,
    onKeyDown,
    onChange,
  };
}

type UseTrailingTodoRowInputArgs = {
  draftAPI: TodaysTodoDraftApi;
  lastItem: TodoItem | null;
  focusAPI: TodaysTodoFocusApi;
};

function useTrailingTodoRowInput({
  draftAPI,
  lastItem,
  focusAPI,
}: UseTrailingTodoRowInputArgs): {
  bindRef: (el: HTMLTextAreaElement | null) => void;
  onBlurTrailing: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onChange: (ev: ChangeEvent<HTMLTextAreaElement>) => void;
  onAddButtonClick: () => void;
} {
  const { draft, setDraft, commitTrailing } = draftAPI;
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const trailingSelectionRef = useRef<{ start: number; end: number } | null>(
    null,
  );
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const {
    focusRow,
    focusRowFromBelow,
    focusTrailing,
    setTrailingInputRef,
    persistedItemCount,
  } = focusAPI;

  useLayoutEffect(() => {
    const el = innerRef.current;
    const sel = trailingSelectionRef.current;
    if (!el || sel == null) return;
    if (document.activeElement !== el) {
      trailingSelectionRef.current = null;
      return;
    }
    try {
      el.setSelectionRange(sel.start, sel.end);
    } catch (e: unknown) {
      log.warn("todaysTodo: trailing row setSelectionRange failed", e);
    }
    trailingSelectionRef.current = null;
  }, [draft]);

  const bindRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      setTrailingInputRef(el);
    },
    [setTrailingInputRef],
  );

  const onBlurTrailing = useCallback(() => {
    const raw = draftRef.current;
    if (raw.trim() === "") return;
    commitTrailing(raw);
  }, [commitTrailing]);

  const onChange = useCallback(
    (ev: ChangeEvent<HTMLTextAreaElement>) => {
      const t = ev.currentTarget;
      trailingSelectionRef.current = {
        start: t.selectionStart ?? 0,
        end: t.selectionEnd ?? 0,
      };
      setDraft(t.value);
    },
    [setDraft],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      const value = el.value;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const collapsed = start === end;
      const noFieldNavMod = !e.altKey && !e.ctrlKey && !e.metaKey;

      if (e.key === "Escape") {
        e.preventDefault();
        setDraft("");
        draftRef.current = "";
        el.blur();
        return;
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.nativeEvent.isComposing
      ) {
        e.preventDefault();
        if (value.trim() === "") return;
        commitTrailing(value);
        return;
      }

      if (isSplitEnter(e)) {
        if (!collapsed) return;
        if (value.trim() === "") return;
        e.preventDefault();

        if (start === 0 && value.length > 0) {
          const newId = todoActions.insertEmptyAt(persistedItemCount);
          focusRow(newId, 0);
          return;
        }
        if (start === value.length && value.length > 0) {
          const newId = todoActions.insertEmptyAt(persistedItemCount);
          focusRow(newId, 0);
          return;
        }
        if (start > 0 && start < value.length) {
          const left = value.slice(0, start);
          const right = value.slice(start);
          todoActions.addItem(left, false);
          setDraft(right);
          draftRef.current = right;
          trailingSelectionRef.current = { start: 0, end: 0 };
          focusTrailing(0);
        }
        return;
      }

      if (noFieldNavMod && collapsed && e.key === "ArrowUp" && lastItem) {
        if (moveTextareaCaretOneVisualLine(el, -1)) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        const col = textareaVisualLineColumnOffset(el, start);
        focusRowFromBelow(lastItem.id, col);
        return;
      }

      if (noFieldNavMod && collapsed && e.key === "ArrowDown") {
        if (moveTextareaCaretOneVisualLine(el, 1)) {
          e.preventDefault();
        }
        return;
      }

      if (noFieldNavMod && collapsed && e.key === "ArrowLeft" && start === 0 && lastItem) {
        e.preventDefault();
        focusRow(lastItem.id, lastItem.text.length);
        return;
      }

      if (e.key === "Backspace" && collapsed && value === "" && lastItem) {
        e.preventDefault();
        focusRow(lastItem.id, lastItem.text.length);
      }
    },
    [
      commitTrailing,
      focusRow,
      focusRowFromBelow,
      focusTrailing,
      lastItem,
      persistedItemCount,
      setDraft,
    ],
  );

  const onAddButtonClick = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch (e: unknown) {
      log.warn("todaysTodo: trailing focus setSelectionRange failed", e);
    }
  }, []);

  return {
    bindRef,
    onBlurTrailing,
    onKeyDown,
    onChange,
    onAddButtonClick,
  };
}

/**
 * Enter splits into two tasks; Shift+Enter keeps the default newline.
 * Ctrl/Cmd+Enter is handled separately for trailing (commit full draft).
 */
function isSplitEnter(e: KeyboardEvent): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing;
}

/** Same visual column when moving vertically between fields. */
function clampColumn(caret: number, lineLength: number): number {
  return Math.max(0, Math.min(caret, lineLength));
}
