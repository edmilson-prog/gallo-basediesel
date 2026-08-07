import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { PIX_STRINGS } from "../i18n/pt-BR";

export interface ICopyKeyButtonProps {
  /** CANONICAL key — never the formatted display value. */
  value: string;
  label?: string;
  compact?: boolean;
}

/**
 * Inline feedback, not a toast: the attendant copies dozens of times per shift
 * and a toast per copy would pile up over the conversation. The toast is
 * reserved for FAILURE, which is when they must be interrupted.
 *
 * Diverges from ContactBubble on purpose — there it is an occasional action,
 * here it is repetitive. The `?.` guard is kept (clipboard is undefined in a
 * non-secure context); the silent `.catch(() => undefined)` is NOT: on a PIX
 * key, clicking and nothing happening makes the attendant believe they copied
 * and paste the previous key.
 */
export function CopyKeyButton({ value, label, compact = false }: ICopyKeyButtonProps) {
  const s = PIX_STRINGS.copy;
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = () => {
    // trim(): an invisible \n from the form breaks the bank field with no error.
    const write = navigator.clipboard?.writeText(value.trim());
    if (!write) {
      toast.error(s.unavailable);
      return;
    }
    void write
      .then(() => {
        setCopied(true);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        // 1600ms: below ~1200 the eye misses it, above ~2500 the button lies.
        timerRef.current = window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => toast.error(s.error));
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copy}
        aria-label={`${s.action} ${label ?? ""}`.trim()}
        className={cn(
          "cursor-pointer text-foreground hover:bg-primary/10 hover:text-foreground",
          compact ? "h-9 w-9 p-0" : "h-9 gap-1.5 px-2 text-[11.5px] font-medium",
        )}
      >
        {/* Fixed width: swapping the icon must not shift the label. */}
        <span className="inline-flex w-4 shrink-0 justify-center">
          <Icon
            icon={copied ? "mdi:check" : "mdi:content-copy"}
            size={14}
            className={cn(
              // transition-colors, never transition-all: `all` animates width.
              "transition-colors duration-150 motion-reduce:transition-none",
              copied ? "text-severity-success" : "text-primary",
            )}
            aria-hidden="true"
          />
        </span>
        {!compact && (copied ? s.done : s.action)}
      </Button>
      {/* Colour and icon are not feedback for someone who cannot see them. */}
      <span aria-live="polite" className="sr-only">
        {copied ? s.announced : ""}
      </span>
    </>
  );
}
