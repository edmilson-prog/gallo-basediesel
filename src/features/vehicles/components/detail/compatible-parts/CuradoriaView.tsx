import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VEHICLE_STRINGS } from "@/features/vehicles/i18n/pt-BR";
import { CompatiblePartRow } from "./CompatiblePartRow";

export interface ICuradoriaViewProps {
  inKit: IPart[];
  drift: IPart[];
  topN: number;
  onAddToQuote?: (p: IPart) => void;
  onSeeAll: () => void;
  showingAll: boolean;
}

const COPY = VEHICLE_STRINGS.detail.compatibleV2;

interface ISubsectionProps {
  heading: React.ReactNode;
  list: IPart[];
  inKitFlag: boolean;
  topN: number;
  showingAll: boolean;
  onSeeAll: () => void;
  onAddToQuote?: (p: IPart) => void;
}

function Subsection({
  heading,
  list,
  inKitFlag,
  topN,
  showingAll,
  onSeeAll,
  onAddToQuote,
}: ISubsectionProps) {
  const shown = showingAll ? list : list.slice(0, topN);
  const hasMore = !showingAll && list.length > topN;

  return (
    <div className="space-y-1">
      {heading}
      <ul className="divide-y divide-border">
        {shown.map((part) => (
          <li key={part.id}>
            <CompatiblePartRow part={part} inKit={inKitFlag} onAddToQuote={onAddToQuote} />
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className="flex">
          <Button variant="ghost" size="sm" onClick={onSeeAll}>
            <Icon icon="mdi:chevron-down" size={14} />
            {COPY.seeAll(list.length)}
          </Button>
        </div>
      )}
    </div>
  );
}

export function CuradoriaView({
  inKit,
  drift,
  topN,
  onAddToQuote,
  onSeeAll,
  showingAll,
}: ICuradoriaViewProps) {
  const hasInKit = inKit.length > 0;
  const hasDrift = drift.length > 0;

  if (!hasInKit && !hasDrift) return null;

  return (
    <div className="space-y-4">
      {hasInKit && (
        <Subsection
          heading={
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {COPY.inKit} ({inKit.length})
            </h4>
          }
          list={inKit}
          inKitFlag={true}
          topN={topN}
          showingAll={showingAll}
          onSeeAll={onSeeAll}
          onAddToQuote={onAddToQuote}
        />
      )}
      {hasDrift && (
        <Subsection
          heading={
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {COPY.drift} ({drift.length})
              </h4>
              <Badge variant="outline" className="gap-1 bg-primary/10 text-foreground">
                <Icon icon="mdi:source-branch" size={12} />
                {COPY.driftChip}
              </Badge>
            </div>
          }
          list={drift}
          inKitFlag={false}
          topN={topN}
          showingAll={showingAll}
          onSeeAll={onSeeAll}
          onAddToQuote={onAddToQuote}
        />
      )}
    </div>
  );
}
