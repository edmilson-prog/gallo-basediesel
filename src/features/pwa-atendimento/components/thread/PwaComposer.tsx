import { useRef, type KeyboardEvent } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

interface IPwaComposerProps {
  value: string;
  onChange: (next: string) => void;
  online: boolean;
  sending: boolean;
  onSend: () => void;
  onAttach: () => void;
  onRecord: () => void;
  /** Hides the mic when the browser cannot record. */
  canRecord: boolean;
  /** Read-only reason shown instead of the input (no account, pool gate). */
  blockedReason?: string | null;
}

export function PwaComposer({
  value,
  onChange,
  online,
  sending,
  onSend,
  onAttach,
  onRecord,
  canRecord,
  blockedReason,
}: IPwaComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasText = value.trim().length > 0;

  if (blockedReason) {
    return (
      <div className="border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p className="text-center text-[12.5px] font-medium text-muted-foreground">
          {blockedReason}
        </p>
      </div>
    );
  }

  const submit = () => {
    if (!hasText || sending) return;
    onSend();
    // Collapse the textarea back to one line after sending.
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends only with a hardware keyboard; on a phone the virtual keyboard
    // sends a plain Enter as a newline, which is what people expect there.
    if (event.key === "Enter" && !event.shiftKey && event.ctrlKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t border-border bg-card px-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5">
      <button
        type="button"
        onClick={onAttach}
        aria-label={S.thread.attach}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-foreground/[0.06] text-muted-foreground ring-1 ring-inset ring-border"
      >
        <Icon icon="mdi:paperclip" size={19} />
      </button>

      <div className="flex min-h-[44px] min-w-0 flex-1 items-center rounded bg-foreground/[0.05] px-3 ring-1 ring-inset ring-border">
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            const el = event.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          }}
          onKeyDown={onKeyDown}
          placeholder={online ? S.thread.composerPlaceholder : S.thread.composerOffline}
          className="max-h-[120px] w-full resize-none border-0 bg-transparent py-3 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
        />
      </div>

      <button
        type="button"
        onClick={hasText ? submit : onRecord}
        disabled={sending || (!hasText && !canRecord)}
        aria-label={hasText ? S.thread.send : S.thread.record}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded disabled:opacity-40",
          hasText
            ? "bg-primary text-primary-foreground"
            : "bg-foreground/[0.06] text-muted-foreground ring-1 ring-inset ring-border",
        )}
      >
        <Icon
          icon={sending ? "mdi:loading" : hasText ? "mdi:send" : "mdi:microphone"}
          size={19}
          className={sending ? "animate-spin" : undefined}
        />
      </button>
    </div>
  );
}
