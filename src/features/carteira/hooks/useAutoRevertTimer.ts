import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTransfersProvider } from "@/providers/data/hooks/useTransfersProvider";
import { useAuth } from "@/features/auth/useAuth";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";

const POLL_INTERVAL_MS = 60_000;

/**
 * Auto-revert timer (MVP).
 *
 * A cada {@link POLL_INTERVAL_MS}, busca transferências temporárias com
 * `autoRevertAt <= agora` e status `active`, então chama `expire` no provider.
 *
 * No MVP roda no front a cada 60s — qualquer tab aberta pode disparar a
 * reversão. Na Fase 2 este loop é substituído por uma Edge Function de
 * Supabase com cron real (`pg_cron`/`pg_net`), evitando depender do app aberto.
 */
export function useAutoRevertTimer(enabled: boolean) {
  const provider = useTransfersProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  // Whichever seller's browser tab happens to run the tick is attributed as
  // the actor — the closest available signal, since there is no true "system"
  // identity: `audit_logs.actor_id` is a NOT NULL FK to sellers.
  const actorId = currentUser?.sellerId;
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function tick() {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const result = await provider.list({
          statuses: ["active"],
          types: ["temporary"],
          pageSize: 200,
        });
        const now = Date.now();
        const expiring = result.data.filter((t) => {
          if (!t.autoRevertAt) return false;
          return new Date(t.autoRevertAt).getTime() <= now;
        });
        if (expiring.length === 0) return;
        for (const t of expiring) {
          if (cancelled) return;
          try {
            await provider.expire(t.id, actorId);
            toast(CARTEIRA_STRINGS.notifications.autoReverted, {
              icon: "⏱",
            });
          } catch {
            // Falha silenciosa por transferência — próxima iteração tenta de novo
          }
        }
        if (!cancelled) {
          void queryClient.invalidateQueries({ queryKey: ["carteira-transfers"] });
          void queryClient.invalidateQueries({ queryKey: ["customers"] });
          void queryClient.invalidateQueries({ queryKey: ["customers-list"] });
          void queryClient.invalidateQueries({ queryKey: ["customer-detail"] });
        }
      } finally {
        runningRef.current = false;
      }
    }

    // Disparo imediato e depois a cada POLL_INTERVAL_MS
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [provider, queryClient, enabled, actorId]);
}
