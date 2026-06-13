import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { ICustomer, ID, ILead, IMessage, IConversation } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import {
  useConversationsProvider,
  useCustomersProvider,
  useLeadsProvider,
  useMessagesProvider,
} from "@/providers/data";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEscalationsByConversation } from "@/features/sdr-escalation";
import { useConversationsList } from "../hooks/useConversationsList";
import { useInboxFilters, filtersToListParams } from "../hooks/useInboxFilters";
import { useRealtimeConversations } from "../hooks/useRealtimeConversations";
import { useLastSelectedConversation } from "../hooks/useLastSelectedConversation";
import { useUnreadTracking } from "../hooks/useUnreadTracking";
import { ConversationListItem } from "../components/ConversationListItem";
import { InboxFilters } from "../components/InboxFilters";
import { InboxHeader } from "../components/InboxHeader";
import { InboxEmptyState } from "../components/InboxEmptyState";
import { QuickActions } from "../components/QuickActions";
import { SearchInput } from "../components/SearchInput";
import { INBOX_STRINGS } from "../i18n/pt-BR";

interface IRelatedEntities {
  customers: Map<ID, ICustomer>;
  leads: Map<ID, ILead>;
  lastMessages: Map<ID, IMessage>;
}

const EMPTY_RELATED: IRelatedEntities = {
  customers: new Map(),
  leads: new Map(),
  lastMessages: new Map(),
};

