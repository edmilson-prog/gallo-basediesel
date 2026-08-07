import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useRescueBroadcastQueue } from "../hooks/useRescueBroadcastQueue";

/**
 * Floating panel for online sellers showing every conversation currently
 * being rescued (spec 2026-07-17) — assigned to an absent seller, broadcast
 * to everyone eligible. First to click "Atender agora" claims it.
 */
export function RescueBroadcastClaim() {
  const { currentUser } = useAuth();
  const queue = useRescueBroadcastQueue();
  const navigate = useNavigate();

  if (!currentUser) return null;
  if (queue.entries.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Conversas aguardando resgate"
      className="fixed bottom-20 right-4 z-50 flex w-72 flex-col gap-2 md:bottom-4"
    >
      {queue.entries.map(({ rescue, age }) => (
        <div
          key={rescue.id}
          className="rounded-md border border-severity-warning/40 bg-severity-warning/10 p-3 shadow-lg ring-1 ring-severity-warning/20"
        >
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-severity-warning">
            <Icon icon="mdi:account-alert-outline" size={14} />
            RESPONSÁVEL AUSENTE · há {age}s
          </div>
          <div className="text-sm font-medium text-foreground">{rescue.contactName}</div>
          {rescue.lastInboundPreview && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {rescue.lastInboundPreview}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={async () => {
                try {
                  await queue.claim(rescue.id);
                  toast.success("Você assumiu a conversa.");
                  void navigate({
                    to: "/app/atendimento/$id",
                    params: { id: rescue.conversationId },
                  });
                } catch {
                  toast.error("Outro atendente já assumiu esta conversa.");
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
