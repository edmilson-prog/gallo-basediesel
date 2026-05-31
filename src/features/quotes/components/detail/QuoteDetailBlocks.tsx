import type { IQuote, IQuoteItem, ISeller } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR, formatDateTimeBR } from "@/shared/utils/format";
import { DetailCard } from "@/shared/detail-views";
import { QuoteStatusBadge } from "../QuoteStatusBadge";
import { QuoteOriginBadge } from "../QuoteOriginBadge";
import { ValidityIndicator } from "../ValidityIndicator";

/** Hero card: number, badges, dates, total. No actions/banners (those are slotted by the page). */
export function QuoteHero({ quote }: { quote: IQuote }) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">
            #{quote.number}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <QuoteStatusBadge status={quote.status} />
            <QuoteOriginBadge origin={quote.origin} />
            <ValidityIndicator validUntil={quote.validUntil} />
          </div>
          <p className="text-xs text-muted-foreground">
            Criado em {formatDateTimeBR(quote.createdAt)}
            {quote.updatedAt !== quote.createdAt && (
              <> · atualizado {formatDateTimeBR(quote.updatedAt)}</>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-3xl font-bold tabular-nums text-foreground">
            {formatBRL(quote.total)}
          </p>
        </div>
      </div>
    </Card>
  );
}

export interface IQuoteBannersProps {
  quote: IQuote;
  canApprove: boolean;
  onApprove: () => void;
  onRejectApproval: () => void;
  onViewConversation: () => void;
}

/** SDR + approval banners. Returns null when neither applies. */
export function QuoteBanners({
  quote,
  canApprove,
  onApprove,
  onRejectApproval,
  onViewConversation,
}: IQuoteBannersProps) {
  const showSdr = quote.origin === "sdr";
  const showApproval = Boolean(quote.requiresApproval);
  if (!showSdr && !showApproval) return null;
  return (
    <div className="space-y-3">
      {showSdr && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          <Icon
            icon="mdi:robot-outline"
            size={18}
            className="text-emerald-600 dark:text-emerald-300"
          />
          <span className="flex-1 text-emerald-700 dark:text-emerald-200">
            Criado pelo agente SDR durante a conversa do cliente.
          </span>
          {quote.conversationId && (
            <Button variant="ghost" size="sm" onClick={onViewConversation}>
              Ver conversa <Icon icon="mdi:open-in-new" size={14} />
            </Button>
          )}
        </div>
      )}
      {showApproval && (
        <div className="flex flex-col gap-3 rounded-md border border-orange-500/30 bg-orange-500/5 p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-2 text-sm">
            <Icon
              icon="mdi:shield-alert-outline"
              size={18}
              className="text-orange-600 dark:text-orange-300"
            />
            <div>
              <p className="font-medium text-orange-700 dark:text-orange-200">
                Aguardando aprovação do gestor
              </p>
              {quote.discountReason && (
                <p className="text-xs text-orange-700/80 dark:text-orange-200/80">
                  Justificativa: {quote.discountReason}
                </p>
              )}
              {quote.rejectedReason && (
                <p className="text-xs text-rose-600 dark:text-rose-300">
                  Rejeitado anteriormente: {quote.rejectedReason}
                </p>
              )}
            </div>
          </div>
          {canApprove && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onRejectApproval}>
                Rejeitar
              </Button>
              <Button size="sm" onClick={onApprove}>
                Aprovar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface IQuoteActionsProps {
  quote: IQuote;
  canEdit: boolean;
  onSend: () => void;
  onAccept: () => void;
  onReject: () => void;
  onCancelSend: () => void;
  onConvert: () => void;
  onViewPedido: () => void;
  onDuplicate: () => void;
  onWhatsapp: () => void;
  className?: string;
}

/** Contextual action buttons (status-driven). Used in the Cockpit rail and the Operacional zone. */
export function QuoteActions({
  quote,
  canEdit,
  onSend,
  onAccept,
  onReject,
  onCancelSend,
  onConvert,
  onViewPedido,
  onDuplicate,
  onWhatsapp,
  className,
}: IQuoteActionsProps) {
  const isRascunho = quote.status === "rascunho";
  const isEnviado = quote.status === "enviado";
  const isAceito = quote.status === "aceito";
  const isConvertido = quote.status === "convertido";
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {isRascunho && canEdit && (
        <Button size="sm" onClick={onSend} disabled={quote.requiresApproval}>
          <Icon icon="mdi:send-outline" size={14} /> Enviar
        </Button>
      )}
      {isEnviado && canEdit && (
        <>
          <Button size="sm" onClick={onAccept}>
            <Icon icon="mdi:check" size={14} /> Marcar aceito
          </Button>
          <Button size="sm" variant="outline" onClick={onReject}>
            <Icon icon="mdi:close" size={14} /> Marcar recusado
          </Button>
          <Button size="sm" variant="outline" onClick={onCancelSend}>
            <Icon icon="mdi:undo-variant" size={14} /> Cancelar envio
          </Button>
        </>
      )}
      {isAceito && canEdit && (
        <Button size="sm" onClick={onConvert}>
          <Icon icon="mdi:swap-horizontal-bold" size={14} /> Converter em pedido
        </Button>
      )}
      {isConvertido && (
        <Button size="sm" variant="outline" onClick={onViewPedido}>
          <Icon icon="mdi:open-in-new" size={14} /> Ver pedido
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onDuplicate}>
        <Icon icon="mdi:content-duplicate" size={14} /> Duplicar
      </Button>
      <Button size="sm" variant="outline" onClick={onWhatsapp}>
        <Icon icon="mdi:whatsapp" size={14} /> Enviar via WhatsApp
      </Button>
    </div>
  );
}

/** Items table (Peça/Qtd/Unit./Desc./Subtotal). */
export function QuoteItemsBlock({ items }: { items: IQuoteItem[] }) {
  return (
    <DetailCard icon="mdi:format-list-bulleted" title="Itens">
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Peça</th>
              <th className="w-20 px-3 py-2 text-right">Qtd.</th>
              <th className="w-28 px-3 py-2 text-right">Unit.</th>
              <th className="w-24 px-3 py-2 text-right">Desc.</th>
              <th className="w-28 px-3 py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{it.partName}</p>
                  <p className="text-[10px] text-muted-foreground">SKU {it.partSku}</p>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatBRL(it.unitPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {it.discount > 0 ? `-${formatBRL(it.discount)}` : "—"}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {formatBRL(it.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DetailCard>
  );
}

/** Conditions: payment method/terms, validity, seller, internal notes. */
export function QuoteConditionsBlock({ quote, seller }: { quote: IQuote; seller: ISeller | null }) {
  return (
    <DetailCard icon="mdi:credit-card-outline" title="Condições">
      <dl className="grid gap-3 text-sm md:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Forma de pagamento</dt>
          <dd className="font-medium text-foreground">{quote.paymentMethod ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Prazo</dt>
          <dd className="font-medium text-foreground">
            {quote.paymentTerms ?? quote.paymentCondition}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Validade</dt>
          <dd className="font-medium text-foreground">{formatDateBR(quote.validUntil)}</dd>
        </div>
        {seller && (
          <div>
            <dt className="text-xs text-muted-foreground">Vendedor</dt>
            <dd className="font-medium text-foreground">{seller.fullName}</dd>
          </div>
        )}
        {quote.notes && (
          <div className="md:col-span-3">
            <dt className="text-xs text-muted-foreground">Notas internas</dt>
            <dd className="text-foreground">{quote.notes}</dd>
          </div>
        )}
      </dl>
    </DetailCard>
  );
}
