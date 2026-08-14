import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import type { IPartDraft } from "../../utils/draft";
import { StockBadge } from "../StockBadge";
import { PartSpecRow } from "./PartSpecRow";

const COPY = CATALOG_STRINGS.detail.logistics;
const STOCK_COPY = CATALOG_STRINGS.detail.stock;

export interface IPartLogisticsCardProps {
  part: IPart;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
  /** Drop the card chrome — the counter layout already wraps the tab body. */
  headless?: boolean;
}

export function PartLogisticsCard({
  part,
  editing = false,
  draft,
  onDraftChange,
  headless = false,
}: IPartLogisticsCardProps) {
  if (editing && draft && onDraftChange) {
    return (
      <Shell headless={headless}>
        <div className="mb-3 flex items-center justify-between">
          <CardHeader />
          <StockBadge
            part={{ stockAvailable: draft.stockAvailable, stockMinimum: draft.stockMinimum }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <EditField label={COPY.weight}>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={draft.weightKg ?? ""}
              onChange={(e) =>
                onDraftChange({
                  weightKg: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </EditField>
          <EditField label={COPY.location}>
            <Input
              value={draft.storageLocation}
              onChange={(e) => onDraftChange({ storageLocation: e.target.value })}
              className="font-mono"
            />
          </EditField>
          <EditField label={COPY.boxQty}>
            <Input
              type="number"
              inputMode="numeric"
              value={draft.boxQuantity ?? ""}
              onChange={(e) =>
                onDraftChange({
                  boxQuantity: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </EditField>
          <EditField label={COPY.unit}>
            <Input
              value={draft.unitOfMeasure}
              onChange={(e) => onDraftChange({ unitOfMeasure: e.target.value })}
            />
          </EditField>
          <EditField label={COPY.fractionable}>
            <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3">
              <Switch
                checked={draft.fractionable}
                onCheckedChange={(v) => onDraftChange({ fractionable: v })}
                id="edit-fractionable"
              />
              <Label htmlFor="edit-fractionable" className="cursor-pointer text-xs">
                {draft.fractionable ? COPY.yes : COPY.no}
              </Label>
            </div>
          </EditField>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
          <EditField label={STOCK_COPY.current}>
            <Input
              type="number"
              inputMode="numeric"
              value={draft.stockAvailable}
              onChange={(e) =>
                onDraftChange({ stockAvailable: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </EditField>
          <EditField label={STOCK_COPY.minimum}>
            <Input
              type="number"
              inputMode="numeric"
              value={draft.stockMinimum}
              onChange={(e) =>
                onDraftChange({ stockMinimum: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </EditField>
        </div>
      </Shell>
    );
  }

  const hasData =
    part.weightKg != null ||
    part.storageLocation ||
    part.boxQuantity != null ||
    part.fractionable != null ||
    part.unitOfMeasure;

  return (
    <Shell headless={headless}>
      <div className="mb-3 flex items-center justify-between">
        <CardHeader />
        <StockBadge part={part} />
      </div>
      {hasData ? (
        <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
          <PartSpecRow
            label={COPY.weight}
            value={part.weightKg != null ? `${part.weightKg.toLocaleString("pt-BR")} kg` : "—"}
          />
          <PartSpecRow
            label={COPY.location}
            value={part.storageLocation ?? "—"}
            mono={Boolean(part.storageLocation)}
          />
          <PartSpecRow
            label={COPY.boxQty}
            value={part.boxQuantity != null ? String(part.boxQuantity) : "—"}
          />
          <PartSpecRow
            label={COPY.fractionable}
            value={part.fractionable != null ? (part.fractionable ? COPY.yes : COPY.no) : "—"}
          />
          <PartSpecRow label={COPY.unit} value={part.unitOfMeasure ?? "—"} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      )}
    </Shell>
  );
}

function Shell({ headless, children }: { headless: boolean; children: React.ReactNode }) {
  if (headless) return <div>{children}</div>;
  return <div className="rounded-lg border border-border bg-card p-4">{children}</div>;
}

function CardHeader() {
  return (
    <div className="flex items-center gap-2">
      <Icon icon="mdi:package-variant-closed" size={18} className="text-muted-foreground" />
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{COPY.title}</h2>
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
