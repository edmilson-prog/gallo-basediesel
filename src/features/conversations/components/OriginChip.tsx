import type { IWhatsAppAccount } from "@/shared/types";
import { formatPhone } from "@/shared/utils/format";
import { accountAccent } from "../utils/instanceAccent";

export interface IOriginChipProps {
  account: IWhatsAppAccount | null;
  /** dot = só a bolinha (lista/compacto); label = bolinha+apelido; full = +número. */
  variant?: "dot" | "label" | "full";
  className?: string;
}

export function OriginChip({ account, variant = "label", className }: IOriginChipProps) {
  if (!account) return null;
  const color = accountAccent(account);
  // `full` variant appends the origin phone (smaller, muted) beside the name.
  // Drop the "+55" country code here — it's noise for a single-country UI.
  const phone =
    variant === "full" && account.phoneNumber
      ? formatPhone(account.phoneNumber).replace(/^\+55\s/, "")
      : null;
  const dot = (
    <span aria-hidden className="relative inline-flex size-2 shrink-0">
      <span
        className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative inline-flex size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
    </span>
  );
  if (variant === "dot") {
    return (
      <span
        className={className}
        title={`Origem: ${account.label}`}
        aria-label={`Origem: ${account.label}`}
      >
        {dot}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground ${className ?? ""}`}
      title={phone ? `Origem: ${account.label} · ${phone}` : `Origem: ${account.label}`}
    >
      {dot}
      <span className="truncate">{account.label}</span>
      {phone ? (
        <>
          <span aria-hidden className="h-3 w-px shrink-0 bg-border" />
          <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
            {phone}
          </span>
        </>
      ) : null}
    </span>
  );
}
