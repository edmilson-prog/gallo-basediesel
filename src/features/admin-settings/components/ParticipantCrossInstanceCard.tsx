import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformSettings } from "../hooks/usePlatformSettings";

/**
 * Store-level access toggle (Portão A) — may a co-responsible (conversation
 * participant) read a conversation on an instance they don't otherwise access?
 *
 * Default OFF: the explicit invite still respects the origin number — the
 * instance is the master gate enforced by `can_access_conversation`. ON: the
 * invite lets the guest transit across instances. Persisted in
 * `stores.settings.participantCrossInstance` (Owner-only screen).
 */
export function ParticipantCrossInstanceCard({ storeId }: { storeId: string }) {
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const enabled = settings?.participantCrossInstance ?? false;
  const [pending, setPending] = useState(false);

  const onToggle = async (next: boolean) => {
    setPending(true);
    try {
      await update({ participantCrossInstance: next }, "settings.participant_cross_instance");
      toast.success(
        next
          ? "Convidados agora acessam conversas de outras instâncias."
          : "Convidados voltam a respeitar o número de origem.",
      );
    } catch {
      toast.error("Não foi possível salvar a configuração.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Icon icon="mdi:account-arrow-right-outline" size={20} className="text-primary" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Convidados acessam conversas de outras instâncias
            </p>
            <p className="max-w-prose text-xs text-muted-foreground">
              <strong>Desligado (padrão):</strong> um co-responsável só vê a conversa se também
              tiver acesso ao número de origem — o número é o portão-mestre.{" "}
              <strong>Ligado:</strong> o convite explícito a uma conversa basta, independentemente do
              número.
            </p>
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-6 w-11 rounded-full" />
        ) : (
          <Switch
            checked={enabled}
            disabled={saving || pending}
            onCheckedChange={(v) => void onToggle(v)}
            aria-label="Convidados acessam conversas de outras instâncias"
          />
        )}
      </div>
    </div>
  );
}
