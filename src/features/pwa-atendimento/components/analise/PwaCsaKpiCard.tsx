import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

interface IPwaCsaKpiCardProps {
  label: string;
  value: string;
  help?: string;
  /** Variação percentual vs. o período anterior; `null` quando não há base. */
  deltaPct: number | null;
  /**
   * Em TMA e TMR, cair é bom. Sem isso o cartão pinta de vermelho justamente a
   * melhora que a equipe conquistou.
   */
  lowerIsBetter?: boolean;
  /** Cartão tracejado do NPS: existe para dizer que ainda não existe. */
  placeholder?: boolean;
}

export function PwaCsaKpiCard({
  label,
  value,
  help,
  deltaPct,
  lowerIsBetter = false,
  placeholder = false,
}: IPwaCsaKpiCardProps) {
  const improved = deltaPct === null ? null : lowerIsBetter ? deltaPct < 0 : deltaPct > 0;
  const flat = deltaPct !== null && Math.abs(deltaPct) < 0.05;

  return (
    <div
      className={cn(
        "rounded bg-card px-3.5 py-3",
        placeholder ? "border border-dashed border-border" : "ring-1 ring-inset ring-border",
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-display text-[26px] font-extrabold leading-none",
          placeholder ? "text-muted-foreground/50" : "text-foreground",
        )}
      >
        {value}
      </p>

      {!placeholder && (
        <p className="mt-1.5 flex items-center gap-1 text-[11.5px] font-semibold">
          {deltaPct === null || flat ? (
            <span className="text-muted-foreground/70">
              {deltaPct === null ? S.analise.deltaNoBase : "estável"}
            </span>
          ) : (
            <span
              className={cn(
                "flex items-center gap-0.5",
                improved ? "text-severity-success" : "text-severity-critical",
              )}
            >
              <Icon icon={deltaPct > 0 ? "mdi:arrow-up" : "mdi:arrow-down"} size={13} aria-hidden />
              {Math.abs(deltaPct).toFixed(1).replace(".", ",")}%
            </span>
          )}
        </p>
      )}

      {help && <p className="mt-1 text-[11px] leading-snug text-muted-foreground/70">{help}</p>}
    </div>
  );
}