function useRelatedEntities(conversations: IConversation[]): IRelatedEntities {
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();
  const messagesProvider = useMessagesProvider();
  const [related, setRelated] = useState<IRelatedEntities>(EMPTY_RELATED);
  const idsKey = useMemo(() => conversations.map((c) => c.id).join(","), [conversations]);
  useEffect(() => {
    if (conversations.length === 0) {
      setRelated(EMPTY_RELATED);
      return;
    }
    let cancelled = false;
    const customerIds = Array.from(
      new Set(conversations.map((c) => c.customerId).filter((id): id is ID => Boolean(id))),
    );
    const leadIds = Array.from(
      new Set(conversations.map((c) => c.leadId).filter((id): id is ID => Boolean(id))),
    );

    const customers = new Map<ID, ICustomer>();
    const leads = new Map<ID, ILead>();
    const lastMessages = new Map<ID, IMessage>();

    Promise.all([
      Promise.all(
        customerIds.map((id) =>
          customersProvider
            .get(id)
            .then((c) => customers.set(id, c))
            .catch(() => undefined),
        ),
      ),
      Promise.all(
        leadIds.map((id) =>
          leadsProvider
            .get(id)
            .then((l) => leads.set(id, l))
            .catch(() => undefined),
        ),
      ),
      Promise.all(
        conversations.map((c) =>
          messagesProvider
            .list({ conversationId: c.id, page: 1, pageSize: 1, orderDir: "desc" })
            .then((res) => {
              if (res.data[0]) lastMessages.set(c.id, res.data[0]);
            })
            .catch(() => undefined),
        ),
      ),
    ]).then(() => {
      if (cancelled) return;
      setRelated({ customers, leads, lastMessages });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return related;
}

function useAvailableTags(): string[] {
  const customersProvider = useCustomersProvider();
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void customersProvider
      .list({ pageSize: 500 })
      .then((res) => {
        if (cancelled) return;
        const set = new Set<string>();
        res.data.forEach((c) => c.tags.forEach((t) => set.add(t)));
        setTags(Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR")));
      })
      .catch(() => {
        if (!cancelled) setTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, [customersProvider]);
  return tags;
}

export function InboxPage() {
  const { currentUser } = useAuth();
  const userId: ID | null = currentUser?.id ?? null;
  // Conversations are assigned by seller_id, which is distinct from the auth/user
  // id in BOTH backends (Supabase: user id = auth_user_id vs profiles.seller_id;
  // mock: profile.id vs profile.sellerId). Use the seller id for the "me" filter
  // so it matches conversation.assignedSellerId. `userId` stays for unread tracking.
  const sellerId: ID | null = currentUser?.sellerId ?? null;
  const navigate = useNavigate();

  const selectedId = (useParams({ strict: false }) as { id?: ID }).id ?? null;

  const {
    filters,
    setStatus,
    setChannel,
    setAssignment,
    setTags,
    setPeriod,
    setSearch,
    setSort,
    setEscalated,
    reset,
    activeCount,
  } = useInboxFilters(sellerId);

  const availableTags = useAvailableTags();
  const realtime = useRealtimeConversations();

  const listParams = useMemo(
    () => filtersToListParams(filters, { currentSellerId: sellerId }),
    [filters, sellerId],
  );
  const {
    items: rawItems,
    total,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refetch,
    markItemRead,
  } = useConversationsList(listParams, { refreshKey: realtime.tick });
  const conversationsProvider = useConversationsProvider();

  const escalationsByConversation = useEscalationsByConversation();
  const items = useMemo(() => {
    if (!filters.escalated) return rawItems;
    return rawItems.filter((c) => escalationsByConversation.has(c.id));
  }, [rawItems, escalationsByConversation, filters.escalated]);
  const related = useRelatedEntities(items);
  const { isUnread, markViewed } = useUnreadTracking(userId);
  const { lastId, setLastId } = useLastSelectedConversation();

  // Reopen last conversation when the user lands on /app/atendimento with no
  // id and a previous selection exists. Preserve current search params so the
  // active filters survive the auto-navigation.
  useEffect(() => {
    if (selectedId !== null) return;
    if (!lastId) return;
    if (!items.find((c) => c.id === lastId)) return;
    void navigate({
      to: "/app/atendimento/$id",
      params: { id: lastId },
      search: (prev) => prev,
    });
  }, [selectedId, lastId, items, navigate]);

  // Track the selected one for next session.
  useEffect(() => {
    if (selectedId) {
      setLastId(selectedId);
      markViewed(selectedId);
    }
  }, [selectedId, setLastId, markViewed]);

  // Zero the unread counter (the numeric red badge) when a conversation with
  // unread messages is opened. `markViewed` above only drives the bold row
  // (localStorage); the badge reads conversation.unreadCount — a materialized
  // column reset only via the provider. We clear it optimistically so the badge
  // disappears instantly, then persist with markRead (best-effort; this also
  // syncs the count across devices). Idempotent: zeroing the local count makes
  // this effect re-run and exit early, and markRead is a no-op when already 0.
  // A fresh inbound bumps the count again, so badges still reappear for new
  // messages — including while the conversation stays open.
  useEffect(() => {
    if (!selectedId) return;
    const conv = rawItems.find((c) => c.id === selectedId);
    if (!conv || conv.unreadCount <= 0) return;
    markItemRead(selectedId);
    void conversationsProvider.markRead(selectedId).catch(() => {
      // Best-effort: a failed reset is re-resolved on the next list refetch;
      // reopening the conversation retries.
    });
  }, [selectedId, rawItems, markItemRead, conversationsProvider]);

  // Infinite scroll sentinel.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { rootMargin: "120px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  // Keyboard navigation across the list.
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (e.key === "/" && !isEditable) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (isEditable) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const idx = items.findIndex((c) => c.id === selectedId);
        if (idx === -1 && items[0]) {
          e.preventDefault();
          void navigate({
            to: "/app/atendimento/$id",
            params: { id: items[0].id },
            search: (prev) => prev,
          });
          return;
        }
        const next =
          e.key === "ArrowDown" ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
        const target = items[next];
        if (target && target.id !== selectedId) {
          e.preventDefault();
          void navigate({
            to: "/app/atendimento/$id",
            params: { id: target.id },
            search: (prev) => prev,
          });
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [items, selectedId, navigate]);

  const unreadGlobal = useMemo(
    () => items.reduce((acc, c) => acc + (isUnread(c) ? c.unreadCount || 1 : 0), 0),
    [items, isUnread],
  );

  const sortDescription = INBOX_STRINGS.sortOptions[filters.sort];

  const handleSelect = useCallback(
    (id: ID) => {
      setLastId(id);
      markViewed(id);
    },
    [setLastId, markViewed],
  );

  const handleClearFilters = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col bg-card">
        <InboxHeader
          totalLabel={INBOX_STRINGS.totalLabel(total)}
          unreadGlobal={unreadGlobal}
          realtimeEnabled={realtime.enabled}
          onToggleRealtime={realtime.setEnabled}
          realtimeConnected={realtime.connected}
          sortDescription={sortDescription}
        />
        <div className="border-b border-border px-3 py-2">
          <SearchInput inputRef={searchInputRef} value={filters.search} onChange={setSearch} />
        </div>
        <InboxFilters
          state={filters}
          availableTags={availableTags}
          onStatus={setStatus}
          onChannel={setChannel}
          onAssignment={setAssignment}
          onTags={setTags}
          onPeriod={setPeriod}
          onSort={setSort}
          onEscalated={setEscalated}
          onClear={reset}
          activeCount={activeCount}
        />

        <div
          ref={listContainerRef}
          className="min-h-0 flex-1 overflow-y-auto"
          role="listbox"
          aria-label={INBOX_STRINGS.ariaList}
          tabIndex={-1}
        >
          {error && (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <Icon icon="mdi:alert-circle-outline" size={32} className="text-destructive" />
              <p className="text-sm font-medium text-foreground">{INBOX_STRINGS.error.title}</p>
              <p className="text-xs text-muted-foreground">{INBOX_STRINGS.error.description}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={refetch}>
                {INBOX_STRINGS.error.retry}
              </Button>
            </div>
          )}

          {!error && isLoading && items.length === 0 && (
            <div className="flex items-center justify-center px-6 py-10 text-xs text-muted-foreground">
              <Icon icon="mdi:loading" className="mr-2 animate-spin" size={14} />
              {INBOX_STRINGS.loadingMore}
            </div>
          )}

          {!error && !isLoading && items.length === 0 && (
            <InboxEmptyState
              hasFilters={activeCount > 0}
              searchTerm={filters.search}
              onClearFilters={handleClearFilters}
            />
          )}

          {!error &&
            items.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                customer={
                  conversation.customerId
                    ? (related.customers.get(conversation.customerId) ?? null)
                    : null
                }
                lead={conversation.leadId ? (related.leads.get(conversation.leadId) ?? null) : null}
                lastMessage={related.lastMessages.get(conversation.id) ?? null}
                isSelected={conversation.id === selectedId}
                isUnread={isUnread(conversation)}
                highlightTerm={filters.search}
                onSelect={() => handleSelect(conversation.id)}
                trailing={<QuickActions conversation={conversation} onMutated={refetch} />}
                escalation={escalationsByConversation.get(conversation.id) ?? null}
              />
            ))}

          {hasMore && (
            <div
              ref={sentinelRef}
              className="flex items-center justify-center py-4 text-xs text-muted-foreground"
              aria-label={INBOX_STRINGS.ariaLoadMore}
            >
              {isLoadingMore && (
                <>
                  <Icon icon="mdi:loading" className="mr-2 animate-spin" size={14} />
                  {INBOX_STRINGS.loadingMore}
                </>
              )}
            </div>
          )}

          {!hasMore && items.length > 0 && (
            <div className="py-3 text-center text-[11px] text-muted-foreground">
              {INBOX_STRINGS.endOfList}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

export function InboxCenterPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon icon="mdi:message-text-outline" size={28} />
      </div>
      <p className="text-sm font-medium text-foreground">
        {INBOX_STRINGS.selectAConversation.title}
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {INBOX_STRINGS.selectAConversation.description}
      </p>
    </div>
  );
}
