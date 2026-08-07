import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { SoundSettingsPage } from "@/features/sound-settings";

export const Route = createFileRoute("/app/configuracoes/sons")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "settings", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <SoundSettingsPage />
    </SettingsLayout>
  ),
});
