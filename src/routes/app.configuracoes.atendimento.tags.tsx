import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { TagsSettingsPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/atendimento/tags")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "settings", action: "view" }),
  component: () => (
    <SettingsLayout>
      <TagsSettingsPage />
    </SettingsLayout>
  ),
});
