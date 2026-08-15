import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

/**
 * Card primitive from the catalog design kit (`CatCard`): a titled surface whose
 * header is separated from the body by a rule, with a slot on the right for a
 * count chip or secondary metric.
 */
export interface IPartPanelProps {
  title?: string;
  /** Iconify name shown before the title. */
  icon?: string;
  /** Right-aligned header slot (chip, metric, action). */
  right?: React.ReactNode;
  children: React.ReactNode;
  /** Drop the body padding when the child brings its own (tables, sections). */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
}

export function PartPanel({
  title,
  icon,
  right,
  children,
  flush = false,
  className,
  bodyClassName,
}: IPartPanelProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      {title && (
        <div className="flex items-center gap-2 border-b border-border px-[18px] py-[13px]">
          {icon && <Icon icon={icon} size={15} className="shrink-0 text-muted-foreground" />}
          <h2 className="text-[13.5px] font-bold tracking-[0.02em] text-foreground">{title}</h2>
          {right && <div className="ml-auto flex items-center">{right}</div>}
        </div>
      )}
      <div className={cn(!flush && "p-[18px]", bodyClassName)}>{children}</div>
    </div>
  );
}
