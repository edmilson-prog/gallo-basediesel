import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useRescueBroadcastQueue } from "../hooks/useRescueBroadcastQueue";

/** Visual cap (incident 2026-07-18): the panel must never take over the
 * screen — show a few cards and fold the rest behind "Mostrar mais". */
const MAX_VISIBLE = 3;

/**
 * Floating panel for online sellers showing every conversation currently
 * being rescued (spec 2026-07-17) — assigned to an absent seller, broadcast
 * to everyone eligible. First to click "Atender agora" claims it.
 */
export function RescueBroadcastClaim() {
  const { currentUser } = useAuth();
  const queue = useRescueBroadcastQueue();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  if (!currentUser) return null;
  if (queue.entries.length === 0) return null;

  const visible = showAll ? queue.entries : queue.entries.slice(0, MAX_VISIBLE);
  const hiddenCount = queue.entries.length - visible.length;

  return (
    <div
      role="region"
      aria-label="Conversas aguardando resgate"
      className="fixed bottom-20 right-4 z-50 flex max-h-[70vh] w-72 flex-col gap-2 overflow-y-auto md:bottom-4"
    >
      {visible.map(({ rescue, age }) => (
        <div
          key={rescue.id}
          className="rounded-md border border-amber-500/40 bg-amber-50 p-3 shadow-lg ring-1 ring-amber-500/20 dark:bg-amber-950/60"
        >
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-200">
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
      {hiddenCount > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="border-amber-500/40 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-200"
          onClick={() => setShowAll(true)}
        >
          Mostrar mais {hiddenCount} conversa{hiddenCount > 1 ? "s" : ""}
        </Button>
      )}
      {showAll && queue.entries.length > MAX_VISIBLE && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(false)}>
          Mostrar menos
        </Button>
      )}
    </div>
  );
}
