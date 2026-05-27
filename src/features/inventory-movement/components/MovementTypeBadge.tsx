import type { MovementType } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { INVENTORY_MOVEMENT_STRINGS as S } from "../i18n/pt-BR";

const TYPE_CLASSES: Record<MovementType, string> = {
  saida_venda: "bg-destructive/15 text-destructive border-destructive/30",
  devolucao: "bg-info/15 text-info border-info/30",
  entrada_compra: "bg-success/15 text-success border-success/30",
  ajuste_inventario: "bg-warning/15 text-warning border-warning/30",
  transferencia_loja: "bg-muted text-muted-foreground border-border",
};

const TYPE_ICONS: Record<MovementType, string> = {
  saida_venda: "mdi:arrow-up-bold-box-outline",
  devolucao: "mdi:keyboard-return",
  entrada_compra: "mdi:arrow-down-bold-box-outline",
  ajuste_inventario: "mdi:tune-vertical",
  transferencia_loja: "mdi:swap-horizontal",
};

const TYPE_LABELS: Record<MovementType, string> = {
  saida_venda: S.typeSaidaVenda,
  entrada_compra: S.typeEntradaCompra,
  ajuste_inventario: S.typeAjusteInventario,
  transferencia_loja: S.typeTransferenciaLoja,
  devolucao: S.typeDevolucao,
};

export const MOVEMENT_TYPE_LABELS = TYPE_LABELS;

export function MovementTypeBadge({ type }: { type: MovementType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        TYPE_CLASSES[type],
      )}
    >
      <Icon icon={TYPE_ICONS[type]} size={12} />
      {TYPE_LABELS[type]}
    </span>
  );
}
