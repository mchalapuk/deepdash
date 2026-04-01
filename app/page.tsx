import { Container, Stack, Title } from "@mantine/core";
import { DepsSmoke } from "./_components/DepsSmoke";
import { PhaseBackdrop } from "./_components/PhaseBackdrop";
import { PomodoroPanel } from "./_components/PomodoroPanel";
import { WorldClockHeader } from "./_components/WorldClockHeader";

export default function Home() {
  return (
    <PhaseBackdrop>
      <Container py="xl" size="md">
        <Stack gap="xl">
          <Title order={1}>Work Tools</Title>
          <WorldClockHeader />
          <PomodoroPanel />
          <DepsSmoke />
        </Stack>
      </Container>
    </PhaseBackdrop>
  );
}
