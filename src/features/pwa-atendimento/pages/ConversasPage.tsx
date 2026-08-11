import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { pwaFiltersToListParams } from "../engine/pwaFilters";
import { PwaTopBar } from "../components/ui/PwaTopBar";
import { PwaTabBar } from "../components/ui/PwaTabBar";
import { PwaOfflineBar } from "../components/ui/PwaOfflineBar";
import { PwaFilterPanel } from "../components/PwaFilterPanel";
import { PwaConversationRow } from "../components/PwaConversationRow";
import { PwaAccountSheet } from "../components/sheets/PwaAccountSheet";
import {
  usePwaConversations,
  usePwaFilterState,
  usePwaScope,
} from "../hooks/usePwaConversations";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useSellerNames } from "../hooks/useSellerNames";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

export function ConversasPage() {
  const { currentUser } = useAuth();
  const { online, recheck } = useOnlineStatus();
  const scope = usePwaScope();
  const { filters, setFilters, resetFilters } = usePwaFilterState();
  const listParams = useMemo(
    () => pwaFiltersToListParams(filters, { storeId: scope.storeId, currentSellerId: scope.sellerId }),
    [filters, scope.storeId, scope.sellerId],
  );
  const list = usePwaConversations(listParams);
  const sellerNames = useSellerNames();
  const [accountOpen, setAccountOpen] = useState(false);

  // Infinite scroll: a sentinel at the end of the list asks for the next page.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMore = list.loadMore;
  const canLoadMore = list.hasMore && !list.isLoadingMore;
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !canLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, loadMore]);

  const unreadLabel =
    list.unreadConversations === 0
      ? ""
      : ` · ${list.unreadConversations} ${
          list.unreadConversations === 1 ? S.list.oneUnreadSuffix : S.list.unreadSuffix
        }`;

  return (
    <>
      <PwaTopBar
        title={S.list.title}
        subtitle={`${
          list.total === 1 ? S.list.countOne : S.list.countOther(Math.max(list.total, 0))
        }${unreadLabel}`}
        online={online}
        userInitials={currentUser?.avatarInitials ?? "?"}
        onAccount={() => setAccountOpen(true)}
      />
      <PwaOfflineBar
        online={online}
        onRetry={() => {
          recheck();
          list.refetch();
        }}
      />
      <PwaFilterPanel
        filters={filters}
        onChange={setFilters}
        onClear={resetFilters}
        count={list.items.length}
      />

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {list.isLoading && list.items.length === 0 ? (
          <p
            aria-busy="true"
            className="flex items-center justify-center gap-2 px-6 py-14 text-xs text-muted-foreground"
          >
            <Icon icon="mdi:loading" size={16} className="animate-spin" />
            Carregando conversas…
          </p>
        ) : list.error && list.items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Icon icon="mdi:alert-circle-outline" size={26} className="text-severity-critical" />
            <p className="mt-3 text-base font-extrabold text-foreground">
              Não foi possível carregar as conversas
            </p>
            <button
              type="button"
              onClick={list.refetch}
              className="mt-3 min-h-[44px] text-[13px] font-bold text-primary"
            >
              Tentar de novo
            </button>
          </div>
        ) : list.items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Icon icon="mdi:magnify" size={26} className="text-muted-foreground" />
            <p className="mt-3 text-base font-extrabold text-foreground">{S.list.emptyTitle}</p>
            <p className="mt-1.5 text-[13.5px] text-muted-foreground">{S.list.emptyDescription}</p>
          </div>
        ) : (
          <>
            {list.items.map((item) => (
              <PwaConversationRow
                key={item.id}
                item={item}
                assigneeLabel={
                  item.assignedSellerId
                    ? (sellerNames.get(item.assignedSellerId) ?? "Atribuída")
                    : null
                }
                onOpen={list.markItemRead}
              />
            ))}
            <div ref={sentinelRef} />
            {list.isLoadingMore && (
              <p className="flex items-center justify-center gap-2 py-4 text-[11.5px] text-muted-foreground">
                <Icon icon="mdi:loading" size={14} className="animate-spin" />
                Carregando mais…
              </p>
            )}
            {list.loadMoreFailed && (
              <button
                type="button"
                onClick={list.loadMore}
                className="w-full py-4 text-center text-[11.5px] font-bold text-primary"
              >
                {S.list.loadMoreFailed}
              </button>
            )}
            {!list.hasMore && !list.isLoadingMore && (
              <p className="px-3.5 pb-7 pt-4 text-center text-[11.5px] text-muted-foreground/70">
                {S.list.endOfList}
              </p>
            )}
          </>
        )}
      </div>

      <PwaTabBar unreadCount={list.unreadConversations} queueCount={list.queueCount} />
      <PwaAccountSheet open={accountOpen} onOpenChange={setAccountOpen} online={online} />
    </>
  );
}
