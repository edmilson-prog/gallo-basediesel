import { useState } from "react";
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { useCanViewCostMargin } from "../../hooks/useCanViewCostMargin";
import { PART_LOOKUP_STRINGS as S } from "../../i18n/pt-BR";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function CostMarginGate({ part }: { part: IPart }) {
  const canView = useCanViewCostMargin();
  const [revealed, setRevealed] = useState(false);
  if (!canView) return null;

  return (
    <div className="flex items-center justify-between border-l-2 border-severity-warning/60 bg-severity-warning/5 px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs text-severity-warning">
        <Icon icon="mdi:lock-outline" size={13} />
        {S.costMargin} · {S.costMarginGated}
        {revealed && (
          <span className="ml-1 tabular-nums text-foreground">
            {BRL.format(part.unitCost)} · {Math.round(part.marginPercent * 100)}%
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="rounded-md border border-severity-warning px-2 py-0.5 text-[11px] text-severity-warning"
      >
        {revealed ? S.hide : S.reveal}
      </button>
    </div>
  );
}
