import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { CopilotPlacementField } from "@/features/copilot";
import { COPILOT_STRINGS } from "@/features/copilot/i18n/pt-BR";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/app/configuracoes/copiloto")({
  beforeLoad: ({ location }) => requireAuth(location.pathname),
  component: CopilotSettingsPage,
});

function CopilotSettingsPage() {
  const strings = COPILOT_STRINGS.settings;
  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{strings.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{strings.description}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <CopilotPlacementField />
        </div>
      </div>
    </SettingsLayout>
  );
}
