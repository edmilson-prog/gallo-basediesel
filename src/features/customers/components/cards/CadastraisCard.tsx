import type { ICustomer, ICustomerAddress } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { formatCNPJ, formatCPF } from "@/shared/utils/format";

const COPY = CUSTOMER_STRINGS.overview.cadastrais;

export interface ICadastraisCardProps {
  customer: ICustomer;
}

/**
 * Identity card — renders B2B fields (CNPJ, razão social, nome fantasia,
 * contato) or B2C fields (CPF, nome completo). Discriminated union ensures
 * the wrong branch never reads from missing fields.
 */
export function CadastraisCard({ customer }: ICadastraisCardProps) {
  return (
    <section className="rounded-lg border border-border bg-background p-3">
      <header className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon icon="mdi:badge-account-outline" size={14} />
        {COPY.title}
      </header>

      <dl className="space-y-2 text-xs">
        {customer.type === "B2B" ? (
          <>
            <Row label={COPY.razaoSocial} value={customer.razaoSocial} />
            <Row label={COPY.nomeFantasia} value={customer.nomeFantasia} />
            <Row label={COPY.cnpj} value={formatCNPJ(customer.cnpj)} mono />
            <Row label={COPY.contactName} value={customer.contactName} />
          </>
        ) : (
          <>
            <Row label={COPY.fullName} value={customer.fullName} />
            <Row label={COPY.cpf} value={formatCPF(customer.cpf)} mono />
          </>
        )}
        <AddressRow address={customer.address} />
      </dl>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-baseline gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-foreground" : "text-foreground"}>{value}</dd>
    </div>
  );
}

function AddressRow({ address }: { address?: ICustomerAddress }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-baseline gap-2 border-t border-border pt-2">
      <dt className="text-muted-foreground">{CUSTOMER_STRINGS.overview.cadastrais.address}</dt>
      <dd className="text-foreground">
        {address ? (
          <span className="block leading-snug">
            {address.street}, {address.number}
            {address.complement ? ` — ${address.complement}` : ""}
            <br />
            <span className="text-muted-foreground">
              {address.district} • {address.city}/{address.state} • {address.zipCode}
            </span>
          </span>
        ) : (
          <span className="italic text-muted-foreground">
            {CUSTOMER_STRINGS.overview.cadastrais.noAddress}
          </span>
        )}
      </dd>
    </div>
  );
}
