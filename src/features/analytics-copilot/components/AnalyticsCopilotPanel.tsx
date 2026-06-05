import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TypingIndicator } from "@/features/conversations/components/TypingIndicator";
import { useCurrentRole } from "@/features/rbac";
import { cn } from "@/lib/utils";

import { suggestionsForRole } from "../i18n/suggestions";
import { useAnalyticsCopilot } from "../hooks/useAnalyticsCopilot";
import { AnalyticsAnswerCard } from "./AnalyticsAnswerCard";

interface IAnalyticsCopilotPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Clickable suggestion chips for the empty state / above-the-composer hints. */
function SuggestionChips({
  questions,
  onPick,
  size = "sm",
}: {
  questions: string[];
  onPick: (question: string) => void;
  size?: "sm" | "lg";
}) {
  if (questions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {questions.map((question) => (
        <button
          key={question}
          type="button"
          onClick={() => onPick(question)}
          className={cn(
            "rounded-full border border-border bg-muted/40 text-left hover:bg-muted",
            size === "lg" ? "px-3.5 py-2 text-sm" : "px-3 py-1 text-xs",
          )}
        >
          {question}
        </button>
      ))}
    </div>
  );
}

/**
 * Analytics copilot chat surface (PRD-057, spec §8 Feature B). A right-side Sheet
 * with header + scrollable history + composer. Answers are rendered via
 * AnalyticsAnswerCard; the typing indicator shows while a question is resolving.
 *
 * RNF-001: numbers always come from the orchestration hook (adapter + pure BI
 * engines), never from this surface.
 */
export function AnalyticsCopilotPanel({ open, onOpenChange }: IAnalyticsCopilotPanelProps) {
  const role = useCurrentRole();
  const { messages, isThinking, ask } = useAnalyticsCopilot();
  const [draft, setDraft] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const suggestions = suggestionsForRole(role);
  const hasMessages = messages.length > 0;

  // Auto-scroll to the latest message / typing indicator.
  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [open, messages, isThinking]);

  // Focus the composer when the panel opens.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [open]);

  const submit = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isThinking) return;
    void ask(trimmed);
    setDraft("");
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    submit(draft);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md lg:max-w-lg">
        {/* Header */}
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <div className="flex items-center gap-2">
            <SheetTitle>Copiloto analítico</SheetTitle>
            <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Beta · baseado em regras
            </span>
          </div>
          <SheetDescription>Pergunte sobre seus dados</SheetDescription>
        </SheetHeader>

        {/* History */}
        <ScrollArea className="flex-1">
          <div role="log" aria-live="polite" className="px-5 py-4">
            {!hasMessages ? (
              <div className="flex flex-col gap-4 py-6">
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Icon icon="mdi:robot-happy-outline" size={20} className="mt-0.5 shrink-0" />
                  <p>
                    Olá! Pergunte sobre faturamento, margem, positivação, clientes em risco e mais.
                    Toque em uma sugestão para começar.
                  </p>
                </div>
                <SuggestionChips questions={suggestions} onPick={submit} size="lg" />
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <li key={message.id} className="flex justify-end">
                      <span className="sr-only">Você:</span>
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                        {message.text}
                      </div>
                    </li>
                  ) : (
                    <li key={message.id} className="flex justify-start">
                      <span className="sr-only">Copiloto:</span>
                      <div className="max-w-[90%] rounded-2xl rounded-tl-sm border border-border bg-card px-3 py-2">
                        {message.text && (
                          <p className="mb-1 text-sm text-muted-foreground">{message.text}</p>
                        )}
                        {message.answer && (
                          <AnalyticsAnswerCard answer={message.answer} onSuggestion={submit} />
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

        {/* Composer */}
        <form
          onSubmit={handleSubmit}
          className="sticky bottom-0 border-t border-border bg-background px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          {hasMessages && (
            <div className="mb-2">
              <SuggestionChips questions={suggestions.slice(0, 3)} onPick={submit} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Pergunte ao copiloto…"
              aria-label="Pergunte ao copiloto"
              autoComplete="off"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Enviar pergunta"
              disabled={isThinking || draft.trim().length === 0}
            >
              <Icon icon="mdi:send" size={18} />
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
