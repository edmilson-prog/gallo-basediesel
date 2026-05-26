import { useNavigate } from "@tanstack/react-router";
import type {
  IConversation,
  ICustomer,
  ILead,
  ISdrEscalation,
  IWhatsAppAccount,
} from "@/shared/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CHANNEL_META, getConversationDisplay } from "../utils/conversationDisplay";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { EscalationBadge } from "@/features/sdr-escalation/components/EscalationBadge";

export interface IConversationHeaderProps {
  conversation: IConversation;
  customer: ICustomer | null;
  lead: ILead | null;
  whatsappAccount: IWhatsAppAccount | null;
  ficheOpen: boolean;
  onToggleFiche: () => void;
  /** Action menu rendered as a popover trigger (kebab). */
  menuSlot?: React.ReactNode;
  /** SDR escalation record bound to this conversation (PRD-023), when any. */
  escalation?: ISdrEscalation | null;
}

const STATUS_TONE: Record<IConversation["status"], string> = {
  aguardando: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30",
  em_andamento:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
  aguardando_cliente: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30",
  resolvida: "bg-muted text-muted-foreground border border-border",
  arquivada: "bg-muted text-muted-foreground border border-border opacity-70",
};

export function ConversationHeader({
  conversation,
  customer,
  lead,
  whatsappAccount,
  ficheOpen,
  onToggleFiche,
  menuSlot,
  escalation,
}: IConversationHeaderProps) {
  const display = getConversationDisplay(conversation, customer, lead);
  const channel = CHANNEL_META[conversation.channel];
  const navigate = useNavigate();

  const channelSubtitle = (() => {
    if (conversation.channel === "whatsapp") {
      const phone = display.phone || whatsappAccount?.phoneNumber || "";
      return phone ? `${channel.label} • ${phone}` : channel.label;
    }
    return display.phone ? `${channel.label} • ${display.phone}` : channel.label;
  })();

  const handleCreateQuote = () => {
    const target = conversation.customerId
      ? `/app/orcamentos?customerId=${conversation.customerId}&conversationId=${conversation.id}`
      : `/app/orcamentos?conversationId=${conversation.id}`;
    void navigate({ to: target });
  };

  const avatarBg = `hsl(${display.hue} 70% 88%)`;
  const avatarFg = `hsl(${display.hue} 60% 28%)`;

  return (
    <header className="shrink-0 border-b border-border bg-card">
      <div className="flex h-16 items-center gap-3 px-4">
        <Avatar className="h-10 w-10">
          <AvatarFallback
            className="font-semibold"
            style={{ backgroundColor: avatarBg, color: avatarFg }}
            aria-hidden
          >
            {display.initials}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{display.name}</h2>
            {conversation.isSdrActive && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  >
                    {CONVERSATION_STRINGS.sdrActiveTag}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{CONVERSATION_STRINGS.sdrActiveTooltip}</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                channel.tone,
              )}
            >
              <Icon icon={channel.icon} size={12} />
              <span className="truncate">{channelSubtitle}</span>
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                STATUS_TONE[conversation.status],
              )}
            >
              {CONVERSATION_STRINGS.statusLabel[conversation.status]}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="default" size="sm" className="gap-1.5" onClick={handleCreateQuote}>
            <Icon icon="mdi:file-document-plus-outline" size={14} />
            <span className="hidden md:inline">{CONVERSATION_STRINGS.createQuote}</span>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={ficheOpen ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
                onClick={onToggleFiche}
                aria-pressed={ficheOpen}
              >
                <Icon icon="mdi:account-details" size={14} />
                <span className="hidden md:inline">{CONVERSATION_STRINGS.toggleFiche}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{CONVERSATION_STRINGS.toggleFiche}</TooltipContent>
          </Tooltip>
          {menuSlot}
        </div>
      </div>
      {escalation && (
        <div className="border-t border-border/60 bg-muted/40 px-4 py-1.5">
          <EscalationBadge mode={escalation.mode} banner />
        </div>
      )}
    </header>
  );
}
