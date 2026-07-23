import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStore } from "@/features/multistore";
import { DEFAULT_ECHO_CONTINUITY_WINDOW_HOURS } from "@/providers/whatsapp/echoContinuity";
import { SectionHeader } from "../components/SectionHeader";
import { usePlatformSettings } from "../hooks/usePlatformSettings";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";

const WINDOW_MIN = 0;
const WINDOW_MAX = 72;

/**
 * Configurações → Atendimento → Continuidade de conversas (decision
 * 2026-07-23 — docs/dev/conversation-split-echo-after-close.md §7 item 3).
 * Owner-only: governs the echo-continuity window the waha-webhook applies
 * when a phone-sent reply arrives after a conversation was resolved.
 */
export function EchoContinuitySettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const [draftHours, setDraftHours] = useState(DEFAULT_ECHO_CONTINUITY_WINDOW_HOURS);

  const savedHours = settings?.echoContinuity?.windowHours ?? DEFAULT_ECHO_CONTINUITY_WINDOW_HOURS;

  useEffect(() => {
    if (settings) setDraftHours(savedHours);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const dirty = useMemo(
    () => settings != null && draftHours !== savedHours,
    [settings, draftHours, savedHours],
  );
  const unsaved = useUnsavedChanges(dirty);

  const handleSave = async () => {
    if (!settings) return;
    try {
      await update(
        { echoContinuity: { windowHours: draftHours } },
        "settings.echo_continuity.update",
      );
      toast.success("Configuração salva", { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Continuidade de conversas"
          description="Evita que uma resposta enviada pelo celular logo após resolver divida o histórico em duas conversas."
        />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Continuidade de conversas"
        description="Evita que uma resposta enviada pelo celular logo após resolver divida o histórico em duas conversas."
      />

      <div className="space-y-6 rounded-lg border border-border bg-card p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:history" size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Janela de continuidade após resolver</span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums">
                {draftHours === 0 ? "—" : draftHours}
              </p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {draftHours === 0 ? "desligada" : draftHours === 1 ? "hora" : "horas"}
              </p>
            </div>
          </div>
          <Slider
            value={[draftHours]}
            min={WINDOW_MIN}
            max={WINDOW_MAX}
            step={1}
            onValueChange={(v) => setDraftHours(v[0] ?? draftHours)}
            aria-label="Janela de continuidade após resolver (horas)"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Desligada</span>
            <span>Atual: {savedHours === 0 ? "desligada" : `${savedHours}h`}</span>
            <span>{WINDOW_MAX}h</span>
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Como funciona:</strong> quando alguém do time
            responde um contato <em>pelo celular</em> e a conversa dele foi marcada como{" "}
            <strong className="text-foreground">Resolvida</strong> há menos tempo que a janela, a
            mensagem entra na mesma conversa —{" "}
            <strong className="text-foreground">sem reabri-la</strong>. Se o cliente responder
            depois, a conversa reabre normalmente, com o histórico inteiro no mesmo lugar.
          </p>
          <p>
            Fora da janela (ou com ela desligada), a resposta pelo celular abre uma conversa nova —
            o comportamento padrão para assuntos retomados dias depois. Conversas{" "}
            <strong className="text-foreground">arquivadas</strong> nunca participam, e mensagens do
            cliente sempre reabrem, em qualquer prazo.
          </p>
          <p>
            <strong className="text-foreground">Atenção:</strong> dentro da janela, a resposta
            enviada pelo celular <em>não aparece</em> na visão padrão da Inbox — a conversa continua
            Resolvida (o filtro padrão oculta resolvidas). Ela volta ao topo da fila quando o
            cliente responder e reabrir o atendimento.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            onClick={() => setDraftHours(savedHours)}
            disabled={!dirty || saving}
          >
            Descartar
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>

      <UnsavedChangesDialog
        open={unsaved.promptOpen}
        onConfirmDiscard={unsaved.confirmDiscard}
        onCancel={unsaved.cancel}
      />
    </div>
  );
}
