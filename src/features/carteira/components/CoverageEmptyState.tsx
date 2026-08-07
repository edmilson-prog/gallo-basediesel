import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";

export interface ICoverageEmptyStateProps {
  canManage: boolean;
  onNewCoverage: () => void;
}

/**
 * "Nobody is away" is a healthy answer, not an absence of data — so this reads
 * as a statement with an offer, not as an error slot waiting to be filled.
 */
export function CoverageEmptyState({ canManage, onNewCoverage }: ICoverageEmptyStateProps) {
  const strings = CARTEIRA_STRINGS.coverage;

  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-dashed border-border bg-card px-4 py-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border">
        <Icon icon="mdi:clock-outline" size={16} className="text-muted-foreground" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{strings.emptyTitle}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{strings.emptyDescription}</div>
      </div>
      {canManage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto shrink-0"
          onClick={onNewCoverage}
        >
          {CARTEIRA_STRINGS.wallet.registerCoverage}
        </Button>
      )}
    </div>
  );
}
