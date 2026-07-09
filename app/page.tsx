import { Box } from "@mantine/core"

import { DashboardShell } from "./_components/DashboardShell";
import { DataImportExport } from "./_components/DataImportExport";
import { PhaseBackdrop } from "./_components/PhaseBackdrop";

export default function Home() {
  return (
    <PhaseBackdrop>
      <Box
        visibleFrom="md"
        pos="fixed"
        bottom={38}
        right={32}
        style={{ zIndex: 200 }}
        aria-label="Export and import app data"
      >
        <DataImportExport layout="vertical" />
      </Box>
      <DashboardShell />
    </PhaseBackdrop>
  );
}
