import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PwaShell } from "@/features/pwa-atendimento";

export const Route = createFileRoute("/atendimento")({
  component: AtendimentoPwaLayout,
});

function AtendimentoPwaLayout() {
  return (
    <PwaShell>
      <Outlet />
    </PwaShell>
  );
}
