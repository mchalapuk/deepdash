"use client";

import {
  ActionIcon,
  Box,
  Checkbox,
  Group,
  Textarea,
} from "@mantine/core";
import {
  IconArchive,
  IconCalendarPlus,
  IconGripVertical,
} from "@tabler/icons-react";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import {
  todoActions,
  type TodoItem,
  type TodoListKind,
} from "@/app/_stores/todoStore";
import log from "@/lib/logger";

import { clampColumn, isSplitEnter } from "./todoRowHelpers";
import {
  moveTextareaCaretOneVisualLine,
  textareaVisualLineColumnOffset,
  textareaVisualLineStartIndex,
} from "./todaysTodoTextareaNav";
import type { TodoPersistedRowProps, TodaysTodoFocusApi } from "./types";

export function TodoPersistedRow({
  item,
  index,
  items,
  listKind,
  focusAPI,
  dragAPI,
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
    listKind,
    focusAPI,
  });

  const [mouseOver, setMouseOver] = useState(false);
  const { registerRowRoot, onGripPointerDown, draggingId } = dragAPI;
  const [iconFocused, setIconFocused] = useState(false);
  const isDragging = draggingId === id;
  const isFocused = focusAPI.focusedId === id || iconFocused;
  const isHighlighted = mouseOver || isDragging || isFocused;

  const bindRowRoot = useMemo(
    () => registerRowRoot(id),
    [id, registerRowRoot],
  );
  const gripPointerDown = useMemo(
    () => onGripPointerDown(id),
    [id, onGripPointerDown],
  );

  const onIconFocus = useCallback(() => setIconFocused(true), []);
  const onIconBlur = useCallback(() => setIconFocused(false), []);

  return (
    <Box
      ref={bindRowRoot}
      onMouseOver={() => setMouseOver(true)}
      onMouseLeave={() => setMouseOver(false)}
      w="100%"
      style={{
        borderRadius: 8,
        transition: "background-color 80ms ease",
        ...(isHighlighted
          ? {
              backgroundColor: "rgba(255, 255, 255, 0.07)",
            }
          : {}),
        opacity: isHighlighted ? 1 : 0.6,
      }}
    >
      <Group wrap="nowrap" gap={7} align="flex-start" w="100%" pl={6}>
        <Checkbox
          checked={done}
          onChange={() => todoActions.toggleDone(id)}
          aria-label={done ? "Mark as not done" : "Mark as done"}
          size="xs"
          color="gray.7"
          opacity={0.9}
          pos="relative"
          top={7}
          onFocus={onIconFocus}
          onBlur={onIconBlur}
        />
        <Textarea
          ref={composeInputRef}
          flex={1}
          size="sm"
          minRows={1}
          autosize
          maxRows={12}
          mt={-2}
          mb={-4}
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
              lineHeight: 2.1,
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
        <Group
          wrap="nowrap"
          gap={2}
          align="flex-start"
          style={{
            flexShrink: 0,
            marginTop: 4,
          }}
        >
          <ActionIcon
            variant="subtle"
            color="white"
            size="sm"
            radius="sm"
            aria-label={listKind === "today" ? "Move to backlog" : "Move to today"}
            onClick={() =>
              listKind === "today"
                ? todoActions.moveItemToBacklog(id)
                : todoActions.moveItemToToday(id)
            }
            style={{ flexShrink: 0 }}
            onFocus={onIconFocus}
            onBlur={onIconBlur}
          >
            {listKind === "today" ? (
              <IconArchive size={14} stroke={1} />
            ) : (
              <IconCalendarPlus size={14} stroke={1} />
            )}
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="white"
            size="sm"
            radius="sm"
            aria-label="Drag to reorder"
            onPointerDown={e => {
              gripPointerDown(e);
              if (document.activeElement instanceof HTMLElement) {
                (document.activeElement as HTMLElement).blur();
              }
            }}
            style={{
              flexShrink: 0,
              touchAction: "none",
              cursor: isDragging ? "grabbing" : "grab",
            }}
            onFocus={onIconFocus}
            onBlur={onIconBlur}
            classNames={{ root: "focus:outline-none" }}
          >
            <IconGripVertical size={14} stroke={1} />
          </ActionIcon>
        </Group>
      </Group>
    </Box>
  );
}

type UsePersistedTodoRowInputArgs = {
  id: string;
  text: string;
  index: number;
  items: readonly TodoItem[];
  /** Which list this row belongs to (`today` vs `backlog`). Not `focusAPI.listKind`, which is the trailing add-row target. */
  listKind: TodoListKind;
  focusAPI: TodaysTodoFocusApi;
};

function usePersistedTodoRowInput({
  id,
  text,
  index,
  items,
  listKind,
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
    arrowDownFromLastToday,
    arrowUpFromFirstBacklog,
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
        const onFirstVisualLine =
          textareaVisualLineStartIndex(el, start) === 0;
        const skipInnerLineMove =
          listKind === "backlog" && isFirst && onFirstVisualLine;

        if (
          !skipInnerLineMove &&
          moveTextareaCaretOneVisualLine(el, -1)
        ) {
          e.preventDefault();
          return;
        }
        if (!isFirst) {
          e.preventDefault();
          const prev = items[index - 1]!;
          const col = textareaVisualLineColumnOffset(el, start);
          focusRowFromBelow(prev.id, col);
        } else if (listKind === "backlog") {
          e.preventDefault();
          const col = textareaVisualLineColumnOffset(el, start);
          arrowUpFromFirstBacklog(col);
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
          if (listKind === "today") {
            arrowDownFromLastToday(clampColumn(start, value.length));
          } else {
            focusTrailing(clampColumn(start, trailingDraftLength));
          }
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
          if (listKind === "today") {
            arrowDownFromLastToday(0);
          } else {
            focusTrailing(0);
          }
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
          const newId = todoActions.insertEmptyAt(index, listKind);
          focusRow(newId, 0);
          return;
        }
        if (start === value.length) {
          const newId = todoActions.insertEmptyAt(index + 1, listKind);
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
      listKind,
      arrowDownFromLastToday,
      arrowUpFromFirstBacklog,
    ],
  );

  return {
    composeInputRef,
    onBlurPersisted,
    onKeyDown,
    onChange,
  };
}
