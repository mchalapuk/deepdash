import { Container, Stack } from "@mantine/core";
import { DepsSmoke } from "./_components/DepsSmoke";
import { PhaseBackdrop } from "./_components/PhaseBackdrop";
import { Pomodoro } from "./_components/Pomodoro";
import { WorldClocks } from "./_components/WorldClocks";

export default function Home() {
  return (
    <PhaseBackdrop>
      <Container py="xl" size="md">
        <Stack gap="xl">
          <WorldClocks />
          <Pomodoro />
          <DepsSmoke />
        </Stack>
      </Container>
    </PhaseBackdrop>
  );
}
