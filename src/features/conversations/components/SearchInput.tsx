import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { INBOX_STRINGS } from "../i18n/pt-BR";

export interface ISearchInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Debounce in ms; defaults to 300. */
  debounceMs?: number;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /**
   * Renders a "Buscar '{termo}' nas mensagens →" CTA below the input whenever
   * there's a non-empty typed term (Opção D) — an explicit, separate action
   * for searching MESSAGE content, never mixed with the contact-only filter
   * this input itself drives.
   */
  onSearchMessages?: (term: string) => void;
  /** Hides the CTA while message-search results are already showing (the banner takes over). */
  messageSearchActive?: boolean;
}

/**
 * Debounced text search bound to a single string state.
 *
 * Renders a controlled `<Input>` whose local value lags behind the parent
 * by `debounceMs` so typing doesn't refetch the list on every keystroke.
 */
export function SearchInput({
  value,
  onChange,
  debounceMs = 300,
  inputRef: forwardedRef,
  onSearchMessages,
  messageSearchActive = false,
}: ISearchInputProps) {
  const [local, setLocal] = useState(value);
  const lastEmitted = useRef(value);
  const localRef = useRef(local);
  localRef.current = local;

  // Keep local in sync when the parent resets the value (e.g. "Clear all").
  useEffect(() => {
    if (value !== lastEmitted.current && value !== localRef.current) {
      setLocal(value);
      lastEmitted.current = value;
    }
  }, [value]);

  useEffect(() => {
    if (local === lastEmitted.current) return;
    const id = window.setTimeout(() => {
      lastEmitted.current = local;
      onChange(local);
    }, debounceMs);
    return () => window.clearTimeout(id);
  }, [local, debounceMs, onChange]);

  return (
    <div className="relative">
      <Icon
        icon="mdi:magnify"
        size={16}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={forwardedRef}
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={INBOX_STRINGS.searchPlaceholder}
        aria-label={INBOX_STRINGS.searchLabel}
        className="h-9 pl-8 pr-8"
      />
      {local.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-1.5 text-muted-foreground"
          onClick={() => setLocal("")}
          aria-label={INBOX_STRINGS.clearSearch}
        >
          <Icon icon="mdi:close" size={14} />
        </Button>
      )}
      {onSearchMessages && !messageSearchActive && local.trim().length > 0 && (
        <button
          type="button"
          className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          onClick={() => onSearchMessages(local.trim())}
        >
          <Icon icon="mdi:text-search" size={13} />
          {INBOX_STRINGS.messageSearch.cta(local.trim())}
        </button>
      )}
    </div>
  );
}
