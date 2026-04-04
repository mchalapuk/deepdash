"use client";

import {
  ActionIcon,
  Box,
  Checkbox,
  Group,
  Input,
  ScrollArea,
  Stack,
  Text,
  Space,
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
import { useCurrentPhase } from "@/app/_stores/pomodoroStore";
import { todoActions, useTodoList, type TodoItem } from "@/app/_stores/todoStore";
import { getColorFromPhase } from "@/lib/layout";
import log from "@/lib/logger";
import { PHASE_TINT } from "./PhaseBackdrop";

/** Trailing “add task” field: value, setter, commit. */
type TodaysTodoDraftApi = {
  draft: string;
  setDraft: (v: string) => void;
  commitTrailing: (raw: string) => void;
};

/** Focus, refs, list edges, and trailing-field length shared by persisted rows and the add row. */
type TodaysTodoFocusApi = {
  trailingDraftLength: number;
  setRowInputRef: (itemId: string) => (el: HTMLInputElement | null) => void;
  setTrailingInputRef: (el: HTMLInputElement | null) => void;
  focusRow: (id: string, pos: number) => void;
  focusTrailing: (pos: number) => void;
  isFirstRow: (rowIndex: number) => boolean;
  isLastRow: (rowIndex: number) => boolean;
};

export function TodaysTodo() {
  const m = useTodaysTodoMechanics();
  const phase = useCurrentPhase();

  return (
    <Stack
      gap={0}
      w="100%"
      pt="xs"
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
        style={{ flex: 1, minHeight: 0 }}
        styles={{
          thumb: { backgroundColor: "green.8", opacity: 0.5 },
        }}
      >
        <Stack gap={0} pr={6} pb={4}>
          {!m.hydrated ? (
            <Text size="sm" c="dimmed">
              Loading…
            </Text>
          ) : (
            m.items.map((item, index) => (
              <TodoPersistedRow
                key={item.id}
                item={item}
                index={index}
                items={m.items}
                focusAPI={m.focusAPI}
              />
            ))
          )}
        </Stack>
        <Space h={28} ref={m.lastRowScrollRef} />
        <div className="absolute bottom-0 left-0 w-full h-[40px]" style={{
          background: `linear-gradient(to top, ${PHASE_TINT[phase]}, transparent)`,
        }} />
      </ScrollArea>
      <Box style={{ flexShrink: 0 }}>
        <TodoTrailingRow
          draftAPI={m.draftAPI}
          lastItem={m.items.length > 0 ? m.items[m.items.length - 1]! : null}
          focusAPI={m.focusAPI}
        />
      </Box>
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
    <Group wrap="nowrap" gap={7} align="center" w="100%" pl={6}>
      <Checkbox
        checked={done}
        onChange={() => todoActions.toggleDone(id)}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        size="xs"
        color="gray.7"
        opacity={0.9}
        pos="relative"
        top={3.5}
      />
      <Input
        ref={composeInputRef}
        flex={1}
        size="sm"
        h="30px"
        value={text}
        onChange={onChange}
        onBlur={onBlurPersisted}
        onKeyDown={onKeyDown}
        variant="unstyled"
        styles={{
          input: done
            ? {
                textDecoration: "line-through",
                opacity: 0.55,
              }
            : undefined,
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
  const phase = useCurrentPhase();
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
    <Group wrap="nowrap" gap={5.5} align="center" w="100%" pl={3.5}>
      <ActionIcon
        variant="light"
        color={getColorFromPhase(phase)}
        opacity={0.95}
        size="sm"
        aria-label="Add task"
        mt={1.5}
        mr={-2}
        radius="sm"
        onClick={onAddButtonClick}
      >
        <IconPlus size={12} stroke={3} />
      </ActionIcon>
      <Input
        ref={bindRef}
        flex={1}
        size="sm"
        placeholder="Add a task…"
        value={draftAPI.draft}
        variant="unstyled"
        onChange={onChange}
        onBlur={onBlurTrailing}
        onKeyDown={onKeyDown}
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
  const trailingRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLInputElement | null>>({});
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
    return (el: HTMLInputElement | null) => {
      if (el) rowRefs.current[itemId] = el;
      else delete rowRefs.current[itemId];
    };
  }, []);

  const setTrailingInputRef = useCallback((el: HTMLInputElement | null) => {
    trailingRef.current = el;
  }, []);

  const focusAPI = useMemo<TodaysTodoFocusApi>(
    () => ({
      trailingDraftLength: trailingDraft.length,
      setRowInputRef,
      setTrailingInputRef,
      focusRow,
      focusTrailing,
      isFirstRow: (rowIndex: number) => rowIndex === 0,
      isLastRow: (rowIndex: number) => rowIndex === items.length - 1,
    }),
    [
      trailingDraft.length,
      setRowInputRef,
      setTrailingInputRef,
      focusRow,
      focusTrailing,
      items.length,
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
  composeInputRef: (el: HTMLInputElement | null) => void;
  onBlurPersisted: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onChange: (ev: ChangeEvent<HTMLInputElement>) => void;
} {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectionAfterChangeRef = useRef<{ start: number; end: number } | null>(
    null,
  );

  const { focusRow, focusTrailing, trailingDraftLength, setRowInputRef } = focusAPI;

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
    (el: HTMLInputElement | null) => {
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
    (ev: ChangeEvent<HTMLInputElement>) => {
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
    (e: KeyboardEvent<HTMLInputElement>) => {
      const isFirst = focusAPI.isFirstRow(index);
      const isLast = focusAPI.isLastRow(index);
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
        if (!isFirst) {
          e.preventDefault();
          const prev = items[index - 1]!;
          focusRow(prev.id, clampColumn(start, prev.text.length));
        }
        return;
      }

      if (noFieldNavMod && collapsed && e.key === "ArrowDown") {
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

      if (e.key === "Enter") {
        e.preventDefault();
        if (start === 0 && collapsed) {
          const newId = todoActions.insertEmptyAt(index);
          focusRow(newId, 0);
          return;
        }
        if (start === value.length && collapsed) {
          const newId = todoActions.insertEmptyAt(index + 1);
          focusRow(newId, 0);
          return;
        }
        if (collapsed && start > 0 && start < value.length) {
          const newId = todoActions.splitItemAt(id, start);
          if (newId) focusRow(newId, 0);
        }
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
    [id, index, items, focusAPI],
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
  bindRef: (el: HTMLInputElement | null) => void;
  onBlurTrailing: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onChange: (ev: ChangeEvent<HTMLInputElement>) => void;
  onAddButtonClick: () => void;
} {
  const { draft, setDraft, commitTrailing } = draftAPI;
  const innerRef = useRef<HTMLInputElement | null>(null);
  const trailingSelectionRef = useRef<{ start: number; end: number } | null>(
    null,
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const { focusRow, setTrailingInputRef } = focusAPI;

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
    (el: HTMLInputElement | null) => {
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
    (ev: ChangeEvent<HTMLInputElement>) => {
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
    (e: KeyboardEvent<HTMLInputElement>) => {
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

      if (e.key === "Enter") {
        e.preventDefault();
        if (value.trim() === "") return;
        commitTrailing(value);
        return;
      }

      if (noFieldNavMod && collapsed && e.key === "ArrowUp" && lastItem) {
        e.preventDefault();
        focusRow(lastItem.id, clampColumn(start, lastItem.text.length));
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
    [commitTrailing, draftAPI, focusRow, lastItem],
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

/** Same visual column when moving vertically between single-line fields. */
function clampColumn(caret: number, lineLength: number): number {
  return Math.max(0, Math.min(caret, lineLength));
}
