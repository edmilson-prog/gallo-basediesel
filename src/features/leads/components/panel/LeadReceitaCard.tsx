import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { isSituacaoAtiva, type ICnpjCompany } from "@/features/customers/utils/minhaReceitaMapper";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import type { IReceitaAutofillPlan, ReceitaLookupState } from "../../engine/receitaAutofill";

const COPY = LEADS_STRINGS.panel.conversion.receita;

export interface ILeadReceitaCardProps {
  state: ReceitaLookupState;
  /** Set only while `state === "found"`, and only for the CNPJ on screen. */
  company: ICnpjCompany | null;
  /** What saving would write alongside the document. */
  plan: IReceitaAutofillPlan | null;
  /** Whether the seller accepted the offered company name. */
  useNameSuggestion: boolean;
  onToggleNameSuggestion: () => void;
  onRetry: () => void;
}

/**
 * The Receita's answer, inside the conversion checklist's document editor.
 *
 * A narrower sibling of the "Novo cliente" ReceitaPanel: same argument (the
 * situação cadastral colours the block, because a BAIXADA company answers 200
 * with a perfectly valid record), but it also has to say what saving will do to
 * the OTHER rows of the checklist — those are on screen behind the popover, and
 * watching three of them change unannounced is not a feature. It shows the
 * VALUES, not just the field names: this is the only autofill in the product
 * that writes without putting the value in an input the seller can read first.
 *
 * The wrapper is one live region that stays mounted across every state. A
 * region inserted into the DOM already populated is generally not announced —
 * so swapping four different `role="status"` elements in and out, as an earlier
 * cut of this did, announced nothing at all.
 */
export function LeadReceitaCard({
  state,
  company,
  plan,
  useNameSuggestion,
  onToggleNameSuggestion,
  onRetry,
}: ILeadReceitaCardProps) {
  return (
    <div role="status" aria-live="polite" className={cn(state !== "idle" && "min-h-[18px]")}>
      {state === "checking" && (
        <StatusLine icon="mdi:loading" spin>
          {COPY.checking}
        </StatusLine>
      )}

      {state === "notfound" && (
        <StatusLine icon="mdi:magnify-remove-outline" tone="critical">
          {COPY.notFound}
        </StatusLine>
      )}

      {state === "offline" && (
        <StatusLine icon="mdi:wifi-off">
          <span>{COPY.offline}</span>{" "}
          <button
            type="button"
            onClick={onRetry}
            className="font-bold text-primary underline underline-offset-2 hover:no-underline"
          >
            {COPY.retry}
          </button>
        </StatusLine>
      )}

      {state === "found" && company && (
        <CompanyBlock
          company={company}
          plan={plan}
          useNameSuggestion={useNameSuggestion}
          onToggleNameSuggestion={onToggleNameSuggestion}
        />
      )}
    </div>
  );
}

function CompanyBlock({
  company,
  plan,
  useNameSuggestion,
  onToggleNameSuggestion,
}: {
  company: ICnpjCompany;
  plan: IReceitaAutofillPlan | null;
  useNameSuggestion: boolean;
  onToggleNameSuggestion: () => void;
}) {
  const active = isSituacaoAtiva(company.situacaoCadastral);
  const city = company.address ? `${company.address.city}/${company.address.state}` : null;
  const entries = plan?.fields ?? [];

  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-top-1 rounded-md border px-2.5 py-2 duration-200",
        active
          ? "border-severity-success/35 bg-severity-success/[0.06]"
          : "border-severity-critical/40 bg-severity-critical/[0.07]",
      )}
    >
      <div className="flex items-start gap-1.5">
        <Icon
          icon="mdi:bank-outline"
          size={13}
          className={cn(
            "mt-px shrink-0",
            active ? "text-severity-success" : "text-severity-critical",
          )}
          aria-hidden
        />
        <p
          className="min-w-0 flex-1 text-[11.5px] font-bold leading-snug text-foreground"
          title={company.razaoSocial}
        >
          {company.razaoSocial}
        </p>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[19px]">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] ring-1 ring-inset",
            active
              ? "bg-severity-success/15 text-severity-success ring-severity-success/40"
              : "bg-severity-critical/15 text-severity-critical ring-severity-critical/40",
          )}
        >
          <Icon icon={active ? "mdi:check" : "mdi:alert-outline"} size={9} aria-hidden />
          {company.situacaoCadastral ?? COPY.unknownSituation}
        </span>
        {city && <span className="truncate text-[10.5px] text-muted-foreground">{city}</span>}
      </div>

      {!active && (
        <p className="mt-1.5 pl-[19px] text-[10.5px] font-semibold leading-snug text-severity-critical">
          {COPY.inactiveWarning}
        </p>
      )}

      {entries.length > 0 && (
        <div className="mt-1.5 border-t border-border/60 pt-1.5">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/80">
            <Icon icon="mdi:auto-fix" size={11} className="shrink-0" aria-hidden />
            {COPY.willFillTitle}
          </p>
          <dl className="mt-1 space-y-0.5">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-baseline gap-1.5">
                <dt className="shrink-0 text-[10.5px] text-muted-foreground">
                  {COPY.fieldNames[entry.id]}
                </dt>
                <dd
                  className="min-w-0 flex-1 truncate text-right text-[10.5px] font-semibold text-foreground"
                  title={entry.value}
                >
                  {entry.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {plan?.nameSuggestion && (
        <button
          type="button"
          onClick={onToggleNameSuggestion}
          aria-pressed={useNameSuggestion}
          className={cn(
            "mt-1.5 flex w-full items-center gap-1 rounded px-1 py-0.5 -mx-1 text-left text-[10.5px] font-bold leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            useNameSuggestion
              ? "text-severity-success"
              : "text-primary hover:bg-foreground/[0.045]",
          )}
        >
          <Icon
            icon={useNameSuggestion ? "mdi:checkbox-marked-outline" : "mdi:checkbox-blank-outline"}
            size={12}
            className="shrink-0"
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">{COPY.applyName(plan.nameSuggestion)}</span>
        </button>
      )}
    </div>
  );
}

function StatusLine({
  icon,
  spin,
  tone,
  children,
}: {
  icon: string;
  spin?: boolean;
  tone?: "critical";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-[10.5px] leading-snug",
        tone === "critical" ? "text-severity-critical" : "text-muted-foreground",
      )}
    >
      <Icon
        icon={icon}
        size={12}
        className={cn("mt-px shrink-0", spin && "animate-spin motion-reduce:animate-none")}
        aria-hidden
      />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}
