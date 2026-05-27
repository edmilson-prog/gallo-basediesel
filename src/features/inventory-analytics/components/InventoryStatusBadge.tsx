import type { InventoryCurve, InventoryStatus } from "@/shared/types";
import { cn } from "@/lib/utils";
import { INVENTORY_STRINGS as S } from "../i18n/pt-BR";

const STATUS_CLASSES: Record<InventoryStatus, string> = {
  ok: "bg-success/15 text-success border-success/30",
  baixo: "bg-warning/15 text-warning border-warning/30",
  critico: "bg-destructive/15 text-destructive border-destructive/40",
  excesso: "bg-info/15 text-info border-info/30",
};

const STATUS_LABEL: Record<InventoryStatus, string> = {
  ok: S.statusOk,
  baixo: S.statusBaixo,
  critico: S.statusCritico,
  excesso: S.statusExcesso,
};

export function InventoryStatusBadge({ status }: { status: InventoryStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        STATUS_CLASSES[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const CURVE_CLASSES: Record<InventoryCurve, string> = {
  X: "bg-success/15 text-success border-success/30",
  Y: "bg-warning/15 text-warning border-warning/30",
  Z: "bg-muted text-muted-foreground border-border",
};

export function InventoryCurveBadge({ curve }: { curve: InventoryCurve }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold uppercase",
        CURVE_CLASSES[curve],
      )}
      title={curve === "X" ? S.curveX : curve === "Y" ? S.curveY : S.curveZ}
    >
      {curve}
    </span>
  );
}
