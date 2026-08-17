import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { IConversation, ICustomer } from "@/shared/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useConversationsProvider } from "@/providers/data/hooks/useConversationsProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { CHANNEL_META, STATUS_META } from "@/features/conversations/utils/conversationDisplay";
import { hashHue, initialsFrom, avatarColors } from "@/shared/utils/avatar";
import { formatDateBR } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { TabSkeleton } from "../TabSkeleton";
import { TabEmptyState } from "../TabEmptyState";
import { CustomerEmptyState } from "../detail/CustomerEmptyState";
import { CustomerRows, type ICustomerRowsColumn } from "../detail/CustomerRows";

const COPY = CUSTOMER_STRINGS.conversations;

const STATUS_LABEL: Record<IConversation["status"], string> = {
  aguardando: "Aguardando",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguard. cliente",
  resolvida: "Resolvida",
  arquivada: "Arquivada",
};

/** The kit's four columns, with its own track widths. */
const COLUMNS: ICustomerRowsColumn[] = [
  { label: COPY.columns.channel, width: "140px" },
  { label: COPY.columns.start, width: "120px" },
  { label: COPY.columns.seller },
  { label: COPY.columns.status, width: "150px" },
];

export interface IConversationsTabProps {
  customer: ICustomer;
  currentConversation?: IConversation | null;
  /** Drops the internal title — the detail page's `CustomerPanel` owns it. */
  headless?: boolean;
}

export function ConversationsTab({
  customer,
  currentConversation,
  headless,
}: IConversationsTabProps) {
  const provider = useConversationsProvider();
  const sellersProvider = useSellersProvider();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["customer-conversations", customer.id] as const,
    staleTime: 60 * 1000,
    queryFn: () =>
      provider
        .list({
          customerId: customer.id,
          pageSize: 100,
          orderBy: "lastMessageAt",
          orderDir: "desc",
        })
        .then((r) => r.data),
  });

  const sellersQuery = useQuery({
    queryKey: ["sellers"] as const,
    staleTime: 5 * 60 * 1000,
    queryFn: () => sellersProvider.list(),
  });

  const sellersById = new Map((sellersQuery.data ?? []).map((s) => [s.id, s]));

  const items = query.data ?? [];
  const sortedItems = currentConversation
    ? [
        ...items.filter((c) => c.id === currentConversation.id),
        ...items.filter((c) => c.id !== currentConversation.id),
      ]
    : items;

  const openConversation = (id: string) =>
    void navigate({ to: `/app/atendimento/${id}` as never });

  const sellerNameOf = (conversation: IConversation) =>
    conversation.assignedSellerId
      ? (sellersById.get(conversation.assignedSellerId)?.fullName ?? COPY.unknown)
      : COPY.unknown;

  /**
   * Detail page: the kit lists conversations as a table inside the panel, so
   * the four facts line up down the page instead of being re-read per card.
   * The narrow fiche of the Atendimento rail keeps the stacked cards below —
   * four columns do not fit a 320px column.
   */
  if (headless) {
    if (query.isLoading) {
      return (
        <div className="p-4">
          <TabSkeleton rows={4} />
        </div>
      );
    }

    if (sortedItems.length === 0) {
      return (
        <CustomerEmptyState
          icon="mdi:forum-off-outline"
          title={COPY.emptyTitle}
          text={COPY.emptyHint}
        />
      );
    }

    // The visible column is "Início", so the order follows it — sorting by last
    // activity would print a column that reads out of sequence.
    const byStart = [...sortedItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return (
      <CustomerRows
        className="p-1"
        columns={COLUMNS}
        rows={byStart.map((conv) => {
          const channel = CHANNEL_META[conv.channel];
          const startedAt = formatDateBR(conv.createdAt);
          const sellerName = sellerNameOf(conv);

          return {
            key: conv.id,
            onClick: () => openConversation(conv.id),
            ariaLabel: COPY.rowAriaLabel(channel.label, startedAt),
            cells: [
              <span className="inline-flex items-center gap-1.5">
                <Icon
                  icon={channel.icon}
                  size={14}
                  aria-hidden
                  // The kit paints the channel icon green (WhatsApp); it does
                  // not cover the others, which stay neutral rather than
                  // inventing a color per channel.
                  className={
                    conv.channel === "whatsapp"
                      ? "text-severity-success"
                      : "text-muted-foreground"
                  }
                />
                {channel.label}
              </span>,
              startedAt,
              sellersQuery.isLoading && conv.assignedSellerId ? (
                <Skeleton className="h-3.5 w-24" />
              ) : (
                <span className={sellerName === COPY.unknown ? "text-muted-foreground" : undefined}>
                  {sellerName}
                </span>
              ),
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.07em]",
                  STATUS_META[conv.status].pillClass,
                )}
              >
                {STATUS_LABEL[conv.status]}
              </span>,
            ],
          };
        })}
      />
    );
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-2">
        <Icon icon="mdi:forum-outline" size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{COPY.title}</h3>
      </header>

      {query.isLoading ? (
        <TabSkeleton rows={4} />
      ) : sortedItems.length === 0 ? (
        <TabEmptyState icon="mdi:forum-off-outline" message={COPY.empty} />
      ) : (
        <ul className="space-y-1.5">
          {sortedItems.map((conv) => {
            const channel = CHANNEL_META[conv.channel];
            const isCurrent = currentConversation?.id === conv.id;
            const seller = conv.assignedSellerId ? sellersById.get(conv.assignedSellerId) : null;
            const sellerHue = conv.assignedSellerId ? hashHue(conv.assignedSellerId) : 0;
            const sellerColors = avatarColors(sellerHue);

            return (
              <li key={conv.id}>
                <button
                  type="button"
                  onClick={() => openConversation(conv.id)}
                  className={cn(
                    "block w-full rounded-md border bg-background p-2.5 text-left transition hover:border-primary/50 hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring",
                    isCurrent ? "border-primary/50 bg-primary/5" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full",
                        channel.tone,
                      )}
                    >
                      <Icon icon={channel.icon} size={12} />
                    </span>
                    <span className="flex-1 truncate text-xs font-medium text-foreground">
                      {channel.label}
                    </span>
                    {isCurrent && (
                      <span className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                        {COPY.current}
                      </span>
                    )}
                    <span className="text-[10px] uppercase text-muted-foreground">
                      {STATUS_LABEL[conv.status]}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      {sellersQuery.isLoading ? (
                        <Skeleton className="h-4 w-4 rounded-full" />
                      ) : seller ? (
                        <>
                          <Avatar className="h-4 w-4 text-[8px]">
                            <AvatarFallback
                              style={{ backgroundColor: sellerColors.bg, color: sellerColors.fg }}
                              aria-hidden
                            >
                              {initialsFrom(seller.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          {COPY.seller} {seller.fullName.split(" ")[0]}
                        </>
                      ) : (
                        <>{COPY.unknown}</>
                      )}
                    </span>
                    <span>{formatDateBR(conv.lastMessageAt)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
