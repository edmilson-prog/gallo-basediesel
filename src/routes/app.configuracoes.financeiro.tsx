import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { FinancialConfigPage } from "@/features/dre";

export const Route = createFileRoute("/app/configuracoes/financeiro")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Financeiro"], {
      resource: "dre",
      action: "edit",
    }),
  component: () => (
    <SettingsLayout>
      <FinancialConfigPage />
    </SettingsLayout>
  ),
});
