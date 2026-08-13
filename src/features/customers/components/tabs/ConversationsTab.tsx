import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { IConversation, ICustomer } from "@/shared/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useConversationsProvider } from "@/providers/data/hooks/useConversationsProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { CHANNEL_META } from "@/features/conversations/utils/conversationDisplay";
import { hashHue, initialsFrom, avatarColors } from "@/shared/utils/avatar";
import { formatDateBR } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { TabSkeleton } from "../TabSkeleton";
import { TabEmptyState } from "../TabEmptyState";
import { CustomerEmptyState } from "../detail/CustomerEmptyState";

const COPY = CUSTOMER_STRINGS.conversations;

const STATUS_LABEL: Record<IConversation["status"], string> = {
  aguardando: "Aguardando",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguard. cliente",
  resolvida: "Resolvida",
  arquivada: "Arquivada",
};

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

  return (
    <div className="space-y-3">
      {!headless && (
        <header className="flex items-center gap-2">
          <Icon icon="mdi:forum-outline" size={16} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{COPY.title}</h3>
        </header>
      )}

      {query.isLoading ? (
        <TabSkeleton rows={4} />
      ) : sortedItems.length === 0 ? (
        headless ? (
          <CustomerEmptyState
            icon="mdi:forum-off-outline"
            title={COPY.emptyTitle}
            text={COPY.emptyHint}
          />
        ) : (
          <TabEmptyState icon="mdi:forum-off-outline" message={COPY.empty} />
        )
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
                  onClick={() => void navigate({ to: `/app/atendimento/${conv.id}` as never })}
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
