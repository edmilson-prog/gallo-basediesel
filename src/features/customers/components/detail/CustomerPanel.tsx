import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ICustomerPanelProps {
  /** Section title, rendered in the display face like the kit's `CrmPanel`. */
  title?: string;
  /** Right-aligned slot of the header — sub-tabs, filters, a single action. */
  right?: ReactNode;
  /** Drops the body padding for content that brings its own (tables, lists). */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Framed section used by every tab panel of the detail page.
 *
 * The kit gives each panel a titled header with a slot on the right, which is
 * where the sub-tabs live — pairing "Pedidos" with the Pedidos/Orçamentos
 * switch instead of leaving the switch floating above an untitled block.
 */
export function CustomerPanel({ title, right, flush, className, children }: ICustomerPanelProps) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      {(title || right) && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          {title && (
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.05em] text-muted-foreground">
              {title}
            </h2>
          )}
          {right && <div className="ml-auto">{right}</div>}
        </div>
      )}
      <div className={cn(!flush && "p-4")}>{children}</div>
    </section>
  );
}
