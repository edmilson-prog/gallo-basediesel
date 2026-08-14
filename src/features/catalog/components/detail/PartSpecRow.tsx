import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

/**
 * Label/value row from the catalog design kit (`CatSpecRow`): a tracked uppercase
 * label of fixed width, the value, and an optional copy button or trailing slot.
 */
export interface IPartSpecRowProps {
  label: string;
  value: React.ReactNode;
  /** Render the value in the mono face (codes, barcodes, references). */
  mono?: boolean;
  /** Shows a copy button on the right. */
  onCopy?: () => void;
  copyTitle?: string;
  /** Trailing slot, rendered before the copy button. */
  action?: React.ReactNode;
  className?: string;
}

export function PartSpecRow({
  label,
  value,
  mono = false,
  onCopy,
  copyTitle = "Copiar",
  action,
  className,
}: IPartSpecRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-border py-2.5 last:border-b-0",
        className,
      )}
    >
      <span className="min-w-[104px] shrink-0 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground",
          mono && "font-mono tracking-wide",
        )}
      >
        {value}
      </span>
      {action}
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          title={copyTitle}
          aria-label={`${copyTitle} ${label}`}
          className="grid shrink-0 cursor-pointer place-items-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Icon icon="mdi:content-copy" size={14} />
        </button>
      )}
    </div>
  );
}
