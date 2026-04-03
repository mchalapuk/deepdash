import { Container, Stack, Group } from "@mantine/core";
import { DepsSmoke } from "./_components/DepsSmoke";
import { PhaseBackdrop } from "./_components/PhaseBackdrop";
import { Pomodoro } from "./_components/Pomodoro";
import { TodaysWork } from "./_components/TodaysWork";
import { WorldClocks } from "./_components/WorldClocks";

export default function Home() {
  return (
    <PhaseBackdrop>
      <Container py={52} size="md">
        <Stack gap="lg">
          <WorldClocks />
          <Group gap={42} wrap="nowrap">
            <Pomodoro />
            <TodaysWork />
          </Group>
          <DepsSmoke />
        </Stack>
      </Container>
    </PhaseBackdrop>
  );
}
