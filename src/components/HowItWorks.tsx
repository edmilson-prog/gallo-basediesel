import { useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface IHowItWorksProps {
  /** Explanatory content revealed when expanded. */
  children: ReactNode;
  /** Trigger label. Defaults to "Como funciona?". */
  label?: string;
  /** Extra classes for the outer wrapper (e.g. spacing overrides). */
  className?: string;
}

/**
 * Inline "Como funciona?" disclosure: a discreet trigger placed under a page
 * title that expands a full-width explanatory panel. Collapsed by default.
 *
 * Shared chassis used by feature-specific explainers (forecast, positivation, …)
 * — each one only supplies its own copy via `children`.
 */
export function HowItWorks({ children, label = "Como funciona?", className }: IHowItWorksProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("mb-6", className)}>
      <CollapsibleTrigger className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Icon icon="mdi:help-circle-outline" size={16} />
        {label}
        <Icon
          icon="mdi:chevron-down"
          size={16}
          className={cn("transition-transform duration-200", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <div className="mt-3 w-full rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
