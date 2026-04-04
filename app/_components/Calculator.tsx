"use client";

import { Box, Group, Input, ScrollArea, Stack, Text, Table } from "@mantine/core";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  calculatorActions,
  useCalculatorExpression,
  useCalculatorHistory,
  useCalculatorReadouts,
} from "@/app/_stores/calculatorStore";
import { useCurrentPhase } from "@/app/_stores/pomodoroStore";
import { getColorFromPhase } from "@/lib/layout";
import { IconChevronRight } from "@tabler/icons-react";

export function Calculator() {
  useEffect(calculatorActions.init, []);

  const expression = useCalculatorExpression();
  const { lastNormalized, lastResult, errorMessage } = useCalculatorReadouts();
  const phase = useCurrentPhase();

  const inputRef = useRef<HTMLInputElement>(null);
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
    <Stack
      gap={0}
      className="min-h-0 w-full h-full overflow-hidden flex-grow"
    >
      <Text size="xs" c="dimmed" pl={6}>
        Calculator
      </Text>
      <Group gap={0} ml={-6} w="100%">
        <IconChevronRight size={22} onClick={() => {
          inputRef.current?.focus();
        }}/>
        <Box pos="relative" ml={-1}>
          <Input
            ref={inputRef}
            variant="unstyled"
            size="xl"
            w="100%"
            value={expression}
            placeholder="Expression…"
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
          {errorMessage ? (
            <Text size="sm" c="red" component="p" m={0}>
              {errorMessage}
            </Text>
          ) : (
            lastResult && (
              <Text
                size="xl"
                h="58px"
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
                  top: "1px",
                  left: 0,
                  zIndex: 1,
                }}
                className="focus:outline-none!"
              >
                <span className="invisible select-none whitespace-nowrap">{lastNormalized}</span> = <Text component="span" w="bold" c={getColorFromPhase(phase)}>{lastResult}</Text>
              </Text>
            )
          )}
        </Box>
      </Group>
      <CalculatorHistory {...{ inputRef }} />
    </Stack>
  );
}

function CalculatorHistory({ inputRef }: {inputRef: React.RefObject<HTMLInputElement | null>}) {
  const history = useCalculatorHistory();
  const phase = useCurrentPhase();

  return (
    history.length > 0 ? (
      <ScrollArea
        type="hover"
        scrollbars="y"
        offsetScrollbars
        pl={10}
        pr={4}
        styles={{
          thumb: { backgroundColor: "green.8", opacity: 0.5 }
        }}
      >
        <Table
          m={0}
          p={0}
          style={{ listStyle: "none" }}
          aria-label="Calculation history, newest first"
          withRowBorders={false}
        >
          <Table.Tbody>
            {history.map((entry) => (
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
                  <Text component="span" size="sm" c={getColorFromPhase(phase)}>{entry.result}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    ) : null
  );
}