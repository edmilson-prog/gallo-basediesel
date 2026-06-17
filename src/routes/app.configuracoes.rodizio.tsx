import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { RotationQueuePage } from "@/features/rotation";

export const Route = createFileRoute("/app/configuracoes/rodizio")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, {
      resource: "seller",
      action: "edit",
      scope: "store",
    }),
  component: () => (
    <SettingsLayout>
      <RotationQueuePage />
    </SettingsLayout>
  ),
});
