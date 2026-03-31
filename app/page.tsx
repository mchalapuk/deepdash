import { Container, Stack, Title } from "@mantine/core";
import { DepsSmoke } from "./_components/DepsSmoke";
import { WorldClockHeader } from "./_components/WorldClockHeader";

export default function Home() {
  return (
    <Container py="xl" size="md">
      <Stack gap="xl">
        <Title order={1}>Work Tools</Title>
        <WorldClockHeader />
        <DepsSmoke />
      </Stack>
    </Container>
  );
}
