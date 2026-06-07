import { useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import type { ID, IConversation, IWhatsAppAccount } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { CustomerProfileFiche } from "@/features/customers/components/CustomerProfileFiche";
import { useFicheButtonHandler } from "@/features/customers/hooks/useFicheLayout";
import { useConversationDetail } from "../hooks/useConversationDetail";
import { useConversationEscalation } from "@/features/sdr-escalation/hooks/useConversationEscalation";
import { ConversationHeader } from "../components/ConversationHeader";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { MessageList } from "../components/MessageList";
import { MessageInput } from "../components/MessageInput";
import { MetaWindowIndicator } from "../components/MetaWindowIndicator";
import { ConversationMenu } from "../components/ConversationMenu";
import { useConversationFiche } from "../hooks/useConversationFiche";
import { useMessages } from "../hooks/useMessages";
import { ConversationProvider } from "../hooks/ConversationContext";
import { CopilotStrip, CopilotCard, CopilotFicheTab, useCopilotPanel } from "@/features/copilot";
import {
  ConversationMediaGallery,
  useMediaGallery,
  useConversationMedia,
  useEnsureInboundMedia,
} from "@/features/media";
import {
  useScheduledSendRunner,
  useTrackableLinkSimulation,
  ScheduledList,
  ComboTray,
  useComboSend,
  useQuickSendBus,
  QuickSendBusProvider,
} from "@/features/quick-send";

function ConversationRunners({
  conversation,
  whatsappAccount,
  refreshDetail,
}: {
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  refreshDetail: () => void;
}) {
  useScheduledSendRunner(conversation, whatsappAccount);
  useTrackableLinkSimulation(conversation, refreshDetail);
  return null;
}

function ConversationComboTray({
  conversation,
  whatsappAccount,
}: {
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
}) {
  const { comboItems, reorderCombo, removeFromCombo, clearCombo } = useQuickSendBus();
  const { sendCombo, progress } = useComboSend(conversation, whatsappAccount);
  if (comboItems.length === 0) return null;
  return (
    <ComboTray
      items={comboItems}
      onReorder={reorderCombo}
      onRemove={removeFromCombo}
      onSendAll={async () => {
        await sendCombo(comboItems);
        clearCombo();
      }}
      progress={progress}
    />
  );
}

export function ConversationPage() {
  const { id } = useParams({ from: "/app/atendimento/$id" });
  const conversationId: ID = id;
  const detail = useConversationDetail(conversationId);
  const fiche = useConversationFiche();
  const media = useMediaGallery();
  const messages = useMessages(conversationId);
  const escalation = useConversationEscalation(conversationId);
  const copilot = useCopilotPanel(conversationId);
  const [draft, setDraft] = useState("");
  // Ready reply for the strip variant — reuses the boleto/NF heuristic from buildAiSuggestions
  const stripReply =
    copilot.placement === "strip" ? "Te envio o boleto e a NF ainda hoje." : undefined;
  const ficheButtonClick = useFicheButtonHandler({
    customerId: detail.conversation?.customerId ?? null,
    toggle: fiche.toggle,
  });

  // RF-006/007/008: archive inbound media without blocking render/send. For
  // every INBOUND message carrying media, resolve any already-archived asset
  // (by messageId) and let the hook decide create/dedup/retry. De-dup is
  // handled inside the hook (messageId/contentHash), so backfilling on every
  // load is a safe no-op; a per-session ref guards against duplicate fires
  // before the media cache refetches.
  const conversationMedia = useConversationMedia(conversationId);
  const { ensure } = useEnsureInboundMedia();
  const ensuredMessageIdsRef = useRef<Set<ID>>(new Set());
  const inboundMessages = messages.messages;
  const archivedAssets = conversationMedia.assets;
  useEffect(() => {
    const assetByMessageId = new Map<ID, (typeof archivedAssets)[number]>();
    for (const asset of archivedAssets) {
      if (asset.messageId) assetByMessageId.set(asset.messageId, asset);
    }
    for (const message of inboundMessages) {
      if (message.direction !== "in" || !message.mediaType) continue;
      const existing = assetByMessageId.get(message.id) ?? null;
      if (existing) {
        // Keep the guard in sync so we never re-fire for an already-archived msg.
        ensuredMessageIdsRef.current.add(message.id);
        continue;
      }
      if (ensuredMessageIdsRef.current.has(message.id)) continue;
      ensuredMessageIdsRef.current.add(message.id);
      // Fire-and-forget: never blocks the conversation (RNF-002 / RF-008).
      ensure(message, null);
    }
  }, [conversationId, inboundMessages, archivedAssets, ensure]);

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
      <QuickSendBusProvider>
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
                mediaOpen={media.open}
                onToggleMedia={media.toggle}
                menuSlot={
                  <ConversationMenu
                    conversation={conversation}
                    customer={customer}
                    lead={lead}
                    onMutated={detail.refresh}
                  />
                }
                escalation={escalation}
              />

              {copilot.placement === "card" && conversation.customerId && !copilot.error && (
                <CopilotCard panel={copilot} />
              )}

              <div className="min-h-0 flex-1">
                <MessageList conversation={conversation} />
              </div>

              <MetaWindowIndicator conversation={conversation} whatsappAccount={whatsappAccount} />

              {copilot.placement === "strip" && conversation.customerId && !copilot.error && (
                <CopilotStrip panel={copilot} reply={stripReply} onInsertReply={setDraft} />
              )}

              <ConversationRunners
                conversation={conversation}
                whatsappAccount={whatsappAccount}
                refreshDetail={detail.refresh}
              />
              <ConversationComboTray
                conversation={conversation}
                whatsappAccount={whatsappAccount}
              />
              <ScheduledList conversationId={conversationId} />
              <MessageInput
                conversation={conversation}
                whatsappAccount={whatsappAccount}
                onSent={detail.refresh}
                draft={draft}
                onDraftChange={setDraft}
                hideAiSuggestions={copilot.placement === "strip"}
              />
            </div>

            {conversation.customerId && (
              <CustomerProfileFiche
                customerId={conversation.customerId}
                conversation={conversation}
                open={fiche.open}
                onOpenChange={fiche.setOpen}
                copilotTab={
                  copilot.placement === "tab" && !copilot.error ? (
                    <CopilotFicheTab panel={copilot} />
                  ) : undefined
                }
              />
            )}
            <ConversationMediaGallery
              conversationId={conversationId}
              open={media.open}
              onOpenChange={media.setOpen}
            />
          </div>
        </ConversationProvider>
      </QuickSendBusProvider>
    </TooltipProvider>
  );
}
