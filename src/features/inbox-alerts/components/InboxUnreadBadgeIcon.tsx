import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useInboxActivity } from "../hooks/useInboxActivity";

/** TopBar icon: red dot when there's pending Inbox activity (mine or queue). Click navigates to the Inbox. */
export function InboxUnreadBadgeIcon() {
  const navigate = useNavigate();
  const hasActivity = useInboxActivity();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={hasActivity ? "Você tem mensagens novas na Inbox" : "Sem mensagens novas na Inbox"}
      title="Inbox"
      onClick={() => void navigate({ to: "/app/atendimento" })}
    >
      <Icon icon="mdi:inbox-arrow-down-outline" size={20} />
      {hasActivity && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive"
        />
      )}
    </Button>
  );
}
