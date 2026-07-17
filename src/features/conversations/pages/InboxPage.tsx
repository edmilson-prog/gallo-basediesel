import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { ID, ISeller, IWhatsAppAccount } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { useConversationsProvider, useSellersProvider } from "@/providers/data";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEscalationsByConversation } from "@/features/sdr-escalation";
import { useConversationsList } from "../hooks/useConversationsList";
import { useConversationTags } from "../hooks/useConversationTags";
import { useRelatedEntities } from "../hooks/useRelatedEntities";
import { useInboxFilters, filtersToListParams } from "../hooks/useInboxFilters";
import { useRealtimeConversations } from "../hooks/useRealtimeConversations";
import { useLastSelectedConversation } from "../hooks/useLastSelectedConversation";
import { useUnreadTracking } from "../hooks/useUnreadTracking";
import { ConversationListItem } from "../components/ConversationListItem";
import { InboxFilters } from "../components/InboxFilters";
import { InboxHeader } from "../components/InboxHeader";
import { InboxEmptyState } from "../components/InboxEmptyState";
import { MessageSearchBanner } from "../components/MessageSearchBanner";
import { QuickActions } from "../components/QuickActions";
import { SearchInput } from "../components/SearchInput";
import { NewConversationDialog } from "../components/NewConversationDialog";
import { useAccessibleConnectedAccounts } from "../hooks/useAccessibleConnectedAccounts";
import { INBOX_STRINGS } from "../i18n/pt-BR";
import { InboxStatusSummaryCard } from "@/features/service-volume";

