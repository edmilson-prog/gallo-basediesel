import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { formatBRLCompact } from "@/shared/utils/format";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";
import type { ISellerLeaderboardRow } from "../../utils/sellerLeaderboard";

// Medal tones are universal semantics — fixed colors are intentional here.
const MEDALS = [
  { grad: "from-amber-400 to-amber-600", icon: "mdi:medal", order: "order-2", h: "pt-5" },
  { grad: "from-slate-300 to-slate-500", icon: "mdi:medal-outline", order: "order-1", h: "" },
  { grad: "from-amber-700 to-amber-900", icon: "mdi:medal-outline", order: "order-3", h: "" },
];

export interface ISellerPodiumProps {
  top3: ISellerLeaderboardRow[];
  onSelect: (sellerId: string) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function SellerPodium({ top3, onSelect }: ISellerPodiumProps) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {S.sellersPodiumTitle}
      </p>
      <div className="flex items-end justify-center gap-3">
        {top3.map((row, i) => {
          const m = MEDALS[i]!;
          return (
            <button
              key={row.sellerId}
              type="button"
              onClick={() => onSelect(row.sellerId)}
              className={cn(
                "flex flex-1 flex-col items-center rounded-2xl bg-gradient-to-b p-3 text-center text-white transition-transform hover:-translate-y-0.5",
                m.grad,
                m.order,
                m.h,
              )}
            >
              <span className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-xs font-extrabold">
                {initials(row.sellerName)}
              </span>
              <Icon icon={m.icon} size={18} className="opacity-90" />
              <span className="mt-1 truncate text-xs font-bold">{row.sellerName}</span>
              <span className="text-sm font-extrabold tabular-nums">
                {formatBRLCompact(row.revenue)}
              </span>
              {row.attainmentPct != null && (
                <span className="text-[10px] opacity-90">
                  {Math.round(row.attainmentPct)}% {S.sellersDrawerOfTarget}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
