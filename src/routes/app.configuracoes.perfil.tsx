import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";
import { SettingsLayout } from "@/features/shell/layouts";

export const Route = createFileRoute("/app/configuracoes/perfil")({
  component: () => (
    <SettingsLayout>
      <PlaceholderPage icon="mdi:account" title="Meu perfil" />
    </SettingsLayout>
  ),
});
