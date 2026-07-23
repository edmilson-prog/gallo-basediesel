import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { useCurrentStore } from "@/features/multistore";
import { CopilotAssistantSettingsSection } from "@/features/copilot";
import { COPILOT_STRINGS } from "@/features/copilot/i18n/pt-BR";

export const Route = createFileRoute("/app/configuracoes/copiloto")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor"], { resource: "settings", action: "edit" }),
  component: CopilotSettingsPage,
});

function CopilotSettingsPage() {
  const strings = COPILOT_STRINGS.settings;
  const { currentStoreId } = useCurrentStore();

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{strings.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{strings.description}</p>
        </div>
        <CopilotAssistantSettingsSection storeId={currentStoreId ?? null} />
      </div>
    </SettingsLayout>
  );
}
