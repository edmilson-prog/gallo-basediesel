import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ICopilotComposerHandle {
  focus: () => void;
}

interface ICopilotComposerProps {
  onSubmit: (question: string) => void;
  disabled?: boolean;
  /** Quick-suggestion chips shown above the field (only when there are messages). */
  chips?: string[];
  onChip?: (question: string) => void;
}

/** Sticky chat composer with an auto-resizing textarea (1→4 lines). Enter submits,
 *  Shift+Enter inserts a newline. Glass background mirrors the TopBar. */
export const CopilotComposer = forwardRef<ICopilotComposerHandle, ICopilotComposerProps>(
  function CopilotComposer({ onSubmit, disabled = false, chips = [], onChip }, ref) {
    const [draft, setDraft] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    // Auto-resize up to ~4 lines.
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, [draft]);

    const submit = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || disabled) return;
      onSubmit(trimmed);
      setDraft("");
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit(draft);
      }
    };

    return (
      <div className="sticky bottom-0 border-t border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {chips.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => onChip?.(chip)}
                  className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(draft);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Pergunte sobre faturamento, margem, clientes…"
              aria-label="Pergunte ao copiloto"
              autoComplete="off"
              className={cn(
                "flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm shadow-sm",
                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            />
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11 shrink-0"
              aria-label="Enviar pergunta"
              disabled={disabled || draft.trim().length === 0}
            >
              <Icon icon="mdi:send" size={18} />
            </Button>
          </form>
          <p className="mt-1.5 hidden text-xs text-muted-foreground sm:block">
            Respostas vêm sempre com a fonte oficial · Enter envia · ⌘K
          </p>
        </div>
      </div>
    );
  },
);
