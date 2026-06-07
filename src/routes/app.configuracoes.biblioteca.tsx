import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { LibraryManagerPage } from "@/features/quick-send";

export const Route = createFileRoute("/app/configuracoes/biblioteca")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: () => (
    <SettingsLayout>
      <LibraryManagerPage />
    </SettingsLayout>
  ),
});
