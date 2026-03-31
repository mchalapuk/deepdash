import { Container, Stack, Title } from "@mantine/core";
import { DepsSmoke } from "./_components/DepsSmoke";
import { TimezoneAutocomplete } from "./_components/TimezoneAutocomplete";

export default function Home() {
  return (
    <Container py="xl" size="md">
      <Stack gap="xl">
        <Title order={1}>Work Tools</Title>
        <TimezoneAutocomplete />
        <DepsSmoke />
      </Stack>
    </Container>
  );
}
