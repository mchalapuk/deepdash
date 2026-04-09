import { Box, Group, Skeleton, Stack, VisuallyHidden } from "@mantine/core";

/** Mimics persisted task row layout while todo storage hydrates. */
export function TodaysTodoTasksSkeleton() {
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
