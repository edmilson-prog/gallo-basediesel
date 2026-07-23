import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import type { ID } from "@/shared/types";
import type { ICopilotPanelState } from "../hooks/useCopilotPanel";
import { COPILOT_STRINGS } from "../i18n/pt-BR";
import { CopilotSuggestionItem } from "./CopilotSuggestionItem";
import { CopilotReply } from "./CopilotReply";

export function CopilotCard({
  panel,
  conversationId,
  onInsertReply,
}: {
  panel: ICopilotPanelState;
  conversationId: ID;
  onInsertReply: (text: string) => void;
}) {
  const { suggestions, dismiss, loading, settings } = panel;
  // Opens by itself only when there is something worth reading — the panel used
  // to always start collapsed, which hid the AI button inside it.
  const [open, setOpen] = useState(() => settings.autoExpandOnAlert && suggestions.length > 0);

  // The initial state above only runs once; `suggestions` arrives later (after
  // the fetch resolves), so this effect auto-opens on the first suggestion —
  // but only once, so it never reopens after the user manually closes it.
  const autoExpandedRef = useRef(false);

  // Reset per conversation: the page keeps this instance mounted across
  // conversation switches (keepPreviousData, no remount key), so without this
  // the once-only latch would stay tripped for the rest of the session.
  useEffect(() => {
    autoExpandedRef.current = false;
    setOpen(false);
  }, [conversationId]);

  useEffect(() => {
    if (autoExpandedRef.current) return;
    if (settings.autoExpandOnAlert && suggestions.length > 0) {
      autoExpandedRef.current = true;
      setOpen(true);
    }
  }, [settings.autoExpandOnAlert, suggestions.length]);

  if (loading) return null;

  return (
    <section
      aria-label={COPILOT_STRINGS.regionAria}
      className="mx-[18px] mt-3.5 overflow-hidden rounded-xl border border-primary/40 bg-gradient-to-b from-primary/10 to-transparent"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? COPILOT_STRINGS.collapse : COPILOT_STRINGS.expand}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
          <Icon icon="mdi:robot-outline" size={15} />
        </span>
        <span className="text-sm font-bold text-primary">{COPILOT_STRINGS.title}</span>
        <span className="text-xs text-muted-foreground">
          · {COPILOT_STRINGS.moreCount(suggestions.length)}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          <Icon icon="mdi:lock-outline" size={12} />
          {COPILOT_STRINGS.privacy}
        </span>
        <Icon
          icon={open ? "mdi:chevron-up" : "mdi:chevron-down"}
          size={16}
          className="text-muted-foreground"
        />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5">
          {settings.showSuggestions && suggestions.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {suggestions.map((s) => (
                <CopilotSuggestionItem key={s.id} suggestion={s} onDismiss={dismiss} />
              ))}
            </ul>
          )}
          {settings.showReplyButton && (
            <CopilotReply conversationId={conversationId} onInsert={onInsertReply} />
          )}
        </div>
      )}
    </section>
  );
}
