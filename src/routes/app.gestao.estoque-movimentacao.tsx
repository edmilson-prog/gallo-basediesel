import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import {
  InventoryMovementPage,
  validateInventoryMovementSearch,
} from "@/features/inventory-movement";

export const Route = createFileRoute("/app/gestao/estoque-movimentacao")({
  validateSearch: validateInventoryMovementSearch,
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, {
      resource: "inventory",
      action: "view",
    }),
  component: () => (
    <DashboardLayout>
      <InventoryMovementPage />
    </DashboardLayout>
  ),
});
