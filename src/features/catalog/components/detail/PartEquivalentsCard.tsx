import { toast } from "sonner";
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.detail.counterCards;

export interface IPartEquivalentsCardProps {
  part: IPart;
  /** Jump to the full "Equivalências" tab. */
  onViewAll: () => void;
}

/**
 * Compact cross-reference card pinned to the counter layout's left column
 * (design kit `CatEquivalents`) — competitor codes as one-click copy chips.
 */
export function PartEquivalentsCard({ part, onViewAll }: IPartEquivalentsCardProps) {
  const refs = part.crossReferences ?? [];
  const internalCount = part.equivalentPartIds.length;
  if (refs.length === 0 && internalCount === 0) return null;

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(COPY.copied(code));
    } catch {
      toast.error(COPY.copyError);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon icon="mdi:swap-horizontal" size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {CATALOG_STRINGS.detail.sections.equivalents}
        </h2>
        {refs.length > 0 && (
          <span className="ml-auto inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {COPY.codes(refs.length)}
          </span>
        )}
      </div>

      {refs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {refs.map((ref) => (
            <button
              key={`${ref.brand}-${ref.code}`}
              type="button"
              title={ref.brand}
              onClick={() => void handleCopy(ref.code)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 font-mono text-xs font-semibold text-foreground transition-colors hover:bg-muted/60"
            >
              {ref.code}
              <Icon icon="mdi:content-copy" size={11} className="text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {internalCount > 0 && (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-2 w-full cursor-pointer rounded-md border border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          {COPY.viewEquivalents(internalCount)}
        </button>
      )}
    </div>
  );
}