export function InboxPage() {
  const { currentUser } = useAuth();
  const userId: ID | null = currentUser?.id ?? null;
  // Conversations are assigned by seller_id, which is distinct from the auth/user
  // id in BOTH backends (Supabase: user id = auth_user_id vs profiles.seller_id;
  // mock: profile.id vs profile.sellerId). Use the seller id for the "me" filter
  // so it matches conversation.assignedSellerId. `userId` stays for unread tracking.
  const sellerId: ID | null = currentUser?.sellerId ?? null;
  const navigate = useNavigate();
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const [newConvOpen, setNewConvOpen] = useState(false);
  // Staff (Owner/Gestor) see store-wide conversations, hence every instance of the
  // currently selected store. Non-staff are scoped to the instances they operate
  // (PRD-011 multi-access) — see useAccessibleConnectedAccounts for the full rule.
  const { accounts, accessibleIds, accessibleAccounts, accessibleConnectedAccounts, isStaffView } =
    useAccessibleConnectedAccounts(storeId);
  const accountsById = useMemo(() => {
    const map = new Map<ID, IWhatsAppAccount>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);
  const showOrigin = accounts.length > 1;

  const selectedId = (useParams({ strict: false }) as { id?: ID }).id ?? null;

  const {
    filters,
    setStatus,
    setChannel,
    setAssignment,
    setInstance,
    setTags,
    setPeriod,
    setSearch,
    setSort,
    setEscalated,
    reset,
    activeCount,
  } = useInboxFilters(sellerId);

  // Assignee oversight: staff (Owner/Gestor) see store-wide conversations and
  // need to know who is handling each. During an active search EVERY role sees
  // the chip (results may surface other sellers' conversations — owner decision,
  // 2026-07-16 spec); sellers RLS is store-scoped, so non-staff can resolve
  // names. Outside search, non-staff never load the roster (chip hidden).
  const searchActive = filters.search.length > 0;
  const showAssignee = isStaffView || searchActive;
  const sellersProvider = useSellersProvider();
  const [sellersById, setSellersById] = useState<Map<ID, ISeller>>(new Map());
  useEffect(() => {
    if (!showAssignee) {
      setSellersById(new Map());
      return;
    }
    let cancelled = false;
    void sellersProvider
      .list({ storeId })
      .then((list) => {
        if (cancelled) return;
        const map = new Map<ID, ISeller>();
        for (const s of list) map.set(s.id, s);
        setSellersById(map);
      })
      .catch(() => {
        if (!cancelled) setSellersById(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [sellersProvider, storeId, showAssignee]);

  // Self-heal a stale instance filter: a non-staff user may carry a persisted
  // `?instance=<id>` (e.g. selected before their access narrowed) pointing at an
  // instance they can no longer access. Without this, `filtersToListParams` would
  // keep filtering the list by a hidden instance the dropdown no longer offers.
  // Reset to "all" once the accessible set has resolved (staff are never scoped).
  useEffect(() => {
    if (isStaffView || accessibleIds === null) return;
    if (filters.instance !== "all" && !accessibleIds.has(filters.instance)) {
      setInstance("all");
    }
    // setInstance is a stable navigate-based setter; omit it to avoid re-running every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaffView, accessibleIds, filters.instance]);

  const { tags: tagCatalog } = useConversationTags();
  // Active tags + archived ones still selected in the URL (so saved links keep
  // rendering a removable filter). Spec simplification v1: archived tags with
  // remaining usage are NOT offered unless already selected.
  const availableTags = useMemo(() => {
    const selected = new Set(filters.tags);
    return tagCatalog.filter((t) => !t.archived || selected.has(t.id));
  }, [tagCatalog, filters.tags]);
  const realtime = useRealtimeConversations();

  // Opção D: dedicated "search inside messages" mode — a transient UI action,
  // not a durable filter, so it lives as local state (never in the URL/
  // localStorage-persisted filters).
  const [messageSearchActive, setMessageSearchActive] = useState(false);
  const exitMessageSearch = useCallback(() => setMessageSearchActive(false), []);
  useEffect(() => {
    if (filters.search.trim().length === 0) setMessageSearchActive(false);
  }, [filters.search]);

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
    loadMoreFailed,
    error,
    loadMore,
    refetch,
    markItemRead,
  } = useConversationsList(listParams, {
    refreshKey: realtime.tick,
    mode: messageSearchActive ? "messages" : "list",
  });
  const conversationsProvider = useConversationsProvider();

  const escalationsByConversation = useEscalationsByConversation();
  const items = useMemo(() => {
    // Escalated is a client-side post-filter; search mode ignores it like every
    // other filter (global search — see filtersToListParams).
    if (!filters.escalated || searchActive) return rawItems;
    return rawItems.filter((c) => escalationsByConversation.has(c.id));
  }, [rawItems, escalationsByConversation, filters.escalated, searchActive]);
  const related = useRelatedEntities(items, { skipLastMessages: messageSearchActive });
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

  // Header-only unread total for the CURRENT filtered view. This is NOT the
  // global "unread mine" badge — that is owned end-to-end by
  // useInboxActivityMonitor (turned ON by inbound, OFF by markRead). Feeding a
  // filter-scoped count into the global badge would silence it whenever a
  // search/tag/assignment filter excluded the seller's real unread threads.
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
          totalLabel={String(total)}
          unreadGlobal={unreadGlobal}
          realtimeEnabled={realtime.enabled}
          onToggleRealtime={realtime.setEnabled}
          realtimeConnected={realtime.connected}
          sortDescription={sortDescription}
          onNewConversation={
            // Non-staff: wait for the accessible set to resolve so the dialog
            // never shows a false "no instances" state during the RPC window.
            sellerId && (isStaffView || accessibleIds !== null)
              ? () => setNewConvOpen(true)
              : undefined
          }
        />
        <InboxStatusSummaryCard />
        <div className="border-b border-border px-3 py-2">
          <SearchInput
            inputRef={searchInputRef}
            value={filters.search}
            onChange={setSearch}
            onSearchMessages={() => setMessageSearchActive(true)}
            messageSearchActive={messageSearchActive}
          />
        </div>
        {messageSearchActive && (
          <MessageSearchBanner term={filters.search} onBack={exitMessageSearch} />
        )}
        <InboxFilters
          state={filters}
          availableTags={availableTags}
          instances={accessibleAccounts}
          onStatus={setStatus}
          onChannel={setChannel}
          onAssignment={setAssignment}
          onInstance={setInstance}
          onTags={setTags}
          onPeriod={setPeriod}
          onSort={setSort}
          onEscalated={setEscalated}
          onClear={reset}
          activeCount={activeCount}
        />

        <div
          data-tour="inbox-list"
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
              messageSearchActive={messageSearchActive}
            />
          )}

          {!error &&
            items.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                contact={related.contacts.get(conversation.id) ?? null}
                lastMessage={related.lastMessages.get(conversation.id) ?? null}
                isSelected={conversation.id === selectedId}
                isUnread={isUnread(conversation)}
                highlightTerm={filters.search}
                onSelect={() => handleSelect(conversation.id)}
                trailing={<QuickActions conversation={conversation} onMutated={refetch} />}
                escalation={escalationsByConversation.get(conversation.id) ?? null}
                originAccount={
                  conversation.whatsappAccountId
                    ? (accountsById.get(conversation.whatsappAccountId) ?? null)
                    : null
                }
                showOrigin={showOrigin}
                assignedSeller={
                  conversation.assignedSellerId
                    ? (sellersById.get(conversation.assignedSellerId) ?? null)
                    : null
                }
                showAssignee={showAssignee}
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

          {!error && loadMoreFailed && (
            <div className="flex flex-col items-center justify-center gap-2 py-4 text-center text-xs text-muted-foreground">
              <span>{INBOX_STRINGS.loadMoreError}</span>
              <Button size="sm" variant="outline" onClick={loadMore}>
                {INBOX_STRINGS.error.retry}
              </Button>
            </div>
          )}

          {!error && !loadMoreFailed && !hasMore && items.length > 0 && (
            <div className="py-3 text-center text-[11px] text-muted-foreground">
              {INBOX_STRINGS.endOfList}
            </div>
          )}
        </div>
      </div>
      {newConvOpen && sellerId && (
        <NewConversationDialog
          storeId={storeId}
          sellerId={sellerId}
          accounts={accessibleConnectedAccounts}
          onClose={() => setNewConvOpen(false)}
          onCreated={(conversationId) => {
            setNewConvOpen(false);
            refetch();
            void navigate({
              to: "/app/atendimento/$id",
              params: { id: conversationId },
              search: (prev) => prev,
            });
          }}
        />
      )}
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
