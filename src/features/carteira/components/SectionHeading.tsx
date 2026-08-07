import type { ReactNode } from "react";

export interface ISectionHeadingProps {
  title: string;
  /** Volume of what follows ("6 nos últimos 30 dias"). */
  count?: ReactNode;
  /** One clause explaining the section's rule ("volta sozinha na data final"). */
  hint?: string;
  /** Trailing action, pushed to the far edge. */
  right?: ReactNode;
  children: ReactNode;
}

/**
 * Section wrapper for the Carteira tab. The heading is deliberately quiet —
 * uppercase micro-label rather than a second page title — so the three sections
 * read as one continuous page instead of three competing screens.
 */
export function SectionHeading({ title, count, hint, right, children }: ISectionHeadingProps) {
  return (
    <section className="mb-5">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
        {count != null && <span className="text-xs text-muted-foreground/70">{count}</span>}
        {hint && <span className="text-xs text-muted-foreground/70">{hint}</span>}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}
