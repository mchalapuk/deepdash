import { Text } from "@mantine/core";
import { type RefObject } from "react";

type Props = {
  ref?: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
};

export function TaskListTitle({ ref, onClick, title, children }: Props) {
  return (
    <Text
      {...{ ref, onClick }}
      component="button"
      type="button"
      size="xs"
      c="dimmed"
      pt={16}
      pb={10}
      aria-label={title}
      style={{
        flexShrink: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
    >
      {children}
    </Text>
  )
}
