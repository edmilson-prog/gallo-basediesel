import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useCurrentStore } from "@/features/multistore";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { Forbidden } from "@/features/rbac/components/Forbidden";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { UnsavedChangesDialog } from "@/features/admin-settings/components/UnsavedChangesDialog";
import { useUnsavedChanges } from "@/features/admin-settings/hooks/useUnsavedChanges";

export function AnalyticsCopilotConfigPage() {
  const { currentStoreId } = useCurrentStore();
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const storeId = currentStoreId ?? "store-matriz";
  const canView = hasPermission(currentUser, "settings", "view");
  const canEdit = role === "Owner";

  const { settings, loading, saving, update } = usePlatformSettings(storeId);

  // `undefined` → enabled by default (PRD-057). Draft holds the explicit boolean.
  const [draft, setDraft] = useState<boolean | null>(null);

  useEffect(() => {
    if (settings) {
      setDraft(settings.analyticsCopilotEnabled !== false);
    }
  }, [settings]);

  const baseline = useMemo<boolean | null>(() => {
    if (!settings) return null;
    return settings.analyticsCopilotEnabled !== false;
  }, [settings]);

  const dirty = useMemo(() => {
    if (baseline === null || draft === null) return false;
    return draft !== baseline;
  }, [baseline, draft]);

  const unsaved = useUnsavedChanges(dirty && canEdit);

  if (!canView) {
    return (
      <Forbidden
        title="Acesso restrito"
        message="A configuração do copiloto analítico só está disponível para o Owner."
        actionLabel="Voltar para configurações"
        actionTo="/app/configuracoes"
      />
    );
  }

  if (loading || !settings || draft === null) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Copiloto analítico"
          description="Habilite ou desabilite o assistente de perguntas em linguagem natural sobre seus dados. PRD-057."
        />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const handleSave = async () => {
    if (!canEdit) return;
    try {
      await update({ analyticsCopilotEnabled: draft }, "settings.analytics_copilot.update");
      toast.success("Configurações do copiloto analítico salvas.");
    } catch {
      toast.error("Não foi possível salvar as configurações do copiloto analítico.");
    }
  };

  const handleReset = () => {
    setDraft(baseline ?? true);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Copiloto analítico"
        description="Habilite ou desabilite o assistente de perguntas em linguagem natural sobre seus dados. PRD-057."
      />

      <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Icon icon="mdi:information-outline" className="mt-0.5 size-4 shrink-0" />
          <span>
            NLU por IA real (LLM) disponível na Fase 2 — atualmente baseado em interpretação por
            regras sobre o catálogo de métricas.
          </span>
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:eye-outline" className="size-4" />
            <span>Você está em modo de visualização. A edição requer permissão de Owner.</span>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon icon="mdi:robot-happy-outline" className="size-5 text-primary" />
            Disponibilidade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Copiloto analítico habilitado</p>
              <p className="text-xs text-muted-foreground">
                Quando ativo, o botão do copiloto aparece na barra superior (atalho Ctrl+K) e
                responde perguntas com valor, comparação e citação verificável. As respostas
                respeitam o escopo de cada papel (RBAC).
              </p>
            </div>
            <Switch
              checked={draft}
              onCheckedChange={(v) => setDraft(v)}
              disabled={!canEdit}
              aria-label="Habilitar o copiloto analítico"
            />
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
            Descartar
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      )}

      <UnsavedChangesDialog
        open={unsaved.promptOpen}
        onConfirmDiscard={unsaved.confirmDiscard}
        onCancel={unsaved.cancel}
      />
    </div>
  );
}
