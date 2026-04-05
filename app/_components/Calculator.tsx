"use client";

import { Box, Group, Input, ScrollArea, Stack, Text, Table } from "@mantine/core";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  calculatorActions,
  useCalculatorExpression,
  useCalculatorHistory,
  useCalculatorReadouts,
} from "@/app/_stores/calculatorStore";
import { usePhaseBackgroundColor, usePhaseColor } from "@/lib/layout";
import { IconChevronRight } from "@tabler/icons-react";

export function Calculator() {
  useEffect(calculatorActions.init, []);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Stack gap={0} className="min-h-0 w-full h-full overflow-hidden mb-[-8px]">
      <CalculatorHistory {...{ inputRef }} />
      <CalculatorPrompt {...{ inputRef }} />
    </Stack>
  );
}

function CalculatorPrompt({ inputRef }: { inputRef: React.RefObject<HTMLInputElement | null> }) {
  const expression = useCalculatorExpression();
  const { lastNormalized, lastResult, errorMessage } = useCalculatorReadouts();
  const color = usePhaseColor();

  /** After a controlled update from the store, restore caret (store updates reset selection to end). */
  const pendingCaretRef = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    const p = pendingCaretRef.current;
    if (!p) return;
    pendingCaretRef.current = null;
    const input = inputRef.current;
    if (!input) return;
    const max = input.value.length;
    const start = Math.min(p.start, max);
    const end = Math.min(p.end, max);
    input.setSelectionRange(start, end);
  });

  return (
    <Group gap={4} ml={1} w="100%" wrap="nowrap">
      <IconChevronRight size={18} className="-mt-5" onClick={() => {
        inputRef.current?.focus();
      }} />
      <Box pos="relative" w="100%">
        <Input
          ref={inputRef}
          variant="unstyled"
          size="md"
          w="100%"
          value={expression}
          placeholder="Calculate something…"
          onChange={(e) => {
            const el = e.currentTarget;
            pendingCaretRef.current = {
              start: el.selectionStart ?? el.value.length,
              end: el.selectionEnd ?? el.value.length,
            };
            calculatorActions.setExpression(el.value);
          }}
          onKeyDown={(e) => {
            if (lastResult) {
              calculatorActions.setExpression(e.currentTarget.value);
              return;
            }
            if (e.key !== "Enter") return;
            e.preventDefault();
            calculatorActions.evaluate();
          }}
          onBlur={() => {
            if (!lastResult && expression) {
              calculatorActions.evaluate()
            }
          }}
        />
        <Text size="xs" c="red.9" component="p" h={20}>
          {errorMessage}
        </Text>
        {!errorMessage && lastResult && (
          <Text
            size="md"
            h="42px"
            w="100%"
            onClick={() => {
              inputRef.current?.focus();
              calculatorActions.setExpression(lastNormalized);
            }}
            style={{
              cursor: "text",
              display: "flex",
              alignItems: "center",
              position: "absolute",
              top: 0,
              left: 0,
              zIndex: 1,
            }}
            className="focus:outline-none!"
          >
            <span className="invisible select-none whitespace-nowrap">{lastNormalized}</span> = <Text component="span" w="bold" c={color}>{lastResult}</Text>
          </Text>
        )}
      </Box>
    </Group>
  );
}

function CalculatorHistory({ inputRef }: { inputRef: React.RefObject<HTMLInputElement | null> }) {
  const history = useCalculatorHistory();
  const backgroundColor = usePhaseBackgroundColor();
  const color = usePhaseColor();
  const historyViewportRef = useRef<HTMLDivElement | null>(null);
  /** Newest-first buffer: length is capped, so use head id to detect a real append. */
  const prevNewestHistoryIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const newestId = history[0]?.id ?? null;
    const prev = prevNewestHistoryIdRef.current;
    prevNewestHistoryIdRef.current = newestId;
    if (prev === null) return;
    if (newestId == null || newestId === prev) return;
    const vp = historyViewportRef.current;
    if (!vp) return;
    vp.scrollTop = vp.scrollHeight;
  }, [history.length, history[0]?.id]);

  return (
    <ScrollArea
      viewportRef={historyViewportRef}
      type="hover"
      scrollbars="y"
      offsetScrollbars
      pl={18}
      pr={4}
      styles={{
        thumb: { backgroundColor: "green.8", opacity: 0.5 }
      }}
    >
      { history.length > 0 ? (
        <Table
          m={0}
          p={0}
          style={{ listStyle: "none" }}
          aria-label="Calculation history, newest first"
          withRowBorders={false}
        >
          <Table.Tbody>
            {[...history].reverse().map((entry) => (
              <Table.Tr
                key={entry.id}
                className="opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
                onClick={() => {
                  calculatorActions.setExpression(entry.normalized);
                  inputRef.current?.focus();
                  calculatorActions.evaluate();
                }}
              >
                <Table.Td className="whitespace-nowrap text-ellipsis overflow-hidden" py={1} px={6}>
                  <Text component="span" size="sm">{entry.normalized}</Text>
                </Table.Td>
                <Table.Td className="w-[9px]" px={0} py={1}>
                  <Text component="span" size="sm">{" = "}</Text>
                </Table.Td>
                <Table.Td w="100%" py={1} px={6}>
                  <Text component="span" size="sm" c={color}>{entry.result}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : null}
      <div className="absolute top-0 left-0 w-full h-[60px]" style={{
        background: `linear-gradient(to bottom, ${backgroundColor}, transparent)`,
      }} />
    </ScrollArea>
  );
}