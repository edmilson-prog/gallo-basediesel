import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { CSA_STRINGS, useCustomerServiceMetrics } from "@/features/customer-service-analytics";
import type { ID, ISellerServiceMetrics } from "@/shared/types";
import { PwaTopBar } from "../components/ui/PwaTopBar";
import { PwaTabBar } from "../components/ui/PwaTabBar";
import { PwaOfflineBar } from "../components/ui/PwaOfflineBar";
import { PwaAccountSheet } from "../components/sheets/PwaAccountSheet";
import {
  PwaCsaChannel,
  PwaCsaEscalations,
  PwaCsaOverview,
  PwaCsaSeller,
} from "../components/analise/PwaCsaTabs";
import { PwaCsaSellerSheet } from "../components/analise/PwaCsaSellerSheet";
import { monthKeyOf, monthStrip } from "../engine/csaMonths";
import { usePwaScope } from "../hooks/usePwaConversations";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

type SubTab = "overview" | "channel" | "seller" | "escalations";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "overview", label: CSA_STRINGS.tabOverview },
  { key: "channel", label: CSA_STRINGS.tabChannel },
  { key: "seller", label: CSA_STRINGS.tabSeller },
  { key: "escalations", label: CSA_STRINGS.tabEscalations },
];

/** Chip de filtro/aba — uma forma só para as três faixas desta tela. */
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-[34px] shrink-0 rounded-full px-3 text-[12.5px] font-bold transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-foreground/[0.06] text-muted-foreground ring-1 ring-inset ring-border",
      )}
    >
      {label}
    </button>
  );
}

/**
 * Aba Análise (PRD-051) — espelho móvel de `/app/gestao/atendimento-analise`.
 *
 * Reaproveita o engine e o hook do desktop inteiros: esta tela é outra
 * apresentação da MESMA análise, e recalcular métrica aqui seria criar uma
 * segunda verdade sobre TMA e TMR.
 */
export function AnalisePage() {
  const { currentUser } = useAuth();
  const { online, recheck } = useOnlineStatus();
  const scope = usePwaScope();
  const canView = usePermission("customer_service_analytics", "view");

  const [accountOpen, setAccountOpen] = useState(false);
  const [tab, setTab] = useState<SubTab>("overview");
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(new Date()));
  const [sellerId, setSellerId] = useState<ID | "all">("all");
  const [drillSeller, setDrillSeller] = useState<ISellerServiceMetrics | null>(null);

  const months = useMemo(() => monthStrip(monthKey, new Date()), [monthKey]);

  const result = useCustomerServiceMetrics({
    storeId: scope.storeId ?? "",
    monthKey,
    sellerId,
  });
  const metrics = result.metrics;

  const teamAverage = useMemo(() => {
    const rows = metrics?.bySeller ?? [];
    if (rows.length === 0) return 0;
    return rows.reduce((sum, row) => sum + row.healthScore, 0) / rows.length;
  }, [metrics]);

  const header = (
    <>
      <PwaTopBar
        title={S.analise.title}
        subtitle={S.analise.subtitle}
        online={online}
        userInitials={currentUser?.avatarInitials ?? "?"}
        onAccount={() => setAccountOpen(true)}
      />
      <PwaOfflineBar
        online={online}
        onRetry={() => {
          recheck();
          result.refetch();
        }}
      />
    </>
  );

  // Digitar a URL não pode contornar a matriz de Papéis. A aba já não é montada
  // para quem não pode ver — isto é a segunda tranca, não a primeira.
  if (!canView) {
    return (
      <>
        {header}
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <Icon icon="mdi:lock-outline" size={28} className="text-muted-foreground" />
          <p className="mt-3 text-base font-extrabold text-foreground">{S.analise.blockedTitle}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {CSA_STRINGS.blockedDescription}
          </p>
        </div>
        <PwaTabBar unreadCount={0} queueCount={0} />
      </>
    );
  }

  return (
    <>
      {header}

      <div className="shrink-0 border-b border-border px-3.5 pb-2.5 pt-2">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            {CSA_STRINGS.filtersAnchor}
          </span>
          <div className="flex flex-1 justify-end gap-1.5">
            {months.map((chip) => (
              <Chip
                key={chip.key}
                label={chip.label}
                active={chip.isSelected}
                onClick={() => setMonthKey(chip.key)}
              />
            ))}
          </div>
        </div>

        {/* Vendedor como faixa de chips e não como folha: são poucos, e uma
            folha sobre a tela de filtros é modal sobre modal em 412px. */}
        <div className="-mx-3.5 mt-2 flex gap-1.5 overflow-x-auto px-3.5 [scrollbar-width:none]">
          <Chip
            label={S.analise.sellerAll}
            active={sellerId === "all"}
            onClick={() => setSellerId("all")}
          />
          {result.sellers.map((seller) => (
            <Chip
              key={seller.id}
              label={seller.fullName}
              active={sellerId === seller.id}
              onClick={() => setSellerId(seller.id)}
            />
          ))}
        </div>
      </div>

      <div className="-mx-0 flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-3.5 py-2 [scrollbar-width:none]">
        {SUB_TABS.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            active={tab === item.key}
            onClick={() => setTab(item.key)}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-3">
        {/* A loja chega pelo MultistoreProvider e demora um tique. Sem isto a
            primeira renderização consultaria com storeId vazio e mostraria um
            "sem conversas" que é mentira. */}
        {(result.isLoading || !scope.storeId) && (
          <p className="flex items-center justify-center gap-2 py-12 text-[13px] text-muted-foreground">
            <Icon icon="mdi:loading" size={15} className="animate-spin" />
            {S.analise.loading}
          </p>
        )}

        {!result.isLoading && scope.storeId && result.isError && (
          <div className="py-12 text-center">
            <p className="text-[13.5px] text-muted-foreground">{S.analise.failed}</p>
            <button
              type="button"
              onClick={result.refetch}
              className="mt-3 min-h-[44px] text-[13px] font-bold text-primary"
            >
              {S.analise.retry}
            </button>
          </div>
        )}

        {!result.isLoading && scope.storeId && !result.isError && metrics && (
          <>
            {tab === "overview" && <PwaCsaOverview metrics={metrics} />}
            {tab === "channel" && <PwaCsaChannel metrics={metrics} />}
            {tab === "seller" && <PwaCsaSeller metrics={metrics} onOpenSeller={setDrillSeller} />}
            {tab === "escalations" && <PwaCsaEscalations metrics={metrics} />}
          </>
        )}
      </div>

      <PwaTabBar unreadCount={0} queueCount={0} />
      <PwaAccountSheet open={accountOpen} onOpenChange={setAccountOpen} online={online} />
      <PwaCsaSellerSheet
        seller={drillSeller}
        teamAverage={teamAverage}
        onClose={() => setDrillSeller(null)}
      />
    </>
  );
}
