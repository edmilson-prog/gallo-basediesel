import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.detail.facts;

export interface ICustomerFactProps {
  /** Iconify glyph shown next to the label. */
  icon: string;
  label: string;
  /** `null`/`undefined`/empty renders the `empty` text in a muted italic. */
  value?: string | null;
  /** What to show when there is no value. Defaults to "Não informado". */
  empty?: string;
  /** Turns the value into a link (`tel:`, `mailto:`, …). Ignored when empty. */
  href?: string;
  /** Adds a copy button that appears on hover/focus. Ignored when empty. */
  copyable?: boolean;
  /** Tabular rendering for numbers, documents and phones. */
  mono?: boolean;
  className?: string;
}

/**
 * Label + value pair used across the header's facts band.
 *
 * An absent value is SAID, not hidden: the whole point of the band is that the
 * seller can tell "no address on file" apart from "address exists, look
 * elsewhere". That is why there is no early return for empty values.
 */
export function CustomerFact({
  icon,
  label,
  value,
  empty = COPY.notInformed,
  href,
  copyable,
  mono,
  className,
}: ICustomerFactProps) {
  const [copied, setCopied] = useState(false);
  const hasValue = value != null && value !== "";

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    if (!hasValue) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure context / denied permission) — the value is
      // on screen and selectable, so failing silently beats a scary toast.
    }
  };

  const valueClasses = cn(
    "block truncate",
    mono ? "text-sm font-semibold tabular-nums" : "text-[13px] font-medium",
    hasValue ? "text-foreground" : "italic text-muted-foreground/70",
  );

  return (
    <div className={cn("group/fact min-w-0", className)}>
      <div className="flex items-center gap-1">
        <Icon icon={icon} size={11} className="shrink-0 text-muted-foreground/70" />
        <span className="truncate text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
          {label}
        </span>
        {hasValue && copyable && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? COPY.copied : COPY.copy(label)}
            title={copied ? COPY.copied : COPY.copy(label)}
            className={cn(
              "shrink-0 rounded p-0.5 opacity-0 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring group-hover/fact:opacity-100 focus-visible:opacity-100",
              copied ? "text-severity-success opacity-100" : "text-muted-foreground",
            )}
          >
            <Icon icon={copied ? "mdi:check" : "mdi:content-copy"} size={11} />
          </button>
        )}
      </div>
      {href && hasValue ? (
        <a
          href={href}
          className={cn(
            valueClasses,
            "rounded hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring",
          )}
          title={value}
        >
          {value}
        </a>
      ) : (
        <span className={valueClasses} title={hasValue ? value : empty}>
          {hasValue ? value : empty}
        </span>
      )}
    </div>
  );
}
