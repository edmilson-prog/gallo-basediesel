import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { ID } from "@/shared/types";
import type { ICopilotPanelState } from "../hooks/useCopilotPanel";
import { COPILOT_STRINGS } from "../i18n/pt-BR";
import { CopilotHeader } from "./CopilotHeader";
import { CopilotSummary } from "./CopilotSummary";
import { CopilotSuggestionItem } from "./CopilotSuggestionItem";
import { CopilotReply } from "./CopilotReply";

export interface ICopilotStripProps {
  panel: ICopilotPanelState;
  conversationId: ID;
  onInsertReply: (text: string) => void;
}

const KIND_ICON = {
  alert: "mdi:alert-outline",
  action: "mdi:receipt-text-outline",
  opportunity: "mdi:lightbulb-on-outline",
} as const;

const KIND_COLOR = {
  alert: "text-warning",
  action: "text-info",
  opportunity: "text-success",
} as const;

export function CopilotStrip({ panel, conversationId, onInsertReply }: ICopilotStripProps) {
  const { briefing, summary, suggestions, loading, dismiss, settings } = panel;
  // Opens by itself only when there is something worth reading — the panel used
  // to always start collapsed, which hid the AI button inside it.
  const [expanded, setExpanded] = useState(
    () => settings.autoExpandOnAlert && suggestions.length > 0,
  );

  // The initial state above only runs once; `suggestions` arrives later (after
  // the fetch resolves), so this effect auto-opens on the first suggestion —
  // but only once, so it never reopens after the user manually closes it.
  const autoExpandedRef = useRef(false);

  // Reset per conversation: the page keeps this instance mounted across
  // conversation switches (keepPreviousData, no remount key), so without this
  // the once-only latch would stay tripped for the rest of the session.
  useEffect(() => {
    autoExpandedRef.current = false;
    setExpanded(false);
  }, [conversationId]);

  useEffect(() => {
    if (autoExpandedRef.current) return;
    if (settings.autoExpandOnAlert && suggestions.length > 0) {
      autoExpandedRef.current = true;
      setExpanded(true);
    }
  }, [settings.autoExpandOnAlert, suggestions.length]);

  const toggle = () => setExpanded((prev) => !prev);

  const top = suggestions[0];
  const rest = Math.max(0, suggestions.length - 1);

  if (loading) {
    return (
      <div className="mx-4 mb-3 animate-pulse rounded-xl border border-primary/30 bg-muted/40 px-3.5 py-3 text-xs text-muted-foreground">
        {COPILOT_STRINGS.loading}
      </div>
    );
  }

  return (
    <section
      aria-label={COPILOT_STRINGS.regionAria}
      className="mx-4 mb-3 rounded-xl border border-primary/40 bg-gradient-to-b from-primary/10 to-transparent"
    >
      {!expanded ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={false}
          aria-label={COPILOT_STRINGS.expand}
          className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
            <Icon icon="mdi:robot-outline" size={15} />
          </span>
          {top ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <Icon
                icon={KIND_ICON[top.kind]}
                size={15}
                className={cn("shrink-0", KIND_COLOR[top.kind])}
              />
              <span className="truncate text-foreground">{top.title}</span>
            </span>
          ) : (
            <span className="flex-1 text-sm text-muted-foreground">{COPILOT_STRINGS.empty}</span>
          )}
          {rest > 0 && (
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {COPILOT_STRINGS.moreCount(rest)}
            </span>
          )}
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
            <Icon icon="mdi:lock-outline" size={12} />
            {COPILOT_STRINGS.privacy}
          </span>
          <Icon icon="mdi:chevron-down" size={16} className="shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div className="px-3.5 py-3">
          <CopilotHeader
            briefing={briefing}
            trailing={
              <button
                type="button"
                onClick={toggle}
                aria-expanded
                aria-label={COPILOT_STRINGS.collapse}
                className="ml-1 shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <Icon icon="mdi:chevron-up" size={16} />
              </button>
            }
          />
          {settings.showSummary && summary && (
            <div className="mt-3">
              <CopilotSummary summary={summary} />
            </div>
          )}
          {settings.showSuggestions ? (
            suggestions.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2.5">
                {suggestions.map((s) => (
                  <CopilotSuggestionItem key={s.id} suggestion={s} onDismiss={dismiss} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{COPILOT_STRINGS.empty}</p>
            )
          ) : null}
          {settings.showReplyButton && (
            <CopilotReply conversationId={conversationId} onInsert={onInsertReply} />
          )}
        </div>
      )}
    </section>
  );
}
