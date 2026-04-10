"use client";

import { ActionIcon, Group, Textarea } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import { todoActions, type TodoItem } from "@/app/_stores/todoStore";
import { usePhaseColor } from "@/lib/layout";
import log from "@/lib/logger";

import { isSplitEnter } from "./todoRowHelpers";
import {
  isCaretOnFirstVisualLine,
  textareaVisualLineColumnOffset,
} from "./todaysTodoTextareaNav";
import type { TodaysTodoDraftApi, TodaysTodoFocusApi, TodoTrailingRowProps } from "./types";

export function TodoTrailingRow({
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
    listKind,
    focusRow,
    focusRowFromBelow,
    focusTrailing,
    setTrailingInputRef,
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

        /* Trailing row is single-line: Enter at start/end must submit, not insertEmptyAt — otherwise
         * an empty row is added while draft text remains and blur commits again (duplicate + jump). */
        if (start === 0 && value.length > 0) {
          commitTrailing(value);
          return;
        }
        if (start === value.length && value.length > 0) {
          commitTrailing(value);
          return;
        }
        if (start > 0 && start < value.length) {
          const left = value.slice(0, start);
          const right = value.slice(start);
          todoActions.addItem(left, false, listKind);
          setDraft(right);
          draftRef.current = right;
          trailingSelectionRef.current = { start: 0, end: 0 };
          focusTrailing(0);
        }
        return;
      }

      if (noFieldNavMod && collapsed && e.key === "ArrowUp" && lastItem) {
        if (!isCaretOnFirstVisualLine(el, start)) {
          return;
        }
        e.preventDefault();
        const col = textareaVisualLineColumnOffset(el, start);
        focusRowFromBelow(lastItem.id, col);
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
      setDraft,
      listKind,
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
