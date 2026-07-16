import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useCurrentStore } from "@/features/multistore";
import { useSdrPilotSettingsProvider, useWhatsAppAccountsProvider } from "@/providers/data";
import type { ISdrPilotSettings, IWhatsAppAccount } from "@/shared/types";

export interface ISdrSettingsTabProps {
  canEdit: boolean;
  onJumpToTemplates: () => void;
}

export function SdrSettingsTab({ canEdit, onJumpToTemplates }: ISdrSettingsTabProps) {
  const { currentStoreId } = useCurrentStore();
  const pilotProvider = useSdrPilotSettingsProvider();
  const accountsProvider = useWhatsAppAccountsProvider();

  const [pilot, setPilot] = useState<ISdrPilotSettings | null>(null);
  const [timeoutInput, setTimeoutInput] = useState("2");
  const [accounts, setAccounts] = useState<IWhatsAppAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentStoreId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      pilotProvider.get(currentStoreId),
      accountsProvider.list({ storeId: currentStoreId }),
      accountsProvider.listWaha({ storeId: currentStoreId }),
    ]).then(([settings, list, waha]) => {
      if (cancelled) return;
      const merged = new Map<string, IWhatsAppAccount>();
      for (const a of [...list, ...waha]) merged.set(a.id, a);
      setPilot(settings);
      setTimeoutInput(String(settings.backstopTimeoutMinutes));
      setAccounts([...merged.values()]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [currentStoreId, pilotProvider, accountsProvider]);

  const patchPilot = async (p: { sdrEnabled?: boolean; backstopTimeoutMinutes?: number }) => {
    if (!currentStoreId) return;
    try {
      const updated = await pilotProvider.update(currentStoreId, p);
      setPilot(updated);
      toast.success("Alterações salvas.");
    } catch {
      toast.error("Não foi possível salvar as alterações.");
    }
  };

  const toggleInstance = async (account: IWhatsAppAccount, next: boolean) => {
    try {
      const updated = await accountsProvider.update(account.id, { sdrEnabled: next });
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success("Alterações salvas.");
    } catch {
      toast.error("Não foi possível salvar as alterações.");
    }
  };

  if (!currentStoreId) {
    return (
      <p className="text-sm text-muted-foreground">Selecione uma loja para configurar o SDR.</p>
    );
  }
  if (loading || !pilot) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="rounded-md border border-amber-200/40 bg-amber-50/50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-500/10 dark:text-amber-100">
          <span className="inline-flex items-center gap-2">
            <Icon icon="mdi:shield-lock-outline" size={14} />
            Configurações em modo leitura. Edição requer permissão de Owner.
          </span>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon icon="mdi:robot-outline" size={16} className="text-primary" />
          Piloto
        </h3>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium">SDR ativo nesta loja</span>
          <Switch
            checked={pilot.sdrEnabled}
            onCheckedChange={(v) => void patchPilot({ sdrEnabled: v })}
            disabled={!canEdit}
            aria-label="SDR ativo nesta loja"
          />
        </div>
        <label className="mt-4 block text-xs text-muted-foreground">
          Tempo de espera até o SDR assumir (minutos)
          <input
            type="number"
            min={1}
            max={60}
            value={timeoutInput}
            disabled={!canEdit}
            onChange={(e) => setTimeoutInput(e.target.value)}
            onBlur={() => {
              const parsed = Math.min(60, Math.max(1, Number(timeoutInput) || 2));
              setTimeoutInput(String(parsed));
              if (pilot && parsed !== pilot.backstopTimeoutMinutes) {
                void patchPilot({ backstopTimeoutMinutes: parsed });
              }
            }}
            className="mt-1 w-full max-w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Fora do horário comercial, o SDR assume imediatamente.
        </p>
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Icon icon="mdi:directions-fork" className="mt-0.5 size-4 shrink-0 text-primary" />
          Provedor, modelo e prompt de sistema do SDR são configurados em Configurações →
          Inteligência artificial → Funcionalidades.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon icon="mdi:cellphone-message" size={16} className="text-primary" />
          Instâncias
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Escolha em quais números WhatsApp o SDR atua. Nenhum ativado por padrão.
        </p>
        <div className="mt-3 space-y-2">
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma instância WhatsApp cadastrada nesta loja.
            </p>
          )}
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{account.label}</p>
                <p className="text-xs text-muted-foreground">{account.phoneNumber || "—"}</p>
              </div>
              <Switch
                checked={account.sdrEnabled}
                onCheckedChange={(v) => void toggleInstance(account, v)}
                disabled={!canEdit}
                aria-label={`SDR ativo em ${account.label}`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 opacity-60">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon icon="mdi:file-document-outline" size={16} className="text-primary" />
            Orçamento automático
          </h3>
          <Badge variant="secondary">Em breve</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          O SDR real ainda não gera orçamento nem aplica desconto — segue recepção e triagem, sem
          mencionar valores.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Validade padrão</span>
              <span className="text-xs text-muted-foreground tabular-nums">7 dias</span>
            </div>
            <Slider value={[7]} min={1} max={30} step={1} disabled className="mt-3" />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Desconto autorizado</span>
              <span className="text-xs text-muted-foreground tabular-nums">0%</span>
            </div>
            <Slider value={[0]} min={0} max={10} step={1} disabled className="mt-3" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 opacity-60">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon icon="mdi:account-arrow-right-outline" size={16} className="text-primary" />
            Escalonamento
          </h3>
          <Badge variant="secondary">Em breve</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Timeout de resposta e broadcast urgente chegam numa entrega separada (Parte D).
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Timeout fila urgente</span>
              <span className="text-xs text-muted-foreground tabular-nums">5 min</span>
            </div>
            <Slider value={[5]} min={1} max={30} step={1} disabled className="mt-3" />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Timeout fila normal</span>
              <span className="text-xs text-muted-foreground tabular-nums">30 min</span>
            </div>
            <Slider value={[30]} min={5} max={60} step={5} disabled className="mt-3" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon icon="mdi:message-text-outline" size={16} className="text-primary" />
          Templates
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Os textos editados aqui não alimentam o SDR real hoje — o prompt real vive em
          Funcionalidades.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onJumpToTemplates}
          className="mt-3 gap-1"
        >
          <Icon icon="mdi:arrow-right" size={14} />
          Ir para aba Templates
        </Button>
      </div>
    </div>
  );
}
