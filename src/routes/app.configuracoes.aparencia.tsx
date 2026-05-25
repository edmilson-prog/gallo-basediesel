import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { useTheme } from "@/hooks/useTheme";
import { THEMES } from "@/config/themes";

export const Route = createFileRoute("/app/configuracoes/aparencia")({
  component: AppearancePage,
});

function AppearancePage() {
  const { theme, mode, resolvedMode } = useTheme();
  const meta = THEMES[theme];
  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aparência</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha o tema visual e o modo de cor. As preferências ficam salvas no navegador.
          </p>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div>
            <p className="text-sm font-semibold">{meta.uiLabel}</p>
            <p className="text-xs text-muted-foreground">
              Modo: {mode} (resolvido: {resolvedMode})
            </p>
          </div>
          <ThemeSwitcher />
        </div>
      </div>
    </SettingsLayout>
  );
}
