import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { AiSettingsPage } from "@/features/ai-settings";

const ABAS = ["visao-geral", "provedores", "funcionalidades", "playground"] as const;
type Aba = (typeof ABAS)[number];

export interface IAiSearch {
  aba: Aba;
}

function validateAiSearch(raw: Record<string, unknown>): IAiSearch {
  const aba =
    typeof raw.aba === "string" && (ABAS as readonly string[]).includes(raw.aba)
      ? (raw.aba as Aba)
      : "visao-geral";
  return { aba };
}

export const Route = createFileRoute("/app/configuracoes/ia")({
  validateSearch: validateAiSearch,
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <SettingsLayout>
      <AiSettingsPage />
    </SettingsLayout>
  ),
});
