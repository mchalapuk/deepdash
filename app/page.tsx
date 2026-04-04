import { Container, Stack, Group } from "@mantine/core";
import { Calculator } from "./_components/Calculator";
import { DepsSmoke } from "./_components/DepsSmoke";
import { PhaseBackdrop } from "./_components/PhaseBackdrop";
import { Pomodoro } from "./_components/Pomodoro";
import { TodaysTodo } from "./_components/TodaysTodo";
import { TodaysWork } from "./_components/TodaysWork";
import { WorldClocks } from "./_components/WorldClocks";

export default function Home() {
  return (
    <PhaseBackdrop>
      <Container py={52} size="md">
        <Stack gap="lg">
          <WorldClocks />
          <Group gap={42} align="flex-start" wrap="wrap">
            <Stack gap="lg" style={{ flex: "1 1 360px", minWidth: 0 }}>
              <Pomodoro />
              <Calculator />
              <TodaysWork />
            </Stack>
            <TodaysTodo />
          </Group>
          <DepsSmoke />
        </Stack>
      </Container>
    </PhaseBackdrop>
  );
}
