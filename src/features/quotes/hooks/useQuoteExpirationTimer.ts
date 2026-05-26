import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuotesProvider } from "@/providers/data/hooks/useQuotesProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";

const POLL_INTERVAL_MS = 60 * 60_000; // 1 hour (PRD-031 RF-032)

/**
 * Quote expiration timer.
 *
 * Every hour, find quotes with `status='enviado'` and `validUntil < now`
 * and transition them to `expirado`. Mock-only — Fase 2 moves this to an
 * Edge Function with `pg_cron`.
 */
export function useQuoteExpirationTimer(enabled: boolean) {
  const provider = useQuotesProvider();
  const queryClient = useQueryClient();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function tick() {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const result = await provider.list({ status: "enviado", pageSize: 500 });
        const now = Date.now();
        const expired = result.data.filter((q) => new Date(q.validUntil).getTime() < now);
        if (expired.length === 0) return;
        for (const q of expired) {
          if (cancelled) return;
          try {
            await provider.update(q.id, { status: "expirado" });
            auditLog({
              action: "quote_expired",
              resource: "quote",
              resourceId: q.id,
              before: { status: "enviado" },
              after: { status: "expirado" },
            });
          } catch {
            // Falha silenciosa — próxima iteração tenta de novo.
          }
        }
        if (!cancelled) {
          void queryClient.invalidateQueries({ queryKey: ["quotes-list"] });
          void queryClient.invalidateQueries({ queryKey: ["quote"] });
        }
      } finally {
        runningRef.current = false;
      }
    }

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [provider, queryClient, enabled]);
}
