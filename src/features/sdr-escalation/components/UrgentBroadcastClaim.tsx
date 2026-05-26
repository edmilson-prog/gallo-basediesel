import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useUrgentBroadcastQueue } from "../hooks/useUrgentBroadcastQueue";

/**
 * Renders a floating panel for online sellers showing every urgent escalation
 * currently broadcasting (PRD-023 — fluxo urgent). First seller to click
 * "Atender" claims it; others are dismissed automatically once `claim()`
 * patches the escalation.
 *
 * Mounted at the AppLayout level (mobile-friendly: bottom-right fixed). Hides
 * itself when the broadcast queue is empty.
 */
export function UrgentBroadcastClaim() {
  const { currentUser } = useAuth();
  const queue = useUrgentBroadcastQueue();
  const navigate = useNavigate();

  // Toast for *new* broadcasts is delivered by `useEscalationToasts` already;
  // here we only render the persistent claim affordance until taken.
  useEffect(() => {
    // No-op — the queue itself drives the rendering.
  }, []);

  if (!currentUser) return null;
  if (queue.entries.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Escalações urgentes aguardando atendimento"
      className="fixed bottom-20 right-4 z-50 flex w-72 flex-col gap-2 md:bottom-4"
    >
      {queue.entries.map(({ escalation, age }) => (
        <div
          key={escalation.id}
          className="rounded-md border border-red-500/40 bg-red-50 p-3 shadow-lg ring-1 ring-red-500/20 dark:bg-red-950/60"
        >
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-200">
            <Icon icon="mdi:alert-octagon" size={14} />
            URGENTE · aguardando há {age}s
          </div>
          <div className="text-sm font-medium text-foreground">
            {escalation.contextSummary.customerName ?? "Cliente sem cadastro"}
          </div>
          {escalation.contextSummary.partIdentified && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {escalation.contextSummary.partIdentified.name}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={async () => {
                try {
                  await queue.claim(escalation.id, currentUser.id, {
                    storeId: escalation.storeId,
                  });
                  toast.success("Você assumiu a conversa.");
                  void navigate({
                    to: "/app/atendimento/$id",
                    params: { id: escalation.conversationId },
                  });
                } catch {
                  toast.error("Outro vendedor já assumiu esta conversa.");
                }
              }}
            >
              Atender agora
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
