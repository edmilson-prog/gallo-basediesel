import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStore } from "@/features/multistore";
import {
  DEFAULT_INBOX_PINS_SETTINGS,
  MAX_PINNED,
  MIN_PINNED,
} from "@/features/conversations/config/pinDefaults";
import { SectionHeader } from "../components/SectionHeader";
import { usePlatformSettings } from "../hooks/usePlatformSettings";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";

/**
 * Configurações → Atendimento → Conversas fixadas (spec 2026-08-11).
 * Owner-only: sets HOW MANY conversations each attendant may keep pinned at the
 * top of the Inbox. Which ones to pin is each attendant's personal choice.
 */
export function InboxPinsSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const queryClient = useQueryClient();
  const [draftMax, setDraftMax] = useState(DEFAULT_INBOX_PINS_SETTINGS.maxPinned);

  const savedMax = settings?.inboxPins?.maxPinned ?? DEFAULT_INBOX_PINS_SETTINGS.maxPinned;

  useEffect(() => {
    if (settings) setDraftMax(savedMax);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const dirty = useMemo(
    () => settings != null && draftMax !== savedMax,
    [settings, draftMax, savedMax],
  );
  const unsaved = useUnsavedChanges(dirty);

  const handleSave = async () => {
    if (!settings) return;
    try {
      await update({ inboxPins: { maxPinned: draftMax } }, "settings.inbox_pins.update");
      // The Inbox reads the cap from the same ["platform-settings", storeId]
      // cache; without invalidating, the new limit would only apply after the
      // 30-minute staleTime.
      await queryClient.invalidateQueries({ queryKey: ["platform-settings", storeId] });
      toast.success("Configuração salva", { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Conversas fixadas"
          description="Quantas conversas cada atendente pode manter fixadas no topo do Inbox."
        />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Conversas fixadas"
        description="Quantas conversas cada atendente pode manter fixadas no topo do Inbox."
      />

      <div className="space-y-6 rounded-lg border border-border bg-card p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:pin-outline" size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Limite por atendente</span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums">{draftMax}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {draftMax === 1 ? "conversa" : "conversas"}
              </p>
            </div>
          </div>
          <Slider
            value={[draftMax]}
            min={MIN_PINNED}
            max={MAX_PINNED}
            step={1}
            onValueChange={(v) => setDraftMax(v[0] ?? draftMax)}
            aria-label="Limite de conversas fixadas por atendente"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{MIN_PINNED}</span>
            <span>Atual: {savedMax}</span>
            <span>{MAX_PINNED}</span>
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Como funciona:</strong> cada atendente escolhe as
            suas conversas fixadas — elas ficam no topo do Inbox dele mesmo quando envelhecem ou
            quando os filtros as excluiriam. Fixar{" "}
            <strong className="text-foreground">não muda o Inbox de mais ninguém</strong>.
          </p>
          <p>
            Ao atingir o limite, o atendente precisa desafixar uma conversa para fixar outra — nada
            é desafixado automaticamente.
          </p>
          <p>
            <strong className="text-foreground">Ao reduzir o limite:</strong> quem já tiver mais
            conversas fixadas do que o novo limite continua vendo todas elas, e apenas fica impedido
            de fixar novas até desafixar. Nenhuma conversa some da lista de ninguém.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            onClick={() => setDraftMax(savedMax)}
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
