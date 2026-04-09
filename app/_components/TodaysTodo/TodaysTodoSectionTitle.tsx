"use client";

import { Text } from "@mantine/core";

import type { TodoListKind } from "@/app/_stores/todoStore";

type TodaysTodoSectionTitleProps = {
  trailingTargetList: TodoListKind;
  onClick: () => void;
};

export function TodaysTodoSectionTitle({
  trailingTargetList,
  onClick,
}: TodaysTodoSectionTitleProps) {
  return (
    <Text
      component="button"
      type="button"
      size="xs"
      c="dimmed"
      onClick={onClick}
      aria-label={
        trailingTargetList === "today"
          ? "Scroll list to top and focus first task"
          : "Scroll to Backlog and focus first backlog task"
      }
      style={{
        flexShrink: 0,
        paddingBottom: 8,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
    >
      {trailingTargetList === "today" ? (
        <>Today&apos;s tasks</>
      ) : (
        "Backlog"
      )}
    </Text>
  );
}
