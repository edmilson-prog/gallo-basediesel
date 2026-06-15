import type { IWhatsAppAccount } from "@/shared/types";
import { formatPhone } from "@/shared/utils/format";
import { instanceAccent } from "../utils/instanceAccent";

export interface IOriginChipProps {
  account: IWhatsAppAccount | null;
  /** dot = só a bolinha (lista/compacto); label = bolinha+apelido; full = +número. */
  variant?: "dot" | "label" | "full";
  className?: string;
}

export function OriginChip({ account, variant = "label", className }: IOriginChipProps) {
  if (!account) return null;
  const color = instanceAccent(account.id);
  const dot = (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
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
      title={`Origem: ${account.label}`}
    >
      {dot}
      <span className="truncate">{account.label}</span>
      {variant === "full" && account.phoneNumber ? (
        <span className="text-muted-foreground">· {formatPhone(account.phoneNumber)}</span>
      ) : null}
    </span>
  );
}
