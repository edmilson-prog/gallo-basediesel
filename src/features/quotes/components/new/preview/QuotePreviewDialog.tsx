// src/features/quotes/components/new/preview/QuotePreviewDialog.tsx
import { useEffect } from "react";
import type {
  ICustomer,
  ID,
  ILead,
  IPart,
  IQuoteItem,
  IStore,
  QuotePaymentMethod,
} from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
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

/**
 * Paper, not app. The document keeps its own light palette on purpose: this is
 * what the customer receives, and it must not change with the seller's theme.
 * Hence the literal colours instead of semantic tokens.
 */
const INK = "#231F20";
const INK_2 = "rgba(35,31,32,.64)";
const INK_3 = "rgba(35,31,32,.42)";
const PAPER_LINE = "rgba(35,31,32,.14)";

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
  customer: ICustomer | null;
  lead: ILead | null;
  items: IQuoteItem[];
  partsById: Map<ID, IPart>;
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
 * The quote as the customer receives it, before it is saved and sent. Cost,
 * margin and internal notes never appear — this is the customer's side of the
 * screen.
 *
 * Printing goes through the browser, which is also how it becomes a PDF, so
 * the preview IS the document rather than a picture of one.
 */
export function QuotePreviewDialog({
  open,
  onOpenChange,
  store,
  customer,
  lead,
  items,
  partsById,
  subtotal,
  discount,
  shipping,
  total,
  paymentMethod,
  paymentTerms,
  validUntil,
  sellerName,
}: IQuotePreviewDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const recipientName = customer ? getCustomerName(customer) : (lead?.name ?? null);
  const recipientDoc = customer ? formatDocument(customer) : null;
  const address = customer?.address ?? null;
  const today = dateFormatter.format(new Date());

  const th: React.CSSProperties = {
    fontWeight: 700,
    fontSize: 9,
    letterSpacing: ".12em",
    textTransform: "uppercase",
    color: INK_3,
    padding: "7px 10px",
    textAlign: "left",
  };
  const td: React.CSSProperties = {
    fontSize: 12,
    color: INK,
    padding: "8px 10px",
    borderTop: `1px solid ${PAPER_LINE}`,
    verticalAlign: "top",
  };
  const num: React.CSSProperties = {
    ...td,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pré-visualização do orçamento"
      className="fixed inset-0 z-50 flex flex-col bg-foreground/80 backdrop-blur-sm"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 py-3 print:hidden">
        <Icon icon="mdi:eye-outline" size={15} className="text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-background">
          Pré-visualização
        </span>
        <span className="font-semicond text-xs text-background/70">
          é assim que o cliente recebe — margem e notas internas ficam de fora
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
            <Icon icon="mdi:printer-outline" size={15} />
            Imprimir / salvar PDF
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            <Icon icon="mdi:close" size={15} />
            Fechar
            <kbd className="ml-1 rounded border border-border px-1 font-semicond text-[10.5px]">
              Esc
            </kbd>
          </Button>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-7"
        onClick={(e) => {
          if (e.target === e.currentTarget) onOpenChange(false);
        }}
      >
        <article
          id={QUOTE_PREVIEW_PRINT_ID}
          style={{
            width: 780,
            maxWidth: "100%",
            margin: "0 auto",
            background: "#fff",
            borderRadius: 6,
            overflow: "hidden",
            fontFamily: "var(--font-body)",
          }}
        >
          <div style={{ height: 7, background: "var(--service-red, #C4151C)" }} />
          <div style={{ padding: "26px 34px 30px" }}>
            <header style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: ".02em",
                    fontSize: 23,
                    lineHeight: 1,
                    color: INK,
                  }}
                >
                  {store?.name ?? "GALLO Base Diesel"}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-semicond)",
                    fontSize: 11.5,
                    color: INK_2,
                    marginTop: 5,
                    lineHeight: 1.5,
                  }}
                >
                  {store?.address}
                  {store?.cnpj ? ` · CNPJ ${formatCnpj(store.cnpj)}` : ""}
                </div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    fontSize: 17,
                    color: INK,
                  }}
                >
                  Orçamento
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-semicond)",
                    fontSize: 11.5,
                    color: INK_2,
                    marginTop: 4,
                    lineHeight: 1.55,
                  }}
                >
                  nº gerado ao salvar
                  <br />
                  emitido em {today}
                  <br />
                  válido até {formatValidUntil(validUntil)}
                </div>
              </div>
            </header>

            <section
              style={{
                marginTop: 20,
                padding: "12px 14px",
                border: `1px solid ${PAPER_LINE}`,
                borderRadius: 8,
                display: "flex",
                gap: 16,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...th, padding: 0 }}>Cliente</div>
                {recipientName ? (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: INK }}>
                      {recipientName}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-semicond)",
                        fontSize: 11.5,
                        color: INK_2,
                        marginTop: 2,
                      }}
                    >
                      {[
                        recipientDoc,
                        address
                          ? `${address.street}, ${address.number} — ${address.city}/${address.state}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 4, fontStyle: "italic", fontSize: 12.5, color: INK_3 }}>
                    — selecione o cliente no orçamento —
                  </div>
                )}
              </div>
              {sellerName && (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ ...th, padding: 0 }}>Vendedor</div>
                  <div style={{ marginTop: 4, fontSize: 12.5, color: INK }}>{sellerName}</div>
                </div>
              )}
            </section>

            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18 }}>
              <thead>
                <tr style={{ background: "rgba(35,31,32,.045)" }}>
                  <th style={th}>Item</th>
                  <th style={{ ...th, textAlign: "right" }}>Qtd</th>
                  <th style={{ ...th, textAlign: "right" }}>Unitário</th>
                  <th style={{ ...th, textAlign: "right" }}>Desconto</th>
                  <th style={{ ...th, textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.length > 0 ? (
                  items.map((item) => {
                    const isFree = item.partId === FREE_ITEM_PART_ID;
                    const part = isFree ? undefined : partsById.get(item.partId);
                    return (
                      <tr key={item.id}>
                        <td style={td}>
                          <div style={{ fontWeight: 600 }}>{item.partName}</div>
                          <div
                            style={{
                              fontFamily: "var(--font-semicond)",
                              fontSize: 10.5,
                              color: INK_3,
                              marginTop: 1,
                            }}
                          >
                            {isFree
                              ? "item avulso"
                              : `SKU ${item.partSku}${part ? ` · OEM ${part.oemCodes[0] ?? "—"} · ${part.brand}` : ""}`}
                          </div>
                        </td>
                        <td style={num}>{item.quantity}</td>
                        <td style={num}>{moneyFormatter.format(item.unitPrice)}</td>
                        <td style={{ ...num, color: item.discount > 0 ? INK : INK_3 }}>
                          {item.discount > 0 ? `− ${moneyFormatter.format(item.discount)}` : "—"}
                        </td>
                        <td style={{ ...num, fontWeight: 700 }}>
                          {moneyFormatter.format(item.total)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td style={{ ...td, fontStyle: "italic", color: INK_3 }} colSpan={5}>
                      Nenhum item adicionado ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <section style={{ display: "flex", gap: 16, marginTop: 16, alignItems: "flex-start" }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "11px 13px",
                  background: "rgba(35,31,32,.035)",
                  borderRadius: 8,
                }}
              >
                <div style={{ ...th, padding: 0 }}>Condições</div>
                <div style={{ fontSize: 12, color: INK, marginTop: 5, lineHeight: 1.7 }}>
                  Pagamento: <b>{PAYMENT_LABEL[paymentMethod]}</b>
                  {paymentTerms.trim() ? (
                    <>
                      {" "}
                      · prazo <b>{paymentTerms.trim()}</b>
                    </>
                  ) : null}
                  <br />
                  {shipping > 0 ? "Frete incluso no total." : "Frete a combinar."} Sujeito à
                  disponibilidade de estoque.
                  <br />
                  <span style={{ color: INK_3 }}>Este documento não substitui a nota fiscal.</span>
                </div>
              </div>
              <div style={{ width: 236, flexShrink: 0 }}>
                {[
                  ["Subtotal", moneyFormatter.format(subtotal)],
                  ["Desconto", discount > 0 ? `− ${moneyFormatter.format(discount)}` : "—"],
                  ["Frete", shipping > 0 ? moneyFormatter.format(shipping) : "—"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "4px 0",
                      fontSize: 12,
                      color: INK_2,
                    }}
                  >
                    <span>{label}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: INK }}>{value}</span>
                  </div>
                ))}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    marginTop: 8,
                    paddingTop: 9,
                    borderTop: `2px solid ${INK}`,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: ".12em",
                      textTransform: "uppercase",
                      color: INK,
                    }}
                  >
                    Total
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 800,
                      fontSize: 26,
                      lineHeight: 0.9,
                      color: INK,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {moneyFormatter.format(total)}
                  </span>
                </div>
              </div>
            </section>

            <footer
              style={{
                marginTop: 26,
                paddingTop: 12,
                borderTop: `1px solid ${PAPER_LINE}`,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "var(--font-semicond)",
                fontSize: 10.5,
                color: INK_3,
              }}
            >
              <span>{store?.name ?? "GALLO Base Diesel"} · gallobasediesel.com.br</span>
              <span style={{ marginLeft: "auto" }}>página 1 de 1</span>
            </footer>
          </div>
        </article>
      </div>
    </div>
  );
}
