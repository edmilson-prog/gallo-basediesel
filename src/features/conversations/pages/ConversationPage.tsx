import { useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import type { ID, IConversation, IWhatsAppAccount } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { CustomerProfileFiche } from "@/features/customers/components/CustomerProfileFiche";
import { useFicheButtonHandler } from "@/features/customers/hooks/useFicheLayout";
import { useConversationDetail } from "../hooks/useConversationDetail";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { mustAssignToReply } from "../engine/assignmentGate";
import { useConversationEscalation } from "@/features/sdr-escalation/hooks/useConversationEscalation";
import { ConversationHeader } from "../components/ConversationHeader";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { MessageList } from "../components/MessageList";
import { MessageInput } from "../components/MessageInput";
import { MetaWindowIndicator } from "../components/MetaWindowIndicator";
import { ConversationMenu } from "../components/ConversationMenu";
import { useConversationFiche } from "../hooks/useConversationFiche";
import { useStatusControlMode } from "../hooks/useStatusControlMode";
import { useMessages } from "../hooks/useMessages";
import { useRealtimeMessages } from "../hooks/useRealtimeMessages";
import { useConversationPresenceTracker } from "../hooks/useConversationPresence";
import { ConversationProvider } from "../hooks/ConversationContext";
import { CopilotStrip, CopilotCard, CopilotFicheTab, useCopilotPanel } from "@/features/copilot";
import { useMediaGallery, useConversationMedia, useEnsureInboundMedia } from "@/features/media";
import { ConversationMediaPanel } from "../components/media/ConversationMediaPanel";
import {
  useScheduledSendRunner,
  useTrackableLinkSimulation,
  ComboTray,
  useComboSend,
  useQuickSendBus,
  QuickSendBusProvider,
} from "@/features/quick-send";
import { PartLookupPanel, useConsultorPanel, appendToDraft } from "@/features/part-lookup";
import { AttendanceHistoryPanel } from "@/features/attendance-history";

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
  disabled = false,
}: {
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  disabled?: boolean;
}) {
  const { comboItems, reorderCombo, removeFromCombo, clearCombo } = useQuickSendBus();
  const { sendCombo, progress } = useComboSend(conversation, whatsappAccount);
  if (disabled || comboItems.length === 0) return null;
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
  // Staff (Owner/Gestor) see store-wide conversations → surface who's handling each.
  const showAssignee = usePermission("conversation", "view", "store");
  const fiche = useConversationFiche();
  const media = useMediaGallery();
  const messages = useMessages(conversationId);
  // PRD-118: live INSERT/UPDATE stream of this conversation (supabase only).
  // `syncLatest` is the conversations-channel fallback for missed messages
  // INSERTs — see useRealtimeMessages.
  useRealtimeMessages(conversationId, messages.applyRealtimeRow, messages.syncLatest);
  // Live "who's viewing this conversation now" signal — independent of the
  // message cache above; a pure Presence broadcast, not a data read.
  useConversationPresenceTracker(conversationId);
  const escalation = useConversationEscalation(conversationId);
  const copilot = useCopilotPanel(conversationId);
  // Status-control display mode (per-device). Lifted here so the header's
  // StatusControl and the kebab's mode sub-menu share one source of truth.
  const { mode: statusControlMode, setMode: setStatusControlMode } = useStatusControlMode();
  const [draft, setDraft] = useState("");
  // SessionBanner CTA → template picker bridge (PRD-117): each click bumps the
  // counter and the MessageInput effect opens its dialog.
  const [templateSignal, setTemplateSignal] = useState(0);
  const ficheButtonClick = useFicheButtonHandler({
    customerId: detail.conversation?.customerId ?? null,
    toggle: fiche.toggle,
  });
  const consultor = useConsultorPanel();
  const [historyOpen, setHistoryOpen] = useState(false);

  // The right rail is mutually exclusive: opening one panel closes the others.
  const openConsultor = () => {
    fiche.setOpen(false);
    media.setOpen(false);
    setHistoryOpen(false);
    consultor.setOpen(true);
  };
  const toggleConsultor = () => (consultor.open ? consultor.setOpen(false) : openConsultor());
  const toggleFicheExclusive = () => {
    if (!fiche.open) {
      media.setOpen(false);
      consultor.setOpen(false);
      setHistoryOpen(false);
    }
    ficheButtonClick();
  };
  const toggleMediaExclusive = () => {
    if (!media.open) {
      fiche.setOpen(false);
      consultor.setOpen(false);
      setHistoryOpen(false);
    }
    media.toggle();
  };
  const toggleHistoryExclusive = () => {
    if (!historyOpen) {
      fiche.setOpen(false);
      media.setOpen(false);
      consultor.setOpen(false);
    }
    setHistoryOpen((prev) => !prev);
  };

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
      // No-byte structured shares (location/contact) are filtered inside the
      // shared gate (resolveInboundAsset / NON_ARCHIVABLE_MEDIA_TYPES), so ensure()
      // below is a safe no-op for them — single source of truth, no inline list.
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

  const { conversation, customer, lead, contact, whatsappAccount, assignedSeller, collaborators } =
    detail;

  // Pool gate: non-staff must self-assign before replying. Staff (store-wide
  // viewers) are exempt — same predicate as showAssignee.
  const mustAssign = mustAssignToReply(conversation, { isStaff: showAssignee });

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
                contact={contact}
                assignedSeller={assignedSeller}
                showAssignee={showAssignee}
                ficheOpen={fiche.open}
                onToggleFiche={toggleFicheExclusive}
                mediaOpen={media.open}
                onToggleMedia={toggleMediaExclusive}
                consultorOpen={consultor.open}
                onToggleConsultor={toggleConsultor}
                historyOpen={historyOpen}
                onToggleHistory={toggleHistoryExclusive}
                menuSlot={
                  <ConversationMenu
                    conversation={conversation}
                    customer={customer}
                    lead={lead}
                    onMutated={detail.refresh}
                    statusControlMode={statusControlMode}
                    onStatusControlModeChange={setStatusControlMode}
                  />
                }
                escalation={escalation}
                onCustomerUpdated={detail.refresh}
                onConversationUpdated={detail.refresh}
                statusControlMode={statusControlMode}
              />

              {copilot.placement === "card" && conversation.customerId && !copilot.error && (
                <CopilotCard
                  panel={copilot}
                  conversationId={conversation.id}
                  onInsertReply={setDraft}
                />
              )}

              <div className="min-h-0 flex-1">
                <MessageList conversation={conversation} whatsappAccount={whatsappAccount} />
              </div>

              <MetaWindowIndicator
                conversation={conversation}
                whatsappAccount={whatsappAccount}
                onSelectTemplate={() => setTemplateSignal((s) => s + 1)}
              />

              {copilot.placement === "strip" && conversation.customerId && !copilot.error && (
                <CopilotStrip
                  panel={copilot}
                  conversationId={conversation.id}
                  onInsertReply={setDraft}
                />
              )}

              <ConversationRunners
                conversation={conversation}
                whatsappAccount={whatsappAccount}
                refreshDetail={detail.refresh}
              />
              <ConversationComboTray
                conversation={conversation}
                whatsappAccount={whatsappAccount}
                disabled={mustAssign}
              />
              <MessageInput
                conversation={conversation}
                whatsappAccount={whatsappAccount}
                onSent={detail.refresh}
                draft={draft}
                onDraftChange={setDraft}
                hideAiSuggestions={copilot.placement === "strip"}
                openTemplateSignal={templateSignal}
                mustAssignToReply={mustAssign}
                onAssigned={detail.refresh}
                onOpenPartLookup={openConsultor}
              />
            </div>

            {conversation.customerId && (
              <CustomerProfileFiche
                customerId={conversation.customerId}
                conversation={conversation}
                assignedSeller={assignedSeller}
                whatsappAccount={whatsappAccount}
                collaborators={collaborators}
                onConversationChanged={detail.refresh}
                open={fiche.open}
                onOpenChange={fiche.setOpen}
                copilotTab={
                  copilot.placement === "tab" && !copilot.error ? (
                    <CopilotFicheTab
                      panel={copilot}
                      conversationId={conversation.id}
                      onInsertReply={setDraft}
                    />
                  ) : undefined
                }
              />
            )}
            <ConversationMediaPanel
              conversationId={conversationId}
              open={media.open}
              onOpenChange={media.setOpen}
            />
            {conversation.customerId && (
              <AttendanceHistoryPanel
                customerId={conversation.customerId}
                open={historyOpen}
                onOpenChange={setHistoryOpen}
              />
            )}
            <PartLookupPanel
              open={consultor.open}
              onOpenChange={consultor.setOpen}
              conversation={conversation}
              whatsappAccount={whatsappAccount}
              onInsertText={(text) => setDraft((prev) => appendToDraft(prev, text))}
            />
          </div>
        </ConversationProvider>
      </QuickSendBusProvider>
    </TooltipProvider>
  );
}
