import type { IPart } from "@/shared/types";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { Section } from "./ApplicationsSection";

const COPY = CATALOG_STRINGS.detail.crossReferences;

export interface IPartCrossReferenceSectionProps {
  part: IPart;
}

/**
 * Competitor brand cross-references (aftermarket equivalents) — a compact grid
 * of brand → part number. Complements `EquivalentsSection`, which links other
 * GALLO catalog parts.
 */
export function PartCrossReferenceSection({ part }: IPartCrossReferenceSectionProps) {
  const refs = part.crossReferences ?? [];

  return (
    <Section title={CATALOG_STRINGS.detail.sections.crossReferences} icon="mdi:tag-multiple-outline">
      {refs.length > 0 ? (
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {refs.map((ref) => (
            <div
              key={`${ref.brand}-${ref.code}`}
              className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
            >
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {ref.brand}
              </dt>
              <dd className="font-mono text-foreground">{ref.code}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      )}
    </Section>
  );
}
