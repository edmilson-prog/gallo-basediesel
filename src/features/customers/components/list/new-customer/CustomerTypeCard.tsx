import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

export interface ICustomerTypeCardProps {
  active: boolean;
  /** Iconify glyph pinned to the right edge. */
  icon: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}

/**
 * Pessoa jurídica / Pessoa física selector.
 *
 * A pair of cards rather than a plain radio row because the choice changes the
 * whole form — CNPJ brings the Receita lookup with it, CPF doesn't — and the
 * subtitle is where that consequence is said out loud.
 */
export function CustomerTypeCard({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: ICustomerTypeCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex flex-1 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary/70 bg-primary/10"
          : "border-border hover:bg-accent/50 dark:hover:bg-white/5",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-full border-2",
          active ? "border-primary" : "border-muted-foreground/70",
        )}
      >
        {active && <span className="size-[7px] rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block text-[13.5px] font-bold",
            active ? "text-foreground" : "text-foreground/80",
          )}
        >
          {title}
        </span>
        <span className="mt-px block text-[11px] text-muted-foreground">{subtitle}</span>
      </span>
      <Icon
        icon={icon}
        size={16}
        className={cn("ml-auto shrink-0", active ? "text-primary" : "text-muted-foreground/70")}
      />
    </button>
  );
}
