import { Icon } from "@/components/Icon";
import { SectionHeader } from "./SectionHeader";

interface IPlaceholderSectionProps {
  title: string;
  description: string;
  /** PRD codes that will implement this section (e.g. "100-102"). */
  prdCodes?: string;
  /** Bullets describing what will be configurable later. */
  whatComes: string[];
  /** Optional status note shown after the bullets. */
  statusNote?: string;
  icon?: string;
  /** Optional content rendered between the banner and "what comes" list (e.g. divisions cards). */
  children?: React.ReactNode;
}

/**
 * Visual pattern shared by every settings sub-route still pending content
 * (PRD-019 — "Esqueleto não é vazio").
 */
export function PlaceholderSection({
  title,
  description,
  prdCodes,
  whatComes,
  statusNote,
  icon = "mdi:hammer-wrench",
  children,
}: IPlaceholderSectionProps) {
  return (
    <div className="space-y-6">
      <SectionHeader title={title} description={description} />

      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <Icon icon={icon} size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Edição disponível na Fase 2</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta seção está em preparação{prdCodes ? ` (PRD-${prdCodes})` : ""}. Por enquanto, os
              defaults da plataforma estão em vigor.
            </p>
          </div>
        </div>

        {children && <div className="mt-6">{children}</div>}

        <div className="mt-6 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            O que poderá ser configurado
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-foreground">
            {whatComes.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {statusNote && <p className="mt-4 text-xs italic text-muted-foreground">{statusNote}</p>}
      </div>
    </div>
  );
}
