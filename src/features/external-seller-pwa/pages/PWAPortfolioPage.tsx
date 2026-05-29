import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateBR } from "@/shared/utils/format";
import { usePwaAuth } from "../hooks/usePwaAuth";
import { usePwaPortfolio } from "../hooks/usePwaPortfolio";
import { customerLabel } from "../utils/customerLabel";
import { PWA_STRINGS as S } from "../i18n/pt-BR";

const STATUS_TONE: Record<string, string> = {
  ativo: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  dormente: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  recuperacao: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  perdido: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function PWAPortfolioPage() {
  const { session } = usePwaAuth();
  const [search, setSearch] = useState("");
  const { data: customers = [], isLoading } = usePwaPortfolio(
    session?.sellerId,
    search || undefined,
  );

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-semibold text-foreground">{S.portfolioTitle}</h1>

      <div className="relative">
        <Icon
          icon="mdi:magnify"
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={S.portfolioSearch}
          className="h-12 pl-9 text-base"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{S.portfolioEmpty}</p>
      ) : (
        <div className="space-y-2">
          {customers.map((c) => (
            <Link key={c.id} to="/pwa/carteira/$id" params={{ id: c.id }}>
              <Card className="flex items-center gap-3 p-3 active:bg-muted/60">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                  {customerLabel(c).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{customerLabel(c)}</p>
                  <p className="text-xs text-muted-foreground">
                    {S.lastPurchase}:{" "}
                    {c.lastPurchaseAt ? formatDateBR(c.lastPurchaseAt) : S.noPurchase}
                  </p>
                </div>
                <Badge variant="outline" className={STATUS_TONE[c.status] ?? ""}>
                  {c.status}
                </Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
