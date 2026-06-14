import { useMemo, useRef, useState } from "react";
import type { ID, ISeller } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/Icon";
import {
  applyMention,
  extractMentionedIds,
  parseMentionQuery,
  type IMentionCandidate,
} from "../../engine/mentions";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { sellerDisplay } from "../../engine/conversationNotes";
import { MentionMenu } from "./MentionMenu";

const S = CONVERSATION_STRINGS.conversationNotes;
const MAX_CANDIDATES = 6;

export interface INoteComposerProps {
  sellers: ISeller[];
  /** Prefilled body — edit mode. */
  initialValue?: string;
  submitLabel: string;
  onSubmit: (content: string, mentions: ID[]) => Promise<unknown> | void;
  /** Present → edit mode (shows Cancel, keeps the text on submit). */
  onCancel?: () => void;
  autoFocus?: boolean;
  busy?: boolean;
}

/**
 * Textarea with an `@mention` autocomplete, used to create a new note or edit
 * an existing one. Mentions are resolved from the final text against the seller
 * list at submit time (the source of truth), so the persisted ids stay honest.
 */
export function NoteComposer({
  sellers,
  initialValue = "",
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
  busy = false,
}: INoteComposerProps) {
  const isEdit = Boolean(onCancel);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(initialValue);
  const [caret, setCaret] = useState(initialValue.length);
  const [activeIndex, setActiveIndex] = useState(0);

  const candidates: IMentionCandidate[] = useMemo(
    () => sellers.map((s) => ({ id: s.id, display: sellerDisplay(s) })),
    [sellers],
  );

  const safeCaret = Math.min(caret, value.length);
  const mention = parseMentionQuery(value, safeCaret);
  const matches = useMemo(() => {
    if (!mention.active) return [];
    const q = mention.query.toLowerCase();
    return sellers
      .filter((s) => sellerDisplay(s).toLowerCase().includes(q))
      .slice(0, MAX_CANDIDATES);
  }, [mention.active, mention.query, sellers]);
  const menuOpen = mention.active && matches.length > 0;

  const syncCaret = () => {
    const pos = textareaRef.current?.selectionStart;
    if (typeof pos === "number") setCaret(pos);
  };

  const pickMention = (seller: ISeller) => {
    const result = applyMention(value, mention, sellerDisplay(seller));
    setValue(result.value);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(result.caret, result.caret);
        setCaret(result.caret);
      }
    });
  };

  const submit = async () => {
    const content = value.trim();
    if (!content || busy) return;
    const mentions = extractMentionedIds(content, candidates);
    try {
      await onSubmit(content, mentions);
      if (!isEdit) {
        setValue("");
        setCaret(0);
      }
    } catch {
      // The data hook already surfaced a toast; keep the draft so it isn't lost.
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setValue((v) => `${v} `); // append a space so the token no longer matches
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const picked = matches[activeIndex];
        if (picked) pickMention(picked);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="relative">
      {menuOpen && (
        <MentionMenu candidates={matches} activeIndex={activeIndex} onPick={pickMention} />
      )}
      <Textarea
        ref={textareaRef}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          setValue(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={handleKey}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onSelect={syncCaret}
        placeholder={S.composerPlaceholder}
        className="min-h-[64px] resize-none text-sm"
        aria-label={S.composerPlaceholder}
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {isEdit && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {S.cancel}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={() => void submit()}
          disabled={busy || value.trim().length === 0}
        >
          <Icon
            icon={busy ? "mdi:loading" : "mdi:send"}
            size={15}
            className={busy ? "animate-spin" : ""}
          />
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
