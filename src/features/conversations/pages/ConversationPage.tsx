import { useParams } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { CustomerProfileFiche } from "@/features/customers/components/CustomerProfileFiche";
import { useFicheButtonHandler } from "@/features/customers/hooks/useFicheLayout";
import { useConversationDetail } from "../hooks/useConversationDetail";
import { ConversationHeader } from "../components/ConversationHeader";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { MessageList } from "../components/MessageList";
import { MessageInput } from "../components/MessageInput";
import { MetaWindowIndicator } from "../components/MetaWindowIndicator";
import { ConversationMenu } from "../components/ConversationMenu";
import { useConversationFiche } from "../hooks/useConversationFiche";
import { useMessages } from "../hooks/useMessages";
import { ConversationProvider } from "../hooks/ConversationContext";

export function ConversationPage() {
  const { id } = useParams({ from: "/app/atendimento/$id" });
  const conversationId: ID = id;
  const detail = useConversationDetail(conversationId);
  const fiche = useConversationFiche();
  const messages = useMessages(conversationId);
  const ficheButtonClick = useFicheButtonHandler({
    customerId: detail.conversation?.customerId ?? null,
    toggle: fiche.toggle,
  });

  if (detail.isLoading && !detail.conversation) {
    return (
      <div
        className="flex h-full items-center justify-center text-xs text-muted-foreground"
        aria-busy="true"
      >
        <Icon icon="mdi:loading" className="mr-2 animate-spin" size={16} />
        {CONVERSATION_STRINGS.loading}
      </div>
    );
  }

  if (detail.notFound || !detail.conversation) {
    return (
      <EmptyState
        icon="mdi:message-off-outline"
        title={CONVERSATION_STRINGS.notFound.title}
        description={CONVERSATION_STRINGS.notFound.description}
        actionLabel={CONVERSATION_STRINGS.backToInbox}
        actionTo="/app/atendimento"
      />
    );
  }

  const { conversation, customer, lead, whatsappAccount } = detail;

  return (
    <TooltipProvider delayDuration={200}>
      <ConversationProvider value={{ messages }}>
        <div className="flex h-full min-h-0 bg-background">
          <div className="flex h-full min-h-0 flex-1 flex-col">
            <ConversationHeader
              conversation={conversation}
              customer={customer}
              lead={lead}
              whatsappAccount={whatsappAccount}
              ficheOpen={fiche.open}
              onToggleFiche={ficheButtonClick}
              menuSlot={
                <ConversationMenu
                  conversation={conversation}
                  customer={customer}
                  lead={lead}
                  onMutated={detail.refresh}
                />
              }
            />

            <div className="min-h-0 flex-1">
              <MessageList conversation={conversation} />
            </div>

            <MetaWindowIndicator conversation={conversation} whatsappAccount={whatsappAccount} />

            <MessageInput
              conversation={conversation}
              whatsappAccount={whatsappAccount}
              onSent={detail.refresh}
            />
          </div>

          {conversation.customerId && (
            <CustomerProfileFiche
              customerId={conversation.customerId}
              conversation={conversation}
              open={fiche.open}
              onOpenChange={fiche.setOpen}
            />
          )}
        </div>
      </ConversationProvider>
    </TooltipProvider>
  );
}
