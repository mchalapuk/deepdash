"use client";

import { Box, Container, Grid, GridCol, Stack } from "@mantine/core";

import { Calculator } from "./Calculator";
import { Pomodoro } from "./Pomodoro";
import { TodaysTodo } from "./TodaysTodo";
import { TodaysWork } from "./TodaysWork";
import { WorldClocks } from "./WorldClocks";

export function DashboardShell() {
  const bodyColStyle = {
    height: "calc(100vh - 219px)",
    minHeight: 0,
  } as const;

  return (
    <Container
      component="main"
      id="main-content"
      size="xl"
      py={0}
      px={0}
      aria-label="Productivity tools"
      h="100vh"
      style={{ overflow: "hidden" }}
    >
      <Grid columns={12} columnGap="xl" rowGap={0}>
        <GridCol span={12}>
          <Box pt={42} pb={4}>
            <WorldClocks />
          </Box>
        </GridCol>
        <GridCol span={5} style={bodyColStyle}>
          <Stack
            gap={28}
            h="100%"
            pb={26}
            className="min-h-0"
            style={{ overflow: "hidden" }}
          >
            <Box style={{ flexShrink: 0 }} pt={28}>
              <Pomodoro />
            </Box>
            <Box
              style={{
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Calculator />
            </Box>
          </Stack>
        </GridCol>
        <GridCol span={4} style={bodyColStyle}>
          <Box h="100%" className="min-h-0" pb={36} style={{ overflow: "hidden" }}>
            <TodaysWork />
          </Box>
        </GridCol>
        <GridCol component="aside" span={3} style={bodyColStyle}>
          <Box h="100%" className="min-h-0" pb={43} style={{ overflow: "hidden" }}>
            <TodaysTodo />
          </Box>
        </GridCol>
      </Grid>
    </Container>
  );
}
