import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import {
  formatReceitaAddressLine,
  isSituacaoAtiva,
  type ICnpjCompany,
} from "../../../utils/minhaReceitaMapper";
import { CUSTOMER_STRINGS } from "../../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.newCustomer.receita;

export interface IReceitaPanelProps {
  company: ICnpjCompany;
}

/**
 * What the Receita answered, shown before the customer is created.
 *
 * The situação cadastral drives the whole panel's colour because it is the one
 * fact that can make a lookup succeed and the cadastro still be a bad idea: a
 * BAIXADA company answers 200 with a full, perfectly valid record.
 */
export function ReceitaPanel({ company }: IReceitaPanelProps) {
  const active = isSituacaoAtiva(company.situacaoCadastral);
  const facts = [
    { label: COPY.cnae, value: company.cnae },
    { label: COPY.openedAt, value: company.openedAt },
    { label: COPY.address, value: formatReceitaAddressLine(company.address) },
  ].filter((fact) => Boolean(fact.value));

  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-top-1 rounded-[9px] border px-3.5 py-3 duration-300",
        active
          ? "border-severity-success/35 bg-severity-success/[0.06]"
          : "border-severity-critical/40 bg-severity-critical/[0.07]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon
          icon="mdi:bank-outline"
          size={14}
          className={cn("shrink-0", active ? "text-severity-success" : "text-severity-critical")}
        />
        <span
          className="min-w-0 flex-1 truncate font-display text-[15px] font-bold uppercase tracking-[0.02em] text-foreground"
          title={company.razaoSocial}
        >
          {company.razaoSocial}
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-[7px] py-0.5 text-[10px] font-bold uppercase tracking-[0.07em] ring-1 ring-inset",
            active
              ? "bg-severity-success/15 text-severity-success ring-severity-success/40"
              : "bg-severity-critical/15 text-severity-critical ring-severity-critical/40",
          )}
        >
          <Icon icon={active ? "mdi:check" : "mdi:alert-outline"} size={10} />
          {company.situacaoCadastral ?? COPY.unknownSituation}
        </span>
      </div>

      {facts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-[22px] gap-y-1">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0 max-w-full">
              <span className="block text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground/70">
                {fact.label}
              </span>
              <span
                className="block truncate text-xs text-foreground/80"
                title={fact.value ?? undefined}
              >
                {fact.value}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2">
        <Icon icon="mdi:check-decagram" size={12} className="shrink-0 text-severity-success" />
        <span className="text-[11px] text-muted-foreground">{COPY.applied}</span>
        {!active && (
          <span className="ml-auto whitespace-nowrap text-[11px] font-bold text-severity-critical">
            {COPY.confirmBeforeCreating}
          </span>
        )}
      </div>
    </div>
  );
}
