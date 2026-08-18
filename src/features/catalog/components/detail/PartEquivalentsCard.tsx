import { toast } from "sonner";
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { EquivalentsEditor } from "../form/EquivalentsEditor";
import type { IPartDraft } from "../../utils/draft";
import { PartChip } from "./PartChip";
import { PartPanel } from "./PartPanel";

const COPY = CATALOG_STRINGS.detail.counterCards;

export interface IPartEquivalentsCardProps {
  part: IPart;
  /** Jump to the full "Equivalências" tab. */
  onViewAll: () => void;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
}

/**
 * Compact cross-reference card pinned to the counter layout's left column
 * (design kit `CatEquivalents`) — competitor codes as one-click copy chips.
 */
export function PartEquivalentsCard({
  part,
  onViewAll,
  editing = false,
  draft,
  onDraftChange,
}: IPartEquivalentsCardProps) {
  if (editing && draft && onDraftChange) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Icon icon="mdi:swap-horizontal" size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {CATALOG_STRINGS.detail.sections.equivalents}
          </h2>
        </div>
        <EquivalentsEditor
          selectedIds={draft.equivalentPartIds}
          excludeId={part.id}
          onChange={(ids) => onDraftChange({ equivalentPartIds: ids })}
        />
      </div>
    );
  }

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
    <PartPanel
      title={CATALOG_STRINGS.detail.sections.equivalents}
      icon="mdi:swap-horizontal"
      right={
        refs.length > 0 ? (
          <PartChip tone="warning" size="sm">
            {COPY.codes(refs.length)}
          </PartChip>
        ) : undefined
      }
    >
      {refs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {refs.map((ref) => (
            <button
              key={`${ref.brand}-${ref.code}`}
              type="button"
              title={ref.brand}
              onClick={() => void handleCopy(ref.code)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 font-mono text-[13px] font-bold tracking-[0.03em] text-foreground transition-colors hover:bg-muted/60"
            >
              {ref.code}
              <Icon icon="mdi:content-copy" size={12} className="text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {internalCount > 0 && (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-2 w-full cursor-pointer rounded-lg border border-border py-2.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          {COPY.viewEquivalents(internalCount)}
        </button>
      )}
    </PartPanel>
  );
}
