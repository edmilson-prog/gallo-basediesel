import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ConversationStatus, ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useConversationDetail } from "@/features/conversations/hooks/useConversationDetail";
import { useMessages } from "@/features/conversations/hooks/useMessages";
import { useRealtimeMessages } from "@/features/conversations/hooks/useRealtimeMessages";
import { ConversationProvider } from "@/features/conversations/hooks/ConversationContext";
import { useMessageSend } from "@/features/conversations/hooks/useMessageSend";
import { useConversationStatusActions } from "@/features/conversations/hooks/useConversationStatusActions";
import { useAudioRecorder } from "@/features/conversations/hooks/useAudioRecorder";
import { useAttachmentUpload } from "@/features/conversations/hooks/useAttachmentUpload";
import { mustAssignToReply } from "@/features/conversations/engine/assignmentGate";
import { isPhoneLikeName } from "@/shared/utils/avatar";
import { appendToDraft } from "@/features/part-lookup";
import { PwaButton } from "../components/ui/PwaButton";
import { PwaOfflineBar } from "../components/ui/PwaOfflineBar";
import { PwaThreadHeader } from "../components/thread/PwaThreadHeader";
import { PwaMessageList } from "../components/thread/PwaMessageList";
import { PwaComposer } from "../components/thread/PwaComposer";
import { PwaVoiceBar } from "../components/thread/PwaVoiceBar";
import { PwaStatusSheet } from "../components/sheets/PwaStatusSheet";
import { PwaAttachSheet, type PwaAttachChoice } from "../components/sheets/PwaAttachSheet";
import { PwaProductSheet } from "../components/sheets/PwaProductSheet";
import { PwaMoreSheet } from "../components/sheets/PwaMoreSheet";
import { PWA_CHANNEL_META, initialsOf, shortNameOf } from "../components/ui/statusMeta";
import { PWA_STATUS_META } from "../components/ui/statusMeta";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { usePwaFilePicker } from "../hooks/usePwaFilePicker";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

type SheetName = "status" | "attach" | "product" | "more" | null;

export function ConversaPage() {
  const { id } = useParams({ from: "/atendimento/conversa/$id" });
  const conversationId: ID = id;
  const navigate = useNavigate();
  const { online, recheck } = useOnlineStatus();

  const detail = useConversationDetail(conversationId);
  const messages = useMessages(conversationId);
  useRealtimeMessages(conversationId, messages.applyRealtimeRow, messages.syncLatest);

  // Staff see store-wide conversations, so they are exempt from the pool gate —
  // same predicate the desktop uses.
  const isStaff = usePermission("conversation", "view", "store");

  if (detail.isLoading && !detail.conversation) {
    return (
      <div
        aria-busy="true"
        className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground"
      >
        <Icon icon="mdi:loading" size={16} className="animate-spin" />
        {S.thread.loading}
      </div>
    );
  }

  if (detail.notFound || !detail.conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <Icon icon="mdi:message-off-outline" size={30} className="text-muted-foreground" />
        <p className="text-base font-extrabold text-foreground">{S.thread.notFoundTitle}</p>
        <p className="text-[13.5px] text-muted-foreground">{S.thread.notFoundDescription}</p>
        <PwaButton
          variant="gold"
          onClick={() => void navigate({ to: "/atendimento/conversas" })}
          className="mt-2"
        >
          {S.thread.backToList}
        </PwaButton>
      </div>
    );
  }

  return (
    <ConversationProvider value={{ messages }}>
      <PwaThreadBody
        conversationId={conversationId}
        detail={detail}
        messages={messages}
        isStaff={isStaff}
        online={online}
        onRecheck={recheck}
      />
    </ConversationProvider>
  );
}

/**
 * Split from the page so every hook below runs INSIDE `ConversationProvider` —
 * `useMessageSend` reads the thread cache from that context.
 */
