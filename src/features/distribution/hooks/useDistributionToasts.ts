import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/useAuth";
import { useDistributionTracesProvider } from "@/providers/data";

const POLL_INTERVAL_MS = 9_000;

/**
 * Watches the distribution trace stream and surfaces a toast every time the
 * routing engine assigns a brand-new conversation to the current vendedor.
 *
 * Lives at the AppLayout level so vendedores receive the alert regardless of
 * which screen they're on. On Fase 2 the polling pattern is replaced by a
 * Supabase Realtime subscription on the `distribution_traces` table.
 */
export function useDistributionToasts(): void {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const tracesProvider = useDistributionTracesProvider();
  const sellerId = currentUser?.sellerId ?? null;
  const seenRef = useRef<Set<string>>(new Set());
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    seenRef.current = new Set();
    bootstrappedRef.current = false;
  }, [sellerId]);

  useEffect(() => {
    if (!sellerId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const page = await tracesProvider.list({
          selectedSellerId: sellerId,
          pageSize: 20,
        });
        if (cancelled) return;
        if (!bootstrappedRef.current) {
          // First run only seeds the "already seen" set so the user isn't
          // bombarded with toasts for historical assignments.
          for (const trace of page.data) seenRef.current.add(trace.id);
          bootstrappedRef.current = true;
          return;
        }
        for (const trace of page.data) {
          if (seenRef.current.has(trace.id)) continue;
          seenRef.current.add(trace.id);
          toast.message("Nova conversa atribuída a você", {
            description: `Critério: ${describeCriterion(trace.criterionMatched)}`,
            action: {
              label: "Ver",
              onClick: () => {
                void navigate({
                  to: "/app/atendimento/$id",
                  params: { id: trace.conversationId },
                });
              },
            },
          });
        }
      } catch {
        // best-effort polling — never surface as error
      }
    };

    void tick();
    const interval = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sellerId, tracesProvider, navigate]);
}

function describeCriterion(criterion: string): string {
  const labels: Record<string, string> = {
    carteira: "Carteira existente",
    especialidade: "Especialidade",
    round_robin: "Round-robin",
    carga: "Carga",
    fallback_sdr: "SDR (fallback)",
    fallback_fila: "Fila",
  };
  return labels[criterion] ?? criterion;
}
