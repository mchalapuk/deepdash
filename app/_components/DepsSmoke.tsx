"use client";

import { evaluate } from "mathjs";
import { Stack, Text } from "@mantine/core";
import { useState } from "react";

export function DepsSmoke() {
  const [sample] = useState(() => evaluate("sqrt(16) + 1"));

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Offline bundle checks: math.js → {String(sample)}
      </Text>
    </Stack>
  );
}
