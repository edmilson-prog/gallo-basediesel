import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

export interface ICustomerEmptyStateProps {
  icon: string;
  title: string;
  text?: string;
  /** Label of the recovery action. Without `onCta` no button is rendered. */
  cta?: string;
  onCta?: () => void;
  className?: string;
}

/**
 * Empty state of the detail page's panels.
 *
 * Deliberately not `TabEmptyState`: that one is also mounted by the frozen
 * Atendimento fiche and by the list preview, and it is a single muted line. The
 * kit's empty state says what is missing AND offers the way out, which is what
 * turns "nothing here" into a next step.
 */
export function CustomerEmptyState({
  icon,
  title,
  text,
  cta,
  onCta,
  className,
}: ICustomerEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2.5 px-5 py-11 text-center",
        className,
      )}
    >
      <span
        aria-hidden
        className="grid h-[38px] w-[38px] place-items-center rounded-lg border border-border bg-muted/50 text-muted-foreground"
      >
        <Icon icon={icon} size={18} />
      </span>
      <h3 className="font-display text-base font-bold uppercase tracking-[0.03em] text-foreground">
        {title}
      </h3>
      {text && (
        <p className="max-w-[400px] text-[13px] leading-relaxed text-muted-foreground">{text}</p>
      )}
      {cta && onCta && (
        <Button variant="secondary" size="sm" className="mt-1" onClick={onCta}>
          {cta}
        </Button>
      )}
    </div>
  );
}
