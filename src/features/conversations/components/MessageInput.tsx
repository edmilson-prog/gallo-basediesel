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
import { useMessageSend } from "../hooks/useMessageSend";
import { useMetaWindow } from "../hooks/useMetaWindow";
import { useConversationContext } from "../hooks/ConversationContext";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { TemplateDialog } from "./dialogs/TemplateDialog";

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

  const handleSend = async () => {
    const text = value.trim();
    if (!text) return;
    if (!canSendFreeText) {
      toast.info(CONVERSATION_STRINGS.windowDisabledHint);
      setTemplateOpen(true);
      return;
    }
    setValue("");
    try {
      await sendHook.send({ text });
      onSent?.();
    } catch {
      toast.error(CONVERSATION_STRINGS.actionFailed);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

      <div className="flex items-end gap-2 px-3 py-2">
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
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => toast.info(CONVERSATION_STRINGS.attachComingSoon)}>
              <Icon icon="mdi:image-outline" size={14} className="mr-2" />
              {CONVERSATION_STRINGS.attachImage}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toast.info(CONVERSATION_STRINGS.attachComingSoon)}>
              <Icon icon="mdi:file-document-outline" size={14} className="mr-2" />
              {CONVERSATION_STRINGS.attachDocument}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toast.info(CONVERSATION_STRINGS.attachComingSoon)}>
              <Icon icon="mdi:microphone-outline" size={14} className="mr-2" />
              {CONVERSATION_STRINGS.attachAudio}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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

        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          rows={1}
          disabled={!canSendFreeText}
          className={cn(
            "min-h-[40px] flex-1 resize-none py-2",
            !canSendFreeText && "cursor-not-allowed bg-muted/40",
          )}
          aria-label="Mensagem"
        />

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

        {/* Enviar */}
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1.5 px-3"
          onClick={handleSend}
          disabled={!value.trim() || !canSendFreeText}
        >
          <Icon icon="mdi:send" size={14} />
          <span className="hidden lg:inline">{CONVERSATION_STRINGS.send}</span>
        </Button>
      </div>

      <TemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        onConfirm={handleTemplateConfirm}
      />
    </footer>
  );
}
