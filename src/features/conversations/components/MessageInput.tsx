import { useEffect, useMemo, useRef, useState } from "react";
import type { IConversation, IWhatsAppAccount } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/Icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/features/auth/useAuth";
import { SEND_ERROR_MESSAGES, useMessageSend, type ISendOptions } from "../hooks/useMessageSend";
import {
  ATTACHMENT_ACCEPT,
  useAttachmentUpload,
  type AttachmentKind,
} from "../hooks/useAttachmentUpload";
import { useMetaWindow } from "../hooks/useMetaWindow";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useConversationContext } from "../hooks/ConversationContext";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { VoiceRecorderBar } from "./VoiceRecorderBar";
import { MIN_RECORDING_SECONDS } from "../utils/audioRecording";
import { formatFileSize, mediaIcon } from "../utils/messageDisplay";
import { TemplateDialog } from "./dialogs/TemplateDialog";
import { TemplatePicker, type ITemplatePickerSelection } from "@/features/templates";
import { NotesButton } from "./notes/NotesButton";
import { InlineNoteComposer } from "./notes/InlineNoteComposer";
import { OriginChip } from "./OriginChip";
import { AssignToReplyBanner } from "./AssignToReplyBanner";
import { InstanceLockedBanner } from "./InstanceLockedBanner";
import { deriveInstanceLock } from "../engine/instanceLock";
import { inferAttachmentKind } from "../engine/attachmentKind";
import { useSelfAssign } from "../hooks/useSelfAssign";
import { useLiveInstanceStatus } from "../hooks/useLiveInstanceStatus";
import { getActiveDataSource } from "@/providers/data";
import {
  AssetPicker,
  ComposerStagedAsset,
  ProductSearchDialog,
  ScheduleButton,
  SchedulingCenter,
  SlashMenu,
  SnippetField,
  useSendAsset,
  useSendProductCard,
  useQuickSendBus,
  useQuickReplies,
  type SchedulingTab,
} from "@/features/quick-send";
import {
  ComposerStagedPix,
  PIX_STRINGS,
  PIX_TYPE_ICON,
  PIX_TYPE_LABEL,
  toDisplayPixKey,
  usePixKeys,
  useSendPix,
  type IPixSendOptions,
} from "@/features/pix";
import { parseSlash } from "@/features/quick-send/engine/slashParser";
import { filterAssets } from "@/features/quick-send/engine/assetFiltering";
import {
  isKnownSlashAssetCommand,
  matchPixKeysByCommand,
  matchQuickRepliesByCommand,
  resolveSlashCommandCategory,
} from "@/features/quick-send/engine/slashCommand";
import {
  resolvePlaceholders,
  hasUnresolved,
} from "@/features/quick-send/engine/placeholderResolver";
import { useAssetLibrary } from "@/features/quick-send/hooks/useAssetLibrary";
import type { IAssetLibraryItem, IPart, IPixKey } from "@/shared/types";
import {
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { QUICK_SEND_STRINGS } from "@/features/quick-send/i18n/pt-BR";
import { PART_LOOKUP_STRINGS } from "@/features/part-lookup";

export interface IMessageInputProps {
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  onSent?: () => void;
  /** Read-only mode (vendor doesn't own the conversation, archived etc). */
  readOnly?: boolean;
  readOnlyMessage?: string;
  /** Controlled draft text (lifted from parent for copilot strip integration). */
  draft?: string;
  /** Called when the draft changes — enables controlled mode. */
  onDraftChange?: (text: string) => void;
  /** When true, hides the "Sugestões IA" bar (copilot strip handles it instead). */
  hideAiSuggestions?: boolean;
  /**
   * Monotonic counter — each increment opens the template dialog/picker.
   * Lets the SessionBanner CTA (PRD-117) trigger the picker without lifting
   * the whole dialog state out of this component.
   */
  openTemplateSignal?: number;
  /** Pool gate (assign-before-reply): block sending until the user self-assigns. */
  mustAssignToReply?: boolean;
  /** Called after a successful self-assign so the parent can refresh the conversation. */
  onAssigned?: () => void;
  /** Opens the part-lookup consultor panel (lifted to the page). */
  onOpenPartLookup?: () => void;
  /**
   * Resolved contact display name (B2B nomeFantasia / B2C fullName / lead
   * name — same value shown in the header). Fills the `{{nome}}` snippet
   * placeholder (RF-011) when a quick reply is inserted.
   */
  contactName?: string | null;
}

const EMOJI_SET = [
  "😀",
  "😅",
  "😉",
  "😊",
  "😎",
  "🤝",
  "👍",
  "🙌",
  "🚚",
  "🔧",
  "💰",
  "📦",
  "✅",
  "❤️",
  "🙏",
  "👀",
];

interface IAiSuggestion {
  id: string;
  text: string;
}

function buildAiSuggestions(conversation: IConversation, lastInboundText: string): IAiSuggestion[] {
  const t = lastInboundText.toLowerCase();
  const list: IAiSuggestion[] = [];
  if (t.includes("preço") || t.includes("valor") || t.includes("quanto")) {
    list.push({ id: "ai-1", text: "Vou te passar o valor à vista e parcelado, um instante." });
  }
  if (t.includes("estoque") || t.includes("tem")) {
    list.push({ id: "ai-2", text: "Sim, temos em estoque pronta entrega." });
  }
  if (t.includes("prazo") || t.includes("entrega")) {
    list.push({ id: "ai-3", text: "O prazo de entrega para sua região é de 24 a 48h." });
  }
  if (t.includes("boleto") || t.includes("nota") || t.includes("nf")) {
    list.push({ id: "ai-4", text: "Te envio o boleto e a NF ainda hoje." });
  }
  if (list.length === 0) {
    list.push(
      { id: "ai-default-1", text: "Bom dia! Como posso te ajudar?" },
      { id: "ai-default-2", text: "Pode me passar a placa do veículo?" },
    );
  }
  if (conversation.isSdrActive) {
    list.push({
      id: "ai-takeover",
      text: "Bom dia! Eu sou o vendedor responsável daqui em diante.",
    });
  }
  return list.slice(0, 3);
}

/** Shared footer chrome for the composer-replacement gates (assign/instance-down). */
function GatedComposerFooter({
  conversation,
  notesOpen,
  onCloseNotes,
  children,
}: {
  conversation: IConversation;
  notesOpen: boolean;
  onCloseNotes: () => void;
  children: React.ReactNode;
}) {
  return (
    <footer data-tour="composer" className="border-t border-border bg-card">
      {notesOpen && (
        <InlineNoteComposer
          conversationId={conversation.id}
          storeId={conversation.storeId}
          assignedSellerId={conversation.assignedSellerId}
          whatsappAccountId={conversation.whatsappAccountId ?? null}
          onClose={onCloseNotes}
        />
      )}
      {children}
    </footer>
  );
}

export function MessageInput(props: IMessageInputProps) {
  const {
    conversation,
    whatsappAccount,
    onSent,
    readOnly = false,
    readOnlyMessage,
    draft,
    onDraftChange,
    hideAiSuggestions = false,
    openTemplateSignal = 0,
    mustAssignToReply = false,
    onAssigned,
    onOpenPartLookup,
    contactName,
  } = props;
  const { messages } = useConversationContext();
  const window = useMetaWindow(conversation, whatsappAccount);
  const sendHook = useMessageSend(conversation, whatsappAccount);
  const selfAssign = useSelfAssign(conversation, { onDone: onAssigned });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [internalValue, setInternalValue] = useState("");
  const value = draft ?? internalValue;
  const setValue = onDraftChange ?? setInternalValue;
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [schedulingTab, setSchedulingTab] = useState<SchedulingTab>("new");
  // PRD-118 RF-051: payload held while the staff confirmation dialog is open.
  const [invalidPending, setInvalidPending] = useState<ISendOptions | null>(null);
  const { hasRole } = useAuth();

  const bus = useQuickSendBus();
  const { prepareAttachment } = useAttachmentUpload(conversation);
  // Voice-note recording (in-browser capture → reuses the attachment pipeline).
  const recorder = useAudioRecorder({ onError: (m) => toast.error(m) });
  const [sendingVoice, setSendingVoice] = useState(false);
  // Ad-hoc attachment upload in flight — drives the composer chip + locks.
  const [uploadingAttachment, setUploadingAttachment] = useState<{
    name: string;
    size: number;
    kind: AttachmentKind;
  } | null>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  // Kind picked in the dropdown — a ref because the file dialog opens
  // synchronously after the menu select (no re-render in between).
  const attachKindRef = useRef<AttachmentKind>("image");
  // Drag-over overlay (drop target = the whole composer footer). Counter in a
  // ref, not state — dragenter/dragleave bubble per child element (toolbar
  // buttons, textarea), so only flip the visible state when it crosses zero.
  const [dragActive, setDragActive] = useState(false);
  const dragCounterRef = useRef(0);
  const { sendAsset } = useSendAsset(conversation, whatsappAccount);
  const { sendProductCard } = useSendProductCard(conversation, whatsappAccount);
  const quickReplies = useQuickReplies();
  const pixKeys = usePixKeys();
  const { sendPix, isSending: pixSending } = useSendPix(conversation, whatsappAccount);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [stagedAsset, setStagedAsset] = useState<IAssetLibraryItem | null>(null);
  // --- PIX shortcut (staged, never one-click: money in the wrong account is
  // this feature's worst possible failure, so the key is always confirmed).
  // Only WHICH key is staged lives here; ComposerStagedPix owns the context
  // text and the two toggles so they survive a failed send. ---
  const [stagedPixKey, setStagedPixKey] = useState<IPixKey | null>(null);
  const [stagedContext, setStagedContext] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  // Caret position tracked in STATE (not read from the ref during render) so the
  // slash parser reacts to cursor moves (arrow keys/click), not only to value
  // changes — D-5 non-regression. Updated by the textarea's select/keyup/click.
  const [caret, setCaret] = useState(0);

  const supportsTemplates = whatsappAccount?.capabilities.supportsTemplatesHsm ?? false;
  const isMeta = whatsappAccount?.provider === "meta";
  const canSendFreeText = readOnly ? false : window.canSendFreeText;
  // Mirrors CLOSED_STATUSES in supabase/functions/_shared/whatsapp/send/core.ts —
  // "arquivada" is the only status the backend still rejects (422); "resolvida"
  // is allowed and auto-reopens to "em_andamento" (nextStatusOnOutboundHuman).
  const conversationClosed = conversation.status === "arquivada";
  const liveWhatsappAccount = useLiveInstanceStatus(whatsappAccount);
  const instanceLock = deriveInstanceLock(liveWhatsappAccount);
  const canManageInstance = hasRole(["Owner"]);
  const placeholder = !canSendFreeText
    ? CONVERSATION_STRINGS.inputPlaceholderClosed
    : CONVERSATION_STRINGS.inputPlaceholder;

  const lastInboundText = useMemo(() => {
    for (let i = messages.messages.length - 1; i >= 0; i -= 1) {
      const m = messages.messages[i];
      if (m && m.direction === "in") return m.text;
    }
    return "";
  }, [messages.messages]);

  const suggestions = useMemo(
    () => buildAiSuggestions(conversation, lastInboundText),
    [conversation, lastInboundText],
  );

  // --- Slash (read-only observer over value + caret) ---
  // `caret` comes from state (updated by select/keyup/click handlers below), so
  // parseSlash refreshes when the cursor moves into/out of a "/token" even if the
  // value didn't change (e.g. arrow keys). Clamp to the current value length.
  const safeCaret = Math.min(caret, value.length);
  const slash = parseSlash(value, safeCaret);
  // RF-007: the command word (e.g. "catalogo") pre-filters by category; text
  // after a space filters by title within that category. An empty command
  // (bare "/") browses everything; an unrecognized command (e.g. "/xyz")
  // shows no assets instead of falling back to an unfiltered list.
  const slashCategory = resolveSlashCommandCategory(slash.command);
  const slashLib = useAssetLibrary(
    slash.active ? { category: slashCategory, query: slash.query } : { query: "" },
  );
  const slashAssets =
    slash.active && isKnownSlashAssetCommand(slash.command)
      ? filterAssets(slashLib.items, { category: slashCategory, query: slash.query }).slice(0, 5)
      : [];
  // RF-011: quick replies are matched by shortcut (e.g. "/garantia"), not by title.
  const slashReplies = slash.active
    ? matchQuickRepliesByCommand(quickReplies.replies, slash.command).slice(0, 5)
    : [];
  // `/pix` surfaces the store's active keys; a key without its own shortcut is
  // still reachable, since the attendant picks in the staged bar.
  const slashPixKeys = slash.active
    ? matchPixKeysByCommand(pixKeys.activeKeys, slash.command).slice(0, 5)
    : [];
  const slashTotal = slashAssets.length + slashReplies.length + slashPixKeys.length;
  const slashOpen = slash.active && slashTotal > 0;
  // Non-null only when the store has exactly one active key — that is the case
  // where the attach menu skips the picker and stages it directly.
  const soleKey = pixKeys.activeKeys.length === 1 ? pixKeys.activeKeys[0] : null;

  // --- Snippet gaps (double send-lock) ---
  // RF-011: {{nome}} resolves from the conversation's contact; {{peca}}/{{prazo}}
  // have no data source yet (no "part in discussion" tracker, no default lead
  // time setting), so they stay as manual gaps until those exist.
  const placeholderCtx = useMemo(
    () => ({ nome: contactName ?? undefined, peca: undefined, prazo: undefined }),
    [contactName],
  );
  const snippetGaps = resolvePlaceholders(value, placeholderCtx).gaps;
  const hasUnresolvedPlaceholders = hasUnresolved(value);

  // Why is Send/Schedule disabled? Surface a concise reason for AT (a11y) — gate
  // priority mirrors handleSend: pending fields → closed window → empty draft.
  const sendDisabled =
    !value.trim() || !canSendFreeText || hasUnresolvedPlaceholders || uploadingAttachment !== null;
  const sendDisabledReason = uploadingAttachment
    ? CONVERSATION_STRINGS.sendDisabledUploading
    : hasUnresolvedPlaceholders
      ? CONVERSATION_STRINGS.sendDisabledPendingFields
      : !canSendFreeText
        ? CONVERSATION_STRINGS.sendDisabledWindowClosed
        : !value.trim()
          ? CONVERSATION_STRINGS.sendDisabledEmpty
          : undefined;

  // Reset slash highlight when the candidate list changes.
  useEffect(() => {
    setSlashIndex(0);
  }, [slash.command, slash.query, slashTotal]);

  // External "open template picker" requests (SessionBanner CTA — PRD-117).
  useEffect(() => {
    if (openTemplateSignal > 0) setTemplateOpen(true);
  }, [openTemplateSignal]);

  // Auto-resize the textarea to fit content, capped at ~5 lines. Resetting to
  // "0px" before reading scrollHeight forces a synchronous layout (Chrome's
  // "Forced reflow" violation) — only worth paying when the text may have
  // shrunk (scrollHeight otherwise still reports the box's current height,
  // not the smaller content). While the text only grows (the common case,
  // one violation per keystroke otherwise), scrollHeight already reflects
  // the larger content without resetting first.
  const prevValueLengthRef = useRef(0);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (value.length < prevValueLengthRef.current) el.style.height = "0px";
    prevValueLengthRef.current = value.length;
    const next = Math.min(el.scrollHeight, 5 * 24 + 16);
    el.style.height = `${Math.max(40, next)}px`;
  }, [value]);

  if (readOnly || conversationClosed) {
    return (
      <footer className="border-t border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
        {readOnlyMessage ??
          (conversationClosed
            ? SEND_ERROR_MESSAGES.CONVERSATION_CLOSED
            : CONVERSATION_STRINGS.readOnlyAssign)}
      </footer>
    );
  }

  // Pool gate (assign-before-reply): non-staff on an unassigned conversation.
  // Reading stays intact upstream; here we block every send path but keep the
  // internal-note composer reachable. Checked BEFORE the instance-down gate:
  // self-assigning still has value even while the instance is down (it claims
  // the conversation so it isn't left in the pool, ready to reply once the
  // instance recovers) — hiding that CTA behind the instance-down banner would
  // strand pool conversations whenever both conditions coincide.
  if (mustAssignToReply) {
    return (
      <GatedComposerFooter
        conversation={conversation}
        notesOpen={notesOpen}
        onCloseNotes={() => setNotesOpen(false)}
      >
        <AssignToReplyBanner
          canAssign={selfAssign.canSelfAssign}
          assigning={selfAssign.assigning}
          onAssign={() => void selfAssign.selfAssign()}
          onToggleNote={() => setNotesOpen((v) => !v)}
        />
      </GatedComposerFooter>
    );
  }

  // Instance-down gate: the channel itself can't send/receive right now
  // (disconnected/pending), regardless of assignment.
  if (instanceLock.locked) {
    return (
      <GatedComposerFooter
        conversation={conversation}
        notesOpen={notesOpen}
        onCloseNotes={() => setNotesOpen(false)}
      >
        <InstanceLockedBanner
          reason={instanceLock.reason ?? "disconnected"}
          accountLabel={whatsappAccount?.label}
          canManage={canManageInstance}
          onToggleNote={() => setNotesOpen((v) => !v)}
        />
      </GatedComposerFooter>
    );
  }

  // Keep the caret state in sync with the textarea selection on every cursor move.
  const syncCaret = () => {
    const pos = textareaRef.current?.selectionStart;
    if (typeof pos === "number") setCaret(pos);
  };

  const stageAsset = (item: IAssetLibraryItem) => {
    setStagedAsset(item);
    setStagedContext("");
  };

  /**
   * Stages a PIX key for confirmation. Every entry point lands here — there is
   * deliberately no path that dispatches on a single click, because sending
   * money to the wrong account is this feature's worst possible failure.
   * The bar owns the context text and the two toggles (it seeds them from the
   * key's own defaults), so the composer only tracks WHICH key is staged.
   */
  const stagePixKey = (key: IPixKey) => {
    setStagedAsset(null); // one staged bar at a time
    setStagedPixKey(key);
  };

  const handleSendPix = async (opts: IPixSendOptions) => {
    if (!stagedPixKey) return;
    if (!canSendFreeText) {
      toast.info(CONVERSATION_STRINGS.windowDisabledHint);
      setTemplateOpen(true);
      return;
    }
    // `false` means nothing reached the thread: leave the bar mounted so its
    // internal context survives and the attendant retries without retyping.
    const delivered = await sendPix(stagedPixKey, opts);
    if (!delivered) return;
    setStagedPixKey(null);
    onSent?.();
  };

  const handleStagedSend = async () => {
    if (!stagedAsset) return;
    const item = stagedAsset;
    setStagedAsset(null);
    setStagedContext("");
    if (!canSendFreeText) {
      toast.info(CONVERSATION_STRINGS.windowDisabledHint);
      setTemplateOpen(true);
      return;
    }
    await sendAsset(item, stagedContext);
    onSent?.();
  };

  // Ad-hoc file attachment (PRD-119 RF-026): picker → upload (PRD-026) → real
  // dispatch (PRD-115). The 24h-window gate applies as for any free-form send.
  const openAttachPicker = (kind: AttachmentKind) => {
    if (!canSendFreeText) {
      toast.info(CONVERSATION_STRINGS.windowDisabledHint);
      setTemplateOpen(true);
      return;
    }
    attachKindRef.current = kind;
    const el = attachInputRef.current;
    if (!el) return;
    el.accept = ATTACHMENT_ACCEPT[kind];
    el.click();
  };

  // Shared by the manual picker, drag-and-drop and paste — upload (PRD-026) →
  // real dispatch (PRD-115), identical error handling regardless of entry point.
  const runAttachmentPipeline = async (file: File, kind: AttachmentKind) => {
    const caption = value.trim();
    setUploadingAttachment({ name: file.name, size: file.size, kind });
    try {
      let payload: ISendOptions | null = null;
      try {
        payload = await prepareAttachment(file, kind, caption);
      } catch {
        toast.error(CONVERSATION_STRINGS.attachUploadFailed);
        return;
      }
      if (!payload) return;
      try {
        await sendHook.send(payload);
        setValue("");
        onSent?.();
      } catch (err) {
        if (err instanceof Error && err.message === "TEMPLATE_REQUIRED") {
          setTemplateOpen(true);
          return;
        }
        if (handleInvalidNumberBounce(err, payload)) return;
        if (getActiveDataSource() !== "supabase") {
          toast.error(CONVERSATION_STRINGS.actionFailed);
        }
      }
    } finally {
      setUploadingAttachment(null);
    }
  };

  const handleAttachSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file twice re-triggers the change event.
    e.target.value = "";
    if (!file) return;
    await runAttachmentPipeline(file, attachKindRef.current);
  };

  // Common entry point for drag-and-drop and paste (PRD-119 follow-up): unlike
  // the picker, the kind isn't chosen up front — it's inferred from the file.
  const attachExternalFile = (file: File) => {
    if (!canSendFreeText) {
      toast.info(CONVERSATION_STRINGS.windowDisabledHint);
      setTemplateOpen(true);
      return;
    }
    // Composer already busy with another attachment/asset/voice note — ignore.
    if (uploadingAttachment !== null || stagedAsset !== null || recorder.status !== "idle") return;
    const kind = inferAttachmentKind(file);
    if (!kind) {
      toast.error(CONVERSATION_STRINGS.attachUnsupportedType);
      return;
    }
    void runAttachmentPipeline(file, kind);
  };

  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const handleDragEnter = (e: React.DragEvent<HTMLElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    if (uploadingAttachment !== null || stagedAsset !== null || recorder.status !== "idle") return;
    dragCounterRef.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    if (!isFileDrag(e)) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    const file = files[0];
    if (!file) return;
    if (files.length > 1) toast.info(CONVERSATION_STRINGS.attachMultipleIgnored);
    attachExternalFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const fileItem = Array.from(e.clipboardData.items).find((i) => i.kind === "file");
    if (!fileItem) return; // no file on the clipboard — let normal text paste through
    const file = fileItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    attachExternalFile(file);
  };

  // Send the recorded voice note through the same attachment pipeline used by
  // ad-hoc files: upload (PRD-026) → real dispatch (PRD-115). Evolution routes
  // audio to its dedicated voice-note endpoint; the recorded bubble plays via
  // the existing AudioBubble. The 24h-window gate already blocked recording.
  const handleSendVoice = async () => {
    if (recorder.elapsedSeconds < MIN_RECORDING_SECONDS) {
      toast.info(CONVERSATION_STRINGS.voice.tooShort);
      return;
    }
    const file = recorder.getRecordedFile();
    if (!file) return;
    const caption = value.trim();
    setSendingVoice(true);
    let payload: ISendOptions | null = null;
    try {
      payload = await prepareAttachment(file, "audio", caption);
    } catch {
      toast.error(CONVERSATION_STRINGS.attachUploadFailed);
      setSendingVoice(false);
      return;
    }
    if (!payload) {
      // Rejected by the size cap (already toasted) — keep the preview.
      setSendingVoice(false);
      return;
    }
    try {
      await sendHook.send(payload);
      recorder.reset();
      setValue("");
      onSent?.();
    } catch (err) {
      if (err instanceof Error && err.message === "TEMPLATE_REQUIRED") {
        // Window closed mid-recording — free-form audio can't be sent; drop it.
        recorder.reset();
        setTemplateOpen(true);
        return;
      }
      if (handleInvalidNumberBounce(err, payload)) {
        // Payload (with the uploaded audio) is held for the staff confirmation.
        recorder.reset();
        return;
      }
      if (getActiveDataSource() !== "supabase") {
        toast.error(CONVERSATION_STRINGS.actionFailed);
      }
      // Otherwise keep the preview so the user can retry the send.
    } finally {
      setSendingVoice(false);
    }
  };

  const handleProductSelected = async (part: IPart) => {
    if (!canSendFreeText) {
      toast.info(CONVERSATION_STRINGS.windowDisabledHint);
      setTemplateOpen(true);
      return;
    }
    await sendProductCard(part);
    onSent?.();
  };

  const insertSnippetBody = (body: string) => {
    // RF-011/RF-012: resolve {{...}} from the known context first — {{nome}}
    // fills in when known, anything still unresolved becomes a "[gap]" pill
    // instead of the raw "{{gap}}" token.
    const { resolved } = resolvePlaceholders(body, placeholderCtx);
    // Replace only the active "/shortcut..." token (from the slash to the
    // caret) with the resolved snippet body — preserves any text typed before it.
    const start = slash.tokenStart >= 0 ? slash.tokenStart : 0;
    const end = safeCaret;
    const next = value.slice(0, start) + resolved + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = start + resolved.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const pickSlashAsset = (item: IAssetLibraryItem) => {
    // Picking an asset via slash clears the slash token and stages the asset.
    setValue("");
    stageAsset(item);
  };

  const pickSlashPixKey = (key: IPixKey) => {
    // Same contract as pickSlashAsset: drop the slash token, then stage.
    setValue("");
    stagePixKey(key);
  };

  const handleSend = async () => {
    const text = value.trim();
    if (!text) return;
    if (hasUnresolved(value)) {
      toast.warning(QUICK_SEND_STRINGS.snippet.sendBlockedHint);
      return;
    }
    if (!canSendFreeText) {
      toast.info(CONVERSATION_STRINGS.windowDisabledHint);
      setTemplateOpen(true);
      return;
    }
    setValue("");
    try {
      await sendHook.send({ text });
      onSent?.();
    } catch (err) {
      // Supabase source already toasts per error code inside the hook; the
      // 24h-window bounce opens the HSM picker instead (PRD-116).
      if (err instanceof Error && err.message === "TEMPLATE_REQUIRED") {
        setTemplateOpen(true);
        return;
      }
      if (handleInvalidNumberBounce(err, { text })) return;
      if (getActiveDataSource() !== "supabase") {
        toast.error(CONVERSATION_STRINGS.actionFailed);
      }
    }
  };

  // PRD-118 RF-051: invalid-flagged number — staff confirms (override audited
  // server-side); sellers get the explanatory toast. Returns true when handled.
  const handleInvalidNumberBounce = (err: unknown, payload: ISendOptions): boolean => {
    if (!(err instanceof Error) || err.message !== "CUSTOMER_INVALID_WHATSAPP") return false;
    if (hasRole(["Owner", "Gestor"])) {
      setInvalidPending(payload);
    } else {
      toast.error(SEND_ERROR_MESSAGES.CUSTOMER_INVALID_WHATSAPP);
    }
    return true;
  };

  const handleInvalidConfirm = async () => {
    const payload = invalidPending;
    setInvalidPending(null);
    if (!payload) return;
    try {
      await sendHook.send({ ...payload, overrideInvalid: true });
      onSent?.();
    } catch {
      // Hook already toasted the friendly message.
    }
  };

  const handleRealTemplateSelect = async (selection: ITemplatePickerSelection) => {
    const payload: ISendOptions = {
      text: selection.renderedText,
      template: true,
      templateMeta: {
        templateName: selection.templateName,
        languageCode: selection.languageCode,
        variables: selection.variables,
      },
    };
    try {
      await sendHook.send(payload);
      onSent?.();
    } catch (err) {
      if (handleInvalidNumberBounce(err, payload)) return;
      // Hook already toasted the friendly message.
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      setPickerOpen(true);
      return;
    }
    // Slash menu navigation — intercept ONLY while the menu is open (D-5).
    if (slashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, slashTotal - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        // Soft-close: append a space so parseSlash no longer matches the token.
        setValue(value + " ");
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        // The menu renders assets, then replies, then PIX keys, and activeIndex
        // runs continuously across all three. Resolve by section, guarding each
        // lookup — the index can outrun a list that shrank between renders.
        const asset = slashAssets[slashIndex];
        if (asset) {
          pickSlashAsset(asset);
          return;
        }
        const reply = slashReplies[slashIndex - slashAssets.length];
        if (reply) {
          insertSnippetBody(reply.body);
          return;
        }
        const pixKey = slashPixKeys[slashIndex - slashAssets.length - slashReplies.length];
        if (pixKey) pickSlashPixKey(pixKey);
        return;
      }
    }
    // Default behaviour — UNCHANGED when no menu is open (Enter sends / Shift+Enter newline).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setValue(value + emoji);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleTemplateConfirm = async (rendered: string) => {
    try {
      await sendHook.send({ text: rendered, template: true });
      onSent?.();
    } catch {
      toast.error(CONVERSATION_STRINGS.actionFailed);
    }
  };

  return (
    <footer
      data-tour="composer"
      className="relative border-t border-border bg-card"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
          <Icon icon="mdi:tray-arrow-down" size={18} />
          {CONVERSATION_STRINGS.attachDropHint}
        </div>
      )}
      {!hideAiSuggestions && suggestions.length > 0 && canSendFreeText && (
        <div
          className="flex items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-2 text-[11px]"
          aria-label={CONVERSATION_STRINGS.aiSuggestionsLabel}
        >
          <span className="shrink-0 font-medium text-muted-foreground">
            💡 {CONVERSATION_STRINGS.aiSuggestionsLabel}:
          </span>
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setValue(s.text)}
              className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-foreground hover:bg-muted"
            >
              {s.text}
            </button>
          ))}
        </div>
      )}

      {stagedPixKey && (
        <ComposerStagedPix
          pixKey={stagedPixKey}
          keyCount={pixKeys.activeKeys.length}
          isSending={pixSending}
          onSend={(opts) => void handleSendPix(opts)}
          onSwapKey={() => setStagedPixKey(null)}
          onCancel={() => setStagedPixKey(null)}
        />
      )}
      {stagedAsset && (
        <ComposerStagedAsset
          item={stagedAsset}
          contextMessage={stagedContext}
          onContextChange={setStagedContext}
          onSend={handleStagedSend}
          onCancel={() => {
            setStagedAsset(null);
            setStagedContext("");
          }}
        />
      )}

      {notesOpen && (
        <InlineNoteComposer
          conversationId={conversation.id}
          storeId={conversation.storeId}
          assignedSellerId={conversation.assignedSellerId}
          whatsappAccountId={conversation.whatsappAccountId ?? null}
          onClose={() => setNotesOpen(false)}
        />
      )}

      {whatsappAccount && (
        <div className="flex items-center gap-1.5 px-3 pt-2 text-[11px] text-muted-foreground">
          <span>Origem:</span>
          <OriginChip account={whatsappAccount} variant="full" />
        </div>
      )}
      {uploadingAttachment && (
        <div
          className="flex items-center gap-2.5 border-b border-border px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon icon={mediaIcon(uploadingAttachment.kind, uploadingAttachment.name)} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {uploadingAttachment.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {CONVERSATION_STRINGS.attachUploading} · {formatFileSize(uploadingAttachment.size)}
            </p>
          </div>
          <Icon icon="mdi:loading" size={16} className="shrink-0 animate-spin text-primary" />
        </div>
      )}
      <div className="flex items-end gap-2 px-3 py-2">
        {recorder.status !== "idle" ? (
          <VoiceRecorderBar
            status={recorder.status}
            elapsedSeconds={recorder.elapsedSeconds}
            recordedUrl={recorder.recordedUrl}
            sending={sendingVoice}
            onStop={recorder.stop}
            onCancel={recorder.cancel}
            onSend={() => void handleSendVoice()}
          />
        ) : (
          <>
            {/* Anexo */}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 shrink-0 p-0"
                      aria-label={CONVERSATION_STRINGS.attach}
                      disabled={uploadingAttachment !== null}
                    >
                      <Icon icon="mdi:paperclip" size={18} />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{CONVERSATION_STRINGS.attach}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">
                  {CONVERSATION_STRINGS.attachSectionLibrary}
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => setPickerOpen(true)}>
                  <Icon icon="mdi:bookshelf" size={14} className="mr-2" />
                  {CONVERSATION_STRINGS.openLibrary}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {CONVERSATION_STRINGS.openLibraryShortcut}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    // Resposta rápida: open the library focused on the all tab; snippets
                    // are also reachable via the "/" slash. (Reuses the same picker.)
                    setPickerOpen(true);
                  }}
                >
                  <Icon icon="mdi:lightning-bolt-outline" size={14} className="mr-2" />
                  {CONVERSATION_STRINGS.quickReply}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setProductSearchOpen(true)}>
                  <Icon icon="mdi:cog-outline" size={14} className="mr-2" />
                  {CONVERSATION_STRINGS.sendProduct}
                </DropdownMenuItem>
                {onOpenPartLookup && (
                  <DropdownMenuItem onSelect={() => onOpenPartLookup()}>
                    <Icon icon="mdi:magnify-scan" size={14} className="mr-2" />
                    {PART_LOOKUP_STRINGS.panelTitle}
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">
                  {PIX_STRINGS.composer.menuSection}
                </DropdownMenuLabel>
                {pixKeys.activeKeys.length === 0 ? (
                  <DropdownMenuItem disabled title={PIX_STRINGS.composer.noKeys}>
                    <Icon icon="mdi:qrcode" size={14} className="mr-2" aria-hidden="true" />
                    {PIX_STRINGS.composer.menuItem}
                  </DropdownMenuItem>
                ) : soleKey ? (
                  // One key: skip the choice entirely rather than make the
                  // attendant pick from a list of one.
                  <DropdownMenuItem onSelect={() => stagePixKey(soleKey)}>
                    <Icon icon="mdi:qrcode" size={14} className="mr-2" aria-hidden="true" />
                    {PIX_STRINGS.composer.menuItem}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {PIX_STRINGS.composer.menuHint}
                    </span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Icon icon="mdi:qrcode" size={14} className="mr-2" aria-hidden="true" />
                      {PIX_STRINGS.composer.menuItem}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-64">
                      {pixKeys.activeKeys.map((k) => (
                        <DropdownMenuItem
                          key={k.id}
                          onSelect={() => stagePixKey(k)}
                          // The alias alone does not let someone decide blind —
                          // and "blind" includes the attendant working fast.
                          aria-label={`${PIX_STRINGS.composer.menuItem} ${k.alias}, ${
                            PIX_TYPE_LABEL[k.keyType]
                          }, ${toDisplayPixKey(k.keyType, k.keyValue)}`}
                        >
                          <Icon
                            icon={PIX_TYPE_ICON[k.keyType]}
                            size={14}
                            className="mr-2"
                            aria-hidden="true"
                          />
                          <span className="truncate">{k.alias}</span>
                          {k.isDefault && (
                            <Icon
                              icon="mdi:star"
                              size={11}
                              className="ml-auto shrink-0 text-primary"
                              aria-hidden="true"
                            />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">
                  {CONVERSATION_STRINGS.attachSectionFile}
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => openAttachPicker("image")}>
                  <Icon icon="mdi:image-outline" size={14} className="mr-2" />
                  {CONVERSATION_STRINGS.attachImage}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openAttachPicker("video")}>
                  <Icon icon="mdi:video-outline" size={14} className="mr-2" />
                  {CONVERSATION_STRINGS.attachVideo}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openAttachPicker("document")}>
                  <Icon icon="mdi:file-document-outline" size={14} className="mr-2" />
                  {CONVERSATION_STRINGS.attachDocument}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openAttachPicker("audio")}>
                  <Icon icon="mdi:file-music-outline" size={14} className="mr-2" />
                  {CONVERSATION_STRINGS.attachAudio}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={attachInputRef}
              type="file"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => void handleAttachSelected(e)}
            />

            {/* Emoji */}
            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 shrink-0 p-0"
                      aria-label={CONVERSATION_STRINGS.emoji}
                    >
                      <Icon icon="mdi:emoticon-outline" size={18} />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>{CONVERSATION_STRINGS.emoji}</TooltipContent>
              </Tooltip>
              <PopoverContent align="start" className="w-56 p-2">
                <div className="grid grid-cols-8 gap-1 text-lg">
                  {EMOJI_SET.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="rounded hover:bg-muted"
                      onClick={() => {
                        insertEmoji(e);
                        setEmojiOpen(false);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Gravar nota de voz */}
            {recorder.isSupported && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 shrink-0 p-0"
                    onClick={() => void recorder.start()}
                    disabled={!canSendFreeText || uploadingAttachment !== null}
                    aria-label={CONVERSATION_STRINGS.voice.record}
                  >
                    <Icon icon="mdi:microphone" size={18} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{CONVERSATION_STRINGS.voice.record}</TooltipContent>
              </Tooltip>
            )}

            {/* Agendar mensagem (abre a Central) */}
            <ScheduleButton
              conversationId={conversation.id}
              onOpen={(tab) => {
                setSchedulingTab(tab);
                setSchedulingOpen(true);
              }}
              disabled={readOnly}
            />

            {/* Anotações internas da conversa (desdobra acima do campo) */}
            <NotesButton
              conversationId={conversation.id}
              storeId={conversation.storeId}
              active={notesOpen}
              onToggle={() => setNotesOpen((v) => !v)}
              disabled={readOnly}
            />

            {/* Textarea + overlays */}
            <div className="relative flex-1">
              {slashOpen && (
                <SlashMenu
                  state={slash}
                  items={slashAssets}
                  replies={slashReplies}
                  pixKeys={slashPixKeys}
                  activeIndex={slashIndex}
                  onPickAsset={pickSlashAsset}
                  onPickReply={(r) => insertSnippetBody(r.body)}
                  onPickPixKey={pickSlashPixKey}
                  onClose={() => setValue(value + " ")}
                />
              )}
              <SnippetField
                value={value}
                gaps={snippetGaps}
                onChange={setValue}
                textareaRef={textareaRef as React.RefObject<HTMLTextAreaElement>}
              />
              <Textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setCaret(e.target.selectionStart ?? e.target.value.length);
                }}
                onKeyDown={handleKey}
                onKeyUp={syncCaret}
                onSelect={syncCaret}
                onClick={syncCaret}
                onPaste={handlePaste}
                placeholder={placeholder}
                rows={1}
                disabled={!canSendFreeText || uploadingAttachment !== null}
                role="combobox"
                aria-expanded={slashOpen}
                aria-controls={slashOpen ? "slash-listbox" : undefined}
                aria-autocomplete="list"
                aria-activedescendant={slashOpen ? `slash-opt-${slashIndex}` : undefined}
                className={cn(
                  // Mirror ui/textarea defaults (px-3 py-2, text-base md:text-sm) so the
                  // SnippetField overlay aligns pixel-for-pixel with the real text (D-6).
                  "relative min-h-[40px] w-full resize-none bg-transparent px-3 py-2 text-base leading-normal md:text-sm",
                  snippetGaps.length > 0 && "caret-foreground",
                  (!canSendFreeText || uploadingAttachment !== null) &&
                    "cursor-not-allowed bg-muted/40",
                )}
                aria-label="Mensagem"
              />
            </div>

            {/* Templates */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant={!canSendFreeText ? "default" : "outline"}
                    size="sm"
                    className="h-9 gap-1.5 px-3"
                    onClick={() => setTemplateOpen(true)}
                    disabled={!isMeta || !supportsTemplates}
                  >
                    <Icon icon="mdi:certificate-outline" size={14} />
                    <span className="hidden lg:inline">{CONVERSATION_STRINGS.templatesButton}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {!isMeta || !supportsTemplates
                  ? CONVERSATION_STRINGS.templatesUnavailable
                  : CONVERSATION_STRINGS.templatesButton}
              </TooltipContent>
            </Tooltip>

            {/* Enviar (único) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 gap-1.5 px-3"
                    onClick={handleSend}
                    disabled={sendDisabled}
                    aria-disabled={sendDisabled}
                  >
                    <Icon icon="mdi:send" size={14} />
                    <span className="hidden lg:inline">{CONVERSATION_STRINGS.send}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{sendDisabledReason ?? CONVERSATION_STRINGS.send}</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {getActiveDataSource() === "supabase" ? (
        // PRD-116: real HSM catalog picker — sends kind='template' through
        // the whatsapp-send pipeline with name/language/variables.
        <TemplatePicker
          open={templateOpen}
          onOpenChange={setTemplateOpen}
          onSelect={(selection) => void handleRealTemplateSelect(selection)}
        />
      ) : (
        <TemplateDialog
          open={templateOpen}
          onOpenChange={setTemplateOpen}
          onConfirm={handleTemplateConfirm}
        />
      )}
      <AssetPicker
        conversation={conversation}
        whatsappAccount={whatsappAccount}
        open={pickerOpen || bus.pickerRequest !== null}
        onOpenChange={(o) => {
          setPickerOpen(o);
          if (!o) bus.clearRequest();
        }}
        initialFilter={bus.pickerRequest ?? undefined}
        onStage={stageAsset}
      />
      <ProductSearchDialog
        open={productSearchOpen}
        onOpenChange={setProductSearchOpen}
        onSelect={handleProductSelected}
      />
      <AlertDialog
        open={invalidPending !== null}
        onOpenChange={(o) => !o && setInvalidPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{CONVERSATION_STRINGS.invalidNumberDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {CONVERSATION_STRINGS.invalidNumberDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{CONVERSATION_STRINGS.invalidNumberDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleInvalidConfirm()}>
              {CONVERSATION_STRINGS.invalidNumberDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SchedulingCenter
        conversation={conversation}
        whatsappAccount={whatsappAccount}
        open={schedulingOpen}
        onOpenChange={setSchedulingOpen}
        initialTab={schedulingTab}
        onUseTemplate={() => {
          setSchedulingOpen(false);
          setTemplateOpen(true);
        }}
      />
    </footer>
  );
}
