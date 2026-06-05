import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TypingIndicator } from "@/features/conversations/components/TypingIndicator";
import { useCurrentRole } from "@/features/rbac";
import type { IAnalyticsMessage } from "@/shared/types/analytics-copilot";
import { suggestionsForRole } from "../i18n/suggestions";
import { AnalyticsAnswerCard } from "./AnalyticsAnswerCard";
import { CopilotComposer, type ICopilotComposerHandle } from "./CopilotComposer";
import { CopilotEmptyState } from "./CopilotEmptyState";

interface ICopilotConversationProps {
  messages: IAnalyticsMessage[];
  isThinking: boolean;
  onAsk: (question: string) => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Shared conversation core used by all three view modes: scrollable log
 *  (aria-live) + empty-state hero + sticky composer. */
export function CopilotConversation({ messages, isThinking, onAsk }: ICopilotConversationProps) {
  const role = useCurrentRole();
  const composerRef = useRef<ICopilotComposerHandle>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;
  const chips = suggestionsForRole(role).slice(0, 3);
  const lastUserQuestion = [...messages].reverse().find((m) => m.role === "user")?.text;

  // Auto-scroll to the latest message (instant under reduced-motion).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, isThinking]);

  // Focus the composer on mount.
  useEffect(() => {
    const id = window.setTimeout(() => composerRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, []);

  const submit = (question: string) => {
    onAsk(question);
    // Keep focus on the composer after sending.
    composerRef.current?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div role="log" aria-live="polite" className="mx-auto w-full max-w-3xl px-4 py-6">
          {!hasMessages ? (
            <CopilotEmptyState onPick={submit} />
          ) : (
            <ul className="flex flex-col gap-3">
              {messages.map((message) =>
                message.role === "user" ? (
                  <li key={message.id} className="flex justify-end">
                    <span className="sr-only">Você:</span>
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                      {message.text}
                    </div>
                  </li>
                ) : (
                  <li key={message.id} className="flex justify-start">
                    <span className="sr-only">Copiloto:</span>
                    <div className="max-w-[90%] rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5">
                      {message.text && (
                        <p className="mb-1 text-sm text-muted-foreground">{message.text}</p>
                      )}
                      {message.answer && (
                        <AnalyticsAnswerCard
                          answer={message.answer}
                          onSuggestion={submit}
                          onAskAgain={lastUserQuestion ? () => submit(lastUserQuestion) : undefined}
                        />
                      )}
                    </div>
                  </li>
                ),
              )}
              {isThinking && (
                <li className="flex justify-start">
                  <span className="sr-only">Copiloto está digitando</span>
                  <TypingIndicator />
                </li>
              )}
            </ul>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <CopilotComposer
        ref={composerRef}
        onSubmit={submit}
        disabled={isThinking}
        chips={hasMessages ? chips : []}
        onChip={submit}
      />
    </div>
  );
}
