"use client";

import { Box, Container, Grid, GridCol, Stack, Group } from "@mantine/core";

import { Pomodoro } from "./Pomodoro";
import { TodaysTodo } from "./TodaysTodo";
import { TodaysWork } from "./TodaysWork";
import { Logo } from "./Logo";

export function DashboardShell() {
  const bodyColStyle = {
    height: "calc(100dvh - 96px)",
    width: "100%",
    minHeight: 0,
  } as const;

  return (
    <Container
      component="main"
      id="main-content"
      size="872px"
      py={0}
      px={0}
      aria-label="Productivity tools"
      h="100vh"
      style={{ overflow: "hidden" }}
    >
      <Stack gap={0} align="start">
        <a href="http://deepda.sh/" className="block w-min-content">
          <Logo className="-ml-5 -mb-8 -mt-1" />
        </a>
        <Group gap={20} style={bodyColStyle}>
          <Stack
            gap={28}
            w="542px"
            h="100%"
            className="min-h-0"
            style={{ overflow: "hidden" }}
          >
            <Box style={{ flexShrink: 0 }} pt={28} pr={18}>
              <Pomodoro />
            </Box>
            <TodaysWork />
          </Stack>
          <Box h="100%" className="min-h-0" style={{ overflow: "hidden", flexGrow: 1 }}>
            <TodaysTodo />
          </Box>
        </Group>
      </Stack>
    </Container>
  );
}
