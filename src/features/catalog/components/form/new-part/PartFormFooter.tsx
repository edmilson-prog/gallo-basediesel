import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { CATALOG_STRINGS } from "../../../i18n/pt-BR";
import type { PartRequirement } from "../../../engine/newPart";

const COPY = CATALOG_STRINGS.newPart.footer;

export interface IPartFormFooterProps {
  missing: PartRequirement[];
  saleReady: boolean;
  saving: boolean;
  onCancel: () => void;
  onSaveAndNew: () => void;
}

/**
 * The footer says what is missing, by name.
 *
 * A greyed-out button with no explanation makes the person hunt the form for
 * the reason; on a form this long that hunt is the whole cost. When nothing is
 * missing the sentence switches to what the part will be worth on the shelf —
 * measured by the same ruler the catalog list uses to count parts ready to sell.
 */
export function PartFormFooter({
  missing,
  saleReady,
  saving,
  onCancel,
  onSaveAndNew,
}: IPartFormFooterProps) {
  const canSave = missing.length === 0;

  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:-mx-[26px] sm:px-[26px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <p className="min-w-0 flex-1 text-[12.5px]" aria-live="polite">
          {canSave ? (
            <span
              className={
                saleReady
                  ? "flex items-center gap-1.5 font-semibold text-severity-success"
                  : "flex items-center gap-1.5 font-semibold text-severity-warning"
              }
            >
              <Icon
                icon={saleReady ? "mdi:check-circle-outline" : "mdi:alert-circle-outline"}
                size={15}
                className="shrink-0"
                aria-hidden
              />
              {saleReady ? COPY.ready : COPY.incomplete}
            </span>
          ) : (
            <span className="text-muted-foreground">
              <span className="font-bold text-foreground">{COPY.missingPrefix}:</span>{" "}
              {missing.map((item) => COPY.requirements[item]).join(" · ")}
            </span>
          )}
        </p>

        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            {COPY.cancel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onSaveAndNew}
            disabled={!canSave || saving}
            className="gap-1.5 font-display font-bold uppercase tracking-[0.045em]"
          >
            <Icon icon="mdi:playlist-plus" size={14} aria-hidden />
            {COPY.saveAndNew}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!canSave || saving}
            className="gap-1.5 font-display font-bold uppercase tracking-[0.045em]"
          >
            {saving ? (
              <Icon icon="svg-spinners:ring-resize" size={14} aria-hidden />
            ) : (
              <Icon icon="mdi:check" size={14} aria-hidden />
            )}
            {saving ? COPY.saving : COPY.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
