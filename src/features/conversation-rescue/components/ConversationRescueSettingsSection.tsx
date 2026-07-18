import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import type { ID, IConversationRescueSettings, ISeller } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";
import { useConversationRescueSettings } from "../hooks/useConversationRescueSettings";

const MINUTES_MIN = 1;
const MINUTES_MAX = 120;
const HOURS_MIN = 1;
const HOURS_MAX = 72;

function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return MINUTES_MIN;
  return Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, Math.round(value)));
}

function clampHours(value: number): number {
  if (!Number.isFinite(value)) return HOURS_MIN;
  return Math.min(HOURS_MAX, Math.max(HOURS_MIN, Math.round(value)));
}

export interface IConversationRescueSettingsSectionProps {
  storeId: ID | null;
}

/** Per-store offline-rescue settings card (spec 2026-07-17). Owner-only screen. */
export function ConversationRescueSettingsSection({ storeId }: IConversationRescueSettingsSectionProps) {
  const { settings, loading, saving, update } = useConversationRescueSettings(storeId);
  const [draft, setDraft] = useState<IConversationRescueSettings>(settings);
  const sellersProvider = useSellersProvider();
  const [sellers, setSellers] = useState<ISeller[]>([]);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    if (!storeId) return;
    sellersProvider.list({ storeId, active: true }).then(setSellers);
  }, [sellersProvider, storeId]);

  const toggleFallback = (sellerId: ID) => {
    setDraft((d) => ({
      ...d,
      fallbackSellerIds: d.fallbackSellerIds.includes(sellerId)
        ? d.fallbackSellerIds.filter((id) => id !== sellerId)
        : [...d.fallbackSellerIds, sellerId],
    }));
  };

  const handleSave = async () => {
    try {
      await update({
        enabled: draft.enabled,
        temporaryAbsenceGraceMinutes: clampMinutes(draft.temporaryAbsenceGraceMinutes),
        forceAssignTimeoutMinutes: clampMinutes(draft.forceAssignTimeoutMinutes),
        fallbackSellerIds: draft.fallbackSellerIds,
        maxClientWaitHours: clampHours(draft.maxClientWaitHours),
      });
      toast.success("Configurações salvas.");
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  if (loading) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Resgate de conversas</h3>
          <p className="text-xs text-muted-foreground">
            Oferece a conversa a outro atendente online quando o responsável está ausente; força
            uma atribuição se ninguém assumir.
          </p>
        </div>
        <Switch
          checked={draft.enabled}
          onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
          aria-label="Ativar resgate de conversas"
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rescue-grace" className="text-xs">
            Folga p/ ausência temporária (min)
          </Label>
          <Input
            id="rescue-grace"
            type="number"
            min={MINUTES_MIN}
            max={MINUTES_MAX}
            value={draft.temporaryAbsenceGraceMinutes}
            disabled={!draft.enabled}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                temporaryAbsenceGraceMinutes: clampMinutes(Number(e.target.value)),
              }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rescue-force-timeout" className="text-xs">
            Prazo até forçar atribuição (min)
          </Label>
          <Input
            id="rescue-force-timeout"
            type="number"
            min={MINUTES_MIN}
            max={MINUTES_MAX}
            value={draft.forceAssignTimeoutMinutes}
            disabled={!draft.enabled}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                forceAssignTimeoutMinutes: clampMinutes(Number(e.target.value)),
              }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rescue-max-wait" className="text-xs">
            Janela máx. de espera do cliente (h)
          </Label>
          <Input
            id="rescue-max-wait"
            type="number"
            min={HOURS_MIN}
            max={HOURS_MAX}
            value={draft.maxClientWaitHours}
            disabled={!draft.enabled}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                maxClientWaitHours: clampHours(Number(e.target.value)),
              }))
            }
          />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Esperas mais antigas que isso não geram resgate — ficam com os alertas de ociosidade.
          </p>
        </div>
      </div>
      <div className="mt-4">
        <Label className="text-xs">Reserva para atribuição forçada</Label>
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-3">
          {sellers.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.fallbackSellerIds.includes(s.id)}
                disabled={!draft.enabled}
                onCheckedChange={() => toggleFallback(s.id)}
              />
              {s.fullName}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          Salvar
        </Button>
      </div>
    </section>
  );
}
