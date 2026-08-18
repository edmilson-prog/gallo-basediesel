import { formatPercent } from "@/shared/utils/format";
import { CSA_STRINGS, formatDuration } from "@/features/customer-service-analytics";
import type { ISellerServiceMetrics } from "@/shared/types";
import { PwaSheet } from "../ui/PwaSheet";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

interface IPwaCsaSellerSheetProps {
  seller: ISellerServiceMetrics | null;
  /** Média de saúde da equipe, para o número do vendedor ter contra o quê ler. */
  teamAverage: number;
  onClose: () => void;
}

/**
 * Drill-down do vendedor.
 *
 * O desktop abre uma página própria (`/app/gestao/atendimento-analise/$sellerId`).
 * No celular vira folha: o contexto — o mês e o recorte que você já escolheu —
 * continua atrás, e fechar não custa uma navegação.
 */
export function PwaCsaSellerSheet({ seller, teamAverage, onClose }: IPwaCsaSellerSheetProps) {
  return (
    <PwaSheet
      open={seller !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={seller ? `${CSA_STRINGS.drillTitle}${seller.sellerName}` : CSA_STRINGS.drillTitle}
    >
      {seller && (
        <div className="flex flex-col gap-4 pb-1">
          <div className="flex items-end gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                {S.analise.sellerHealth}
              </p>
              <p className="mt-0.5 font-display text-[34px] font-extrabold leading-none text-foreground">
                {Math.round(seller.healthScore)}
                <span className="ml-1 text-[15px] font-bold text-muted-foreground">/100</span>
              </p>
            </div>
            <p className="pb-1 text-[12px] text-muted-foreground">
              {CSA_STRINGS.drillTeamAverage}: {Math.round(teamAverage)}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-y-3">
            {[
              [CSA_STRINGS.kpiVolume, String(seller.totalConversations)],
              [CSA_STRINGS.kpiTma, formatDuration(seller.averageHandleTime)],
              [CSA_STRINGS.kpiTmr, formatDuration(seller.averageResponseTime)],
              [CSA_STRINGS.kpiResolution, formatPercent(seller.resolutionRate)],
              [CSA_STRINGS.kpiConversion, formatPercent(seller.conversionRate)],
              [CSA_STRINGS.escAvgTitle, String(seller.escalationCount)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-0.5 text-[15px] font-extrabold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </PwaSheet>
  );
}
