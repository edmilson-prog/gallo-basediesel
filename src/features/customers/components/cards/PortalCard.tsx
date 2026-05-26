import type { ICustomer, IPortalSettings } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { formatBRL } from "@/shared/utils/format";

const COPY = CUSTOMER_STRINGS.overview.portal;

export interface IPortalCardProps {
  customer: ICustomer;
}

interface IToggleRow {
  key: keyof Pick<
    IPortalSettings,
    | "enabled"
    | "canViewOrderHistory"
    | "canCreateQuote"
    | "canApproveQuote"
    | "canSeePriceTable"
    | "canDownloadNF"
    | "canSeeCreditLimit"
  >;
  label: string;
}

const TOGGLE_ROWS: IToggleRow[] = [
  { key: "enabled", label: COPY.enabled },
  { key: "canViewOrderHistory", label: COPY.canViewOrderHistory },
  { key: "canCreateQuote", label: COPY.canCreateQuote },
  { key: "canApproveQuote", label: COPY.canApproveQuote },
  { key: "canSeePriceTable", label: COPY.canSeePriceTable },
  { key: "canDownloadNF", label: COPY.canDownloadNF },
  { key: "canSeeCreditLimit", label: COPY.canSeeCreditLimit },
];

/**
 * Read-only summary of the Customer Portal granular permissions. Editing the
 * toggles lives in PRD-019 — here we only render the current state so the
 * vendedor knows what the customer can / cannot self-serve.
 */
export function PortalCard({ customer }: IPortalCardProps) {
  const settings = customer.portal;

  return (
    <section className="rounded-lg border border-border bg-background p-3">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon icon="mdi:cellphone-key" size={14} />
          {COPY.title}
        </h3>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={COPY.hint}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition hover:text-foreground"
            >
              <Icon icon="mdi:information-outline" size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[220px] text-xs">
            {COPY.hint}
          </TooltipContent>
        </Tooltip>
      </header>

      {!settings ? (
        <p className="text-xs italic text-muted-foreground">{COPY.notProvisioned}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
          {TOGGLE_ROWS.map((row) => (
            <li key={row.key} className="flex items-center gap-1.5">
              <span
                className={
                  settings[row.key]
                    ? "inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : "inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground"
                }
                aria-label={settings[row.key] ? COPY.yes : COPY.no}
              >
                <Icon icon={settings[row.key] ? "mdi:check" : "mdi:close"} size={11} />
              </span>
              <span className={settings[row.key] ? "text-foreground" : "text-muted-foreground"}>
                {row.label}
              </span>
            </li>
          ))}
          {typeof settings.creditLimit === "number" && (
            <li className="col-span-full mt-1 border-t border-border pt-2 text-xs">
              <span className="text-muted-foreground">Limite de crédito:</span>{" "}
              <span className="font-semibold text-foreground">
                {formatBRL(settings.creditLimit)}
              </span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
