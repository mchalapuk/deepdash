"use client";

import { Box, Container, Grid, GridCol, Stack } from "@mantine/core";
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { Calculator } from "./Calculator";
import { Pomodoro } from "./Pomodoro";
import { TodaysTodo } from "./TodaysTodo";
import { TodaysWork } from "./TodaysWork";
import { WorldClocks } from "./WorldClocks";

export function DashboardShell() {
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyHeightCss = useDashboardBodyHeight(headerRef);

  const bodyColStyle = {
    height: bodyHeightCss,
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
          <Box ref={headerRef} pt={52} pb={28}>
            <WorldClocks />
          </Box>
        </GridCol>
        <GridCol span={5} style={bodyColStyle}>
          <Stack
            gap={42}
            h="100%"
            pb={28}
            className="min-h-0"
            style={{ overflow: "hidden" }}
          >
            <Box style={{ flexShrink: 0 }}>
              <Pomodoro />
            </Box>
            <Calculator />
          </Stack>
        </GridCol>
        <GridCol span={4} style={bodyColStyle}>
          <Box h="100%" className="min-h-0" pb={28} style={{ overflow: "hidden" }}>
            <TodaysWork />
          </Box>
        </GridCol>
        <GridCol component="aside" span={3} style={bodyColStyle}>
          <Box h="100%" className="min-h-0" pb={28} style={{ overflow: "hidden" }}>
            <TodaysTodo />
          </Box>
        </GridCol>
      </Grid>
    </Container>
  );
}

function useDashboardBodyHeight(headerRef: RefObject<HTMLElement | null>): string {
  const [css, setCss] = useState("calc(100vh - 160px)");

  const sync = useCallback(() => {
    const el = headerRef.current;
    if (typeof window === "undefined" || !el) return;
    setCss(`calc(100vh - ${el.offsetHeight}px)`);
  }, [headerRef]);

  useLayoutEffect(() => {
    sync();
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [sync]);

  return css;
}