function PwaThreadBody({
  conversationId,
  detail,
  messages,
  isStaff,
  online,
  onRecheck,
}: {
  conversationId: ID;
  detail: ReturnType<typeof useConversationDetail>;
  messages: ReturnType<typeof useMessages>;
  isStaff: boolean;
  online: boolean;
  onRecheck: () => void;
}) {
  const navigate = useNavigate();
  const conversation = detail.conversation!;
  const contact = detail.contact;

  const [draft, setDraft] = useState("");
  const [sheet, setSheet] = useState<SheetName>(null);
  const [sending, setSending] = useState(false);

  const { send } = useMessageSend(conversation, detail.whatsappAccount);
  const { setStatus } = useConversationStatusActions(conversation, detail.refresh);
  const { prepareAttachment } = useAttachmentUpload(conversation);
  const recorder = useAudioRecorder({ onError: (message) => toast.error(message) });
  const picker = usePwaFilePicker();

  const name = contact?.name ?? "Contato";
  const phone = contact?.phone ?? "";
  const channel = PWA_CHANNEL_META[conversation.channel];

  const mustAssign = mustAssignToReply(conversation, { isStaff });
  const blockedReason = !detail.whatsappAccount
    ? S.thread.noAccount
    : mustAssign
      ? S.thread.mustAssign
      : null;

  const sendText = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await send({ text });
      setDraft("");
      if (!online) toast.info(S.thread.queuedNotice);
    } finally {
      setSending(false);
    }
  };

  const sendFile = async (file: File, kind: "image" | "document" | "audio") => {
    setSending(true);
    try {
      const payload = await prepareAttachment(file, kind, "");
      if (payload) await send(payload);
    } catch {
      toast.error("Não foi possível enviar o anexo.");
    } finally {
      setSending(false);
    }
  };

  const onAttachChoice = async (choice: PwaAttachChoice) => {
    setSheet(choice === "product" ? "product" : null);
    if (choice === "product") return;
    const file = await picker.pick(choice);
    if (file) await sendFile(file, choice === "document" ? "document" : "image");
  };

  const sendRecording = async () => {
    const file = recorder.getRecordedFile();
    recorder.reset();
    if (file) await sendFile(file, "audio");
  };

  const changeStatus = async (next: ConversationStatus) => {
    setSheet(null);
    await setStatus(next);
    toast.success(
      next === "resolvida" ? S.status.resolved : S.status.changed(PWA_STATUS_META[next].label),
    );
  };

  const recording = recorder.status === "recording";

  return (
    <>
      <PwaThreadHeader
        name={shortNameOf(name)}
        initials={initialsOf(name)}
        avatarUrl={contact?.avatarUrl ?? null}
        isPhoneName={isPhoneLikeName(name)}
        status={conversation.status}
        conversationId={conversationId}
        onOpenStatus={() => setSheet("status")}
        onOpenMore={() => setSheet("more")}
      />
      <PwaOfflineBar
        online={online}
        onRetry={() => {
          onRecheck();
          messages.refresh();
        }}
      />

      <PwaMessageList
        messages={messages.messages}
        isLoading={messages.isLoading}
        hasMore={messages.hasMore}
        isLoadingMore={messages.isLoadingMore}
        onLoadOlder={() => void messages.loadMore()}
        originLabel={[channel.label, phone].filter(Boolean).join(" · ")}
      />

      {recording || recorder.status === "recorded" ? (
        <PwaVoiceBar
          seconds={recorder.elapsedSeconds}
          sending={sending}
          onCancel={() => {
            recorder.cancel();
            toast.info(S.thread.recordingDiscarded);
          }}
          onSend={() => {
            if (recording) recorder.stop();
            void sendRecording();
          }}
        />
      ) : (
        <PwaComposer
          value={draft}
          onChange={setDraft}
          online={online}
          sending={sending}
          onSend={() => void sendText()}
          onAttach={() => setSheet("attach")}
          onRecord={() => void recorder.start()}
          canRecord={recorder.isSupported}
          blockedReason={blockedReason}
        />
      )}

      <PwaStatusSheet
        open={sheet === "status"}
        onOpenChange={(open) => setSheet(open ? "status" : null)}
        status={conversation.status}
        onPick={(next) => void changeStatus(next)}
      />
      <PwaAttachSheet
        open={sheet === "attach"}
        onOpenChange={(open) => setSheet(open ? "attach" : null)}
        onPick={(choice) => void onAttachChoice(choice)}
      />
      <PwaProductSheet
        open={sheet === "product"}
        onOpenChange={(open) => setSheet(open ? "product" : null)}
        onPick={(text) => setDraft((previous) => appendToDraft(previous, text))}
      />
      <PwaMoreSheet
        open={sheet === "more"}
        onOpenChange={(open) => setSheet(open ? "more" : null)}
        phone={phone}
        onResolve={() => void changeStatus("resolvida")}
        onOpenMedia={() => {
          setSheet(null);
          void navigate({ to: "/atendimento/conversa/$id/midias", params: { id: conversationId } });
        }}
      />
    </>
  );
}
