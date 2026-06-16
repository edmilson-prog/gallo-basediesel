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
import { TemplateDialog } from "./dialogs/TemplateDialog";
import { TemplatePicker, type ITemplatePickerSelection } from "@/features/templates";
import { NotesButton } from "./notes/NotesButton";
import { InlineNoteComposer } from "./notes/InlineNoteComposer";
import { OriginChip } from "./OriginChip";
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
import { parseSlash } from "@/features/quick-send/engine/slashParser";
import { filterAssets } from "@/features/quick-send/engine/assetFiltering";
import {
  resolvePlaceholders,
  hasUnresolved,
} from "@/features/quick-send/engine/placeholderResolver";
import { useAssetLibrary } from "@/features/quick-send/hooks/useAssetLibrary";
import type { IAssetLibraryItem, IPart } from "@/shared/types";
import { DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { QUICK_SEND_STRINGS } from "@/features/quick-send/i18n/pt-BR";

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
  } = props;
  const { messages } = useConversationContext();
  const window = useMetaWindow(conversation, whatsappAccount);
  const sendHook = useMessageSend(conversation, whatsappAccount);
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
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  // Kind picked in the dropdown — a ref because the file dialog opens
  // synchronously after the menu select (no re-render in between).
  const attachKindRef = useRef<AttachmentKind>("image");
  const { sendAsset } = useSendAsset(conversation, whatsappAccount);
  const { sendProductCard } = useSendProductCard(conversation, whatsappAccount);
  const quickReplies = useQuickReplies();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [stagedAsset, setStagedAsset] = useState<IAssetLibraryItem | null>(null);
  const [stagedContext, setStagedContext] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  // Caret position tracked in STATE (not read from the ref during render) so the
  // slash parser reacts to cursor moves (arrow keys/click), not only to value
  // changes — D-5 non-regression. Updated by the textarea's select/keyup/click.
  const [caret, setCaret] = useState(0);

  const supportsTemplates = whatsappAccount?.capabilities.supportsTemplatesHsm ?? false;
  const isMeta = whatsappAccount?.provider === "meta";
  const canSendFreeText = readOnly ? false : window.canSendFreeText;
  const archived = conversation.status === "arquivada";
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
  const slashLib = useAssetLibrary(slash.active ? { query: slash.query } : { query: "" });
  const slashAssets = slash.active
    ? filterAssets(slashLib.items, { query: slash.query }).slice(0, 5)
    : [];
  const slashReplies =
    slash.active && quickReplies.replies.length > 0
      ? quickReplies.replies
          .filter((r) =>
            `${r.shortcut} ${r.title}`.toLowerCase().includes(slash.query.toLowerCase()),
          )
          .slice(0, 5)
      : [];
  const slashTotal = slashAssets.length + slashReplies.length;
  const slashOpen = slash.active && slashTotal > 0;

  // --- Snippet gaps (double send-lock) ---
  const placeholderCtx = useMemo(
    () => ({ nome: undefined, peca: undefined, prazo: undefined }),
    [],
  );
  const snippetGaps = resolvePlaceholders(value, placeholderCtx).gaps;
  const hasUnresolvedPlaceholders = hasUnresolved(value);

  // Why is Send/Schedule disabled? Surface a concise reason for AT (a11y) — gate
  // priority mirrors handleSend: pending fields → closed window → empty draft.
  const sendDisabled = !value.trim() || !canSendFreeText || hasUnresolvedPlaceholders;
  const sendDisabledReason = hasUnresolvedPlaceholders
    ? CONVERSATION_STRINGS.sendDisabledPendingFields
    : !canSendFreeText
      ? CONVERSATION_STRINGS.sendDisabledWindowClosed
      : !value.trim()
        ? CONVERSATION_STRINGS.sendDisabledEmpty
        : undefined;

  // Reset slash highlight when the candidate list changes.
  useEffect(() => {
    setSlashIndex(0);
  }, [slash.query, slashTotal]);

  // External "open template picker" requests (SessionBanner CTA — PRD-117).
  useEffect(() => {
    if (openTemplateSignal > 0) setTemplateOpen(true);
  }, [openTemplateSignal]);

  // Auto-resize the textarea to fit content, capped at ~5 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, 5 * 24 + 16);
    el.style.height = `${Math.max(40, next)}px`;
  }, [value]);

  if (readOnly || archived) {
    return (
      <footer className="border-t border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
        {readOnlyMessage ?? CONVERSATION_STRINGS.readOnlyAssign}
      </footer>
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

  const handleAttachSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file twice re-triggers the change event.
    e.target.value = "";
    if (!file) return;
    const caption = value.trim();
    let payload: ISendOptions | null = null;
    try {
      payload = await prepareAttachment(file, attachKindRef.current, caption);
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
    // Replace the active "/shortcut..." token with the snippet body.
    setValue(body);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const pickSlashAsset = (item: IAssetLibraryItem) => {
    // Picking an asset via slash clears the slash token and stages the asset.
    setValue("");
    stageAsset(item);
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
        if (slashIndex < slashAssets.length) {
          pickSlashAsset(slashAssets[slashIndex]);
        } else {
          insertSnippetBody(slashReplies[slashIndex - slashAssets.length].body);
        }
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
    <footer className="border-t border-border bg-card">
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
          onClose={() => setNotesOpen(false)}
        />
      )}

      {whatsappAccount && (
        <div className="flex items-center gap-1.5 px-3 pt-2 text-[11px] text-muted-foreground">
          <span>Origem:</span>
          <OriginChip account={whatsappAccount} variant="full" />
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

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">
                  {CONVERSATION_STRINGS.attachSectionFile}
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => openAttachPicker("image")}>
                  <Icon icon="mdi:image-outline" size={14} className="mr-2" />
                  {CONVERSATION_STRINGS.attachImage}
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
                    disabled={!canSendFreeText}
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
                  activeIndex={slashIndex}
                  onPickAsset={pickSlashAsset}
                  onPickReply={(r) => insertSnippetBody(r.body)}
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
                placeholder={placeholder}
                rows={1}
                disabled={!canSendFreeText}
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
                  !canSendFreeText && "cursor-not-allowed bg-muted/40",
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
