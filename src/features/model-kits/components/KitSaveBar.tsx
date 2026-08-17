import type { ModelKitStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { KIT_FAMILIES, type IKitTotals, type KitFamily } from "../engine";

export interface IKitSaveBarProps {
  totals: IKitTotals;
  /** Families the category requires that no base part fills. */
  missingRequired: KitFamily[];
  /** Blocks both saves — the composition is not a kit yet. */
  error: string | null;
  /** How many models receive the kit: this one plus the "também vale para" picks. */
  copyCount: number;
  /** Publishing an official kit is a curation act, not everyone's. */
  canPublish: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: (status: ModelKitStatus) => void;
}

/**
 * Curation happens at save time: a draft always passes — it is how the counter
 * records what it still wants to check — while `oficial` demands the families
 * the category requires, and the bar says which ones are missing rather than
 * just disabling the button.
 */
export function KitSaveBar({
  totals,
  missingRequired,
  error,
  copyCount,
  canPublish,
  saving,
  onCancel,
  onSave,
}: IKitSaveBarProps) {
  const blockPublish = Boolean(error) || missingRequired.length > 0 || !canPublish;
  const missingLabels = missingRequired.map((f) => KIT_FAMILIES[f].label.toLowerCase());

  return (
    <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-background px-4 py-3">
      <div className="min-w-[12rem] flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold tabular-nums text-foreground">
          <span>
            {totals.baseCount} {totals.baseCount === 1 ? "peça base" : "peças base"} ·{" "}
            {formatBRL(totals.base)}
          </span>
          {totals.optionalCount > 0 && (
            <span className="text-xs font-medium text-muted-foreground">
              + {totals.optionalCount} {totals.optionalCount === 1 ? "opcional" : "opcionais"} (
              {formatBRL(totals.optional)})
            </span>
          )}
        </div>

        <p
          className={cn(
            "mt-0.5 flex items-center gap-1.5 text-xs",
            error || missingRequired.length > 0 ? "text-severity-warning" : "text-muted-foreground",
          )}
        >
          {error ? (
            <>
              <Icon icon="mdi:alert-outline" size={13} />
              {error}
            </>
          ) : missingRequired.length > 0 ? (
            <>
              <Icon icon="mdi:alert-outline" size={13} />
              Oficial exige {missingLabels.join(" e ")} — dá para salvar como rascunho
            </>
          ) : (
            <>
              <Icon icon="mdi:check" size={13} className="text-severity-success" />
              Composição completa
              {copyCount > 1 && ` · ${copyCount} modelos`}
            </>
          )}
        </p>
      </div>

      <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
        Cancelar
      </Button>

      <Button
        type="button"
        variant="outline"
        className="gap-1.5"
        disabled={Boolean(error) || saving}
        onClick={() => onSave("rascunho")}
      >
        <Icon icon="mdi:pencil-ruler" size={15} />
        Salvar rascunho
      </Button>

      <Button
        type="button"
        className="gap-1.5"
        disabled={blockPublish || saving}
        title={canPublish ? undefined : "Só Owner e Gestor publicam kit oficial"}
        onClick={() => onSave("oficial")}
      >
        <Icon icon="mdi:check-decagram" size={15} />
        Salvar como oficial
        {copyCount > 1 && ` (${copyCount})`}
      </Button>
    </div>
  );
}
