import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useCollaboratorAddedListener } from "../hooks/useCollaboratorAddedListener";

/**
 * Floating card shown when the signed-in seller is added as a collaborator on
 * a conversation — visual structure copied from
 * `src/features/version-update/components/VersionUpdatePrompt.tsx` (fixed
 * bottom-right card + minimized badge), different trigger (realtime event
 * instead of a deploy-version poll) and content. Mounted once in AppLayout.
 */
export function CollaboratorAddedPrompt() {
  const { events, dismiss } = useCollaboratorAddedListener();
  const navigate = useNavigate();
  const [minimized, setMinimized] = useState(false);

  if (events.length === 0) return null;
  const current = events[0]!;

  const openConversation = () => {
    dismiss(0);
    setMinimized(false);
    void navigate({ to: "/app/atendimento/$id", params: { id: current.conversationId } });
  };

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        aria-label="Você foi adicionado a uma conversa"
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-lg outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info/60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-info" />
        </span>
        Novo colaborador
      </button>
    );
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-4 shadow-xl"
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10">
          <Icon icon="mdi:account-multiple-plus-outline" size={20} className="text-info" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Você foi adicionado a uma conversa</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {current.addedByName} te adicionou na conversa com {current.customerName}.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={openConversation}>
          Abrir conversa
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMinimized(true)}>
          Depois
        </Button>
      </div>
    </div>
  );
}
