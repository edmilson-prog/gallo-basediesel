import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

export function TypingIndicator() {
  return (
    <div className="flex w-full items-end" aria-live="polite">
      <div className="rounded-2xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
        <span className="sr-only">{CONVERSATION_STRINGS.typing}</span>
        <span className="inline-flex items-center gap-1">
          <span className="dot-1 inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70" />
          <span className="dot-2 inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:150ms]" />
          <span className="dot-3 inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  );
}
