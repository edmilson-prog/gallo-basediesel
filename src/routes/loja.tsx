import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LojaLayout } from "@/features/shell/layouts";

export const Route = createFileRoute("/loja")({
  component: LojaLayoutRoute,
});

function LojaLayoutRoute() {
  return (
    <LojaLayout>
      <Outlet />
    </LojaLayout>
  );
}
