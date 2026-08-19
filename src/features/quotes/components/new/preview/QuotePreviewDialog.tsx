// src/features/quotes/components/new/preview/QuotePreviewDialog.tsx
import type { ICustomer, ILead, IQuoteItem, IStore, QuotePaymentMethod } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { formatCnpj, formatCpf } from "@/features/customers/utils/cnpjCpf";
import { FREE_ITEM_PART_ID } from "../../../utils/quoteItemOps";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const PAYMENT_LABEL: Record<QuotePaymentMethod, string> = {
  pix: "PIX",
  boleto: "Boleto",
  cartao: "Cartão",
  prazo: "Prazo",
  outro: "Outro",
};

/** The id the print stylesheet isolates — see `@media print` in styles.css. */
export const QUOTE_PREVIEW_PRINT_ID = "quote-preview-print";

function formatDocument(customer: ICustomer): string | null {
  if (customer.type === "B2B") return customer.cnpj ? `CNPJ ${formatCnpj(customer.cnpj)}` : null;
  return customer.cpf ? `CPF ${formatCpf(customer.cpf)}` : null;
}

function formatValidUntil(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : dateFormatter.format(d);
}

export interface IQuotePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: IStore | null;
  /** Recipient — a customer or, for the lead shortcut, the lead. */
  customer: ICustomer | null;
  lead: ILead | null;
  items: IQuoteItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  paymentMethod: QuotePaymentMethod;
  paymentTerms: string;
  /** `YYYY-MM-DD`, as held by the date field. */
  validUntil: string;
  sellerName?: string | null;
}

/**
 * The quote as the customer receives it — the document behind "Pré-visualizar",
 * before it is saved and sent. Internal figures (cost, margin, notes) never
 * appear here: this is the customer's side of the screen.
 *
 * Printing goes through the browser, which is also how it becomes a PDF —
 * "Imprimir → Salvar como PDF" — so the preview is the document, not a picture
 * of one.
 */
export function QuotePreviewDialog({
  open,
  onOpenChange,
  store,
  customer,
  lead,
  items,
  subtotal,
  discount,
  shipping,
  total,
  paymentMethod,
  paymentTerms,
  validUntil,
  sellerName,
}: IQuotePreviewDialogProps) {
  const recipientName = customer ? getCustomerName(customer) : (lead?.name ?? "—");
  const recipientDoc = customer ? formatDocument(customer) : null;
  const recipientPhone = customer?.phone ?? lead?.phone ?? null;
  const address = customer?.address ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader className="print:hidden">
          <DialogTitle>Pré-visualização</DialogTitle>
          <DialogDescription>
            O orçamento como o cliente recebe. Custos, margem e notas internas ficam de fora.
          </DialogDescription>
        </DialogHeader>

        <article
          id={QUOTE_PREVIEW_PRINT_ID}
          className="rounded-lg border border-border bg-card p-5 text-foreground"
        >
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
            <div className="min-w-0">
              <p className="font-display text-2xl font-extrabold uppercase leading-none tracking-[0.02em]">
                {store?.name ?? "GALLO Base Diesel"}
              </p>
              {store?.cnpj && (
                <p className="mt-1 font-semicond text-[11.5px] text-muted-foreground">
                  CNPJ {formatCnpj(store.cnpj)}
                </p>
              )}
              {store?.address && (
                <p className="font-semicond text-[11.5px] text-muted-foreground">{store.address}</p>
              )}
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-extrabold uppercase leading-none">
                Orçamento
              </p>
              <p className="mt-1 font-semicond text-[11.5px] text-muted-foreground">
                Número atribuído ao salvar
              </p>
              <p className="font-semicond text-[11.5px] text-muted-foreground">
                Válido até {formatValidUntil(validUntil)}
              </p>
            </div>
          </header>

          <section className="grid gap-4 border-b border-border py-4 sm:grid-cols-2">
            <div className="min-w-0">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Cliente
              </h3>
              <p className="mt-1 text-sm font-semibold">{recipientName}</p>
              {recipientDoc && (
                <p className="font-semicond text-[11.5px] text-muted-foreground">{recipientDoc}</p>
              )}
              {recipientPhone && (
                <p className="font-semicond text-[11.5px] text-muted-foreground">
                  {recipientPhone}
                </p>
              )}
              {address && (
                <p className="font-semicond text-[11.5px] text-muted-foreground">
                  {address.street}, {address.number} — {address.city}/{address.state}
                </p>
              )}
            </div>
            <div className="min-w-0 sm:text-right">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Atendimento
              </h3>
              {sellerName && <p className="mt-1 text-sm font-semibold">{sellerName}</p>}
              <p className="font-semicond text-[11.5px] text-muted-foreground">
                Pagamento {PAYMENT_LABEL[paymentMethod]}
                {paymentTerms.trim() ? ` · ${paymentTerms.trim()}` : ""}
              </p>
            </div>
          </section>

          <table className="w-full border-collapse py-4 text-left">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 font-semibold">Peça</th>
                <th className="py-2 text-right font-semibold">Qtd</th>
                <th className="py-2 text-right font-semibold">Unitário</th>
                <th className="py-2 text-right font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3">
                    <p className="text-[13px] font-medium">{item.partName}</p>
                    {item.partId !== FREE_ITEM_PART_ID && (
                      <p className="font-semicond text-[11px] text-muted-foreground">
                        SKU {item.partSku}
                      </p>
                    )}
                  </td>
                  <td className="py-2 text-right text-[13px] tabular-nums">{item.quantity}</td>
                  <td className="py-2 text-right text-[13px] tabular-nums">
                    {moneyFormatter.format(item.unitPrice)}
                  </td>
                  <td className="py-2 text-right font-display text-[15px] font-extrabold tabular-nums">
                    {moneyFormatter.format(item.total)}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                    Nenhum item no orçamento ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <section className="ml-auto mt-4 w-full max-w-xs">
            <Row label="Subtotal" value={moneyFormatter.format(subtotal)} />
            {discount > 0 && (
              <Row label="Desconto" value={`− ${moneyFormatter.format(discount)}`} />
            )}
            <Row label="Frete" value={`+ ${moneyFormatter.format(shipping)}`} />
            <div className="mt-2 flex items-end justify-between gap-2 border-t border-border pt-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total
              </span>
              <span className="font-display text-[28px] font-extrabold leading-none tabular-nums">
                {moneyFormatter.format(total)}
              </span>
            </div>
          </section>

          <footer className="mt-5 border-t border-border pt-3">
            <p className="font-semicond text-[11px] text-muted-foreground">
              Valores sujeitos a alteração após a validade. Disponibilidade sujeita a confirmação de
              estoque no momento do pedido.
            </p>
          </footer>
        </article>

        <div className="flex justify-end gap-2 print:hidden">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button type="button" onClick={() => window.print()}>
            <Icon icon="mdi:printer-outline" size={16} />
            Imprimir / salvar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
