import { DashboardShell } from "./_components/DashboardShell";
import { DataImportExport } from "./_components/DataImportExport";
import { PhaseBackdrop } from "./_components/PhaseBackdrop";

export default function Home() {
  return (
    <PhaseBackdrop>
      <DataImportExport />
      <DashboardShell />
    </PhaseBackdrop>
  );
}
