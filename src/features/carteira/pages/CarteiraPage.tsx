import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICarteiraTransfer, ID, ISeller } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { CarteiraHeader } from "../components/CarteiraHeader";
import { SectionHeading } from "../components/SectionHeading";
import { SellerWalletBoard } from "../components/SellerWalletBoard";
import { ActiveCoverageCard } from "../components/ActiveCoverageCard";
import { CoverageEmptyState } from "../components/CoverageEmptyState";
import { RecentChangesTable } from "../components/RecentChangesTable";
import { SellerWalletModal } from "../components/SellerWalletModal";
import { UnassignedCustomersModal } from "../components/UnassignedCustomersModal";
import { TransferHistoryTable } from "../components/TransferHistoryTable";
import { TransferFiltersBar } from "../components/TransferFiltersBar";
import { TransferAuditTab } from "../components/TransferAuditTab";
import { RevertTransferModal } from "../components/RevertTransferModal";
import { NewTemporaryTransferModal } from "../components/NewTemporaryTransferModal";
import { CustomerListModal } from "../components/CustomerListModal";
import { useTransfersList, type ITransfersListFilters } from "../hooks/useTransfersList";
import { useTransferClosureAudit } from "../hooks/useTransferClosureAudit";
import { useWalletStats, type ISellerWalletRow } from "../hooks/useWalletStats";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";

type Tab = "wallet" | "history" | "audit";

const EMPTY_FILTERS: ITransfersListFilters = {};

/** Window the "Mudanças recentes" section covers. */
const RECENT_WINDOW_DAYS = 30;

export function CarteiraPage() {
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const { currentStoreId } = useCurrentStore();
  const canManage = role === "Owner" || role === "Gestor";

  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("wallet");
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  const [coverageOpen, setCoverageOpen] = useState(false);
  const [coveragePreset, setCoveragePreset] = useState<ID | undefined>(undefined);
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const [revertTarget, setRevertTarget] = useState<ICarteiraTransfer | null>(null);
  const [sellerDetail, setSellerDetail] = useState<ISellerWalletRow | null>(null);
  const [customerListIds, setCustomerListIds] = useState<ID[] | null>(null);

  const [historyFilters, setHistoryFilters] = useState<ITransfersListFilters>(EMPTY_FILTERS);
  const [historyPage, setHistoryPage] = useState(1);

  const sellersProvider = useSellersProvider();
  const sellersQuery = useQuery({
    queryKey: ["carteira-sellers", currentStoreId ?? null],
    queryFn: () => sellersProvider.list({ storeId: currentStoreId ?? undefined }),
    staleTime: 60_000,
  });
  const sellers: ISeller[] = useMemo(() => sellersQuery.data ?? [], [sellersQuery.data]);
  const sellersById = useMemo(() => {
    const map = new Map<ID, ISeller>();
    sellers.forEach((s) => map.set(s.id, s));
    return map;
  }, [sellers]);

  const walletStats = useWalletStats(currentStoreId ?? undefined, sellers);

  // Coverages in force — the only thing here that expires on its own.
  const coveragesQuery = useTransfersList({
    storeId: currentStoreId ?? undefined,
    scope: "active",
    filters: useMemo(() => ({ types: ["temporary"] }) as ITransfersListFilters, []),
    pageSize: 50,
  });
  const coverages = useMemo(() => coveragesQuery.data?.data ?? [], [coveragesQuery.data]);

  // Permanent changes in the recent window — done deals, listed for review.
  const recentSince = useMemo(
    () => new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    [],
  );
  const changesFilters = useMemo<ITransfersListFilters>(
    () => ({ types: ["permanent_individual", "permanent_batch"], since: recentSince }),
    [recentSince],
  );
  const changesQuery = useTransfersList({
    storeId: currentStoreId ?? undefined,
    scope: "active",
    filters: changesFilters,
    pageSize: 50,
  });
  const recentChanges = useMemo(() => changesQuery.data?.data ?? [], [changesQuery.data]);

  const coverageByTitular = useMemo(() => {
    const map = new Map<ID, ICarteiraTransfer>();
    coverages.forEach((t) => map.set(t.fromSellerId, t));
    return map;
  }, [coverages]);

  const coveredCustomers = useMemo(
    () => coverages.reduce((sum, t) => sum + t.customerIds.length, 0),
    [coverages],
  );

  const historyQuery = useTransfersList({
    storeId: currentStoreId ?? undefined,
    scope: "history",
    filters: historyFilters,
    page: historyPage,
    pageSize: 20,
  });
  const historyTotal = historyQuery.data?.total ?? 0;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / 20));
  const historyIds = useMemo(
    () => (historyQuery.data?.data ?? []).map((t) => t.id),
    [historyQuery.data],
  );
  const { closureByTransferId } = useTransferClosureAudit(historyIds, currentStoreId ?? undefined);

  const handleHistoryFilterChange = useCallback((patch: Partial<ITransfersListFilters>) => {
    setHistoryFilters((prev) => ({ ...prev, ...patch }));
    setHistoryPage(1);
  }, []);

  const openCoverageModal = useCallback((fromSellerId?: ID) => {
    setCoveragePreset(fromSellerId);
    setCoverageOpen(true);
  }, []);

  /**
   * Permanent transfers need the customer in hand, so this is an honest link
   * out to Clientes rather than a menu item that fires a toast and navigates
   * anyway — which is what the old "Nova transferência" dropdown did for two of
   * its three options.
   */
  const goToCustomers = useCallback(() => {
    toast.info(CARTEIRA_STRINGS.page.transferCustomersHint);
    void navigate({ to: "/app/clientes" });
  }, [navigate]);

  const handleCoverSeller = useCallback(
    (row: ISellerWalletRow) => {
      const existing = coverageByTitular.get(row.sellerId);
      if (existing) {
        setCustomerListIds(existing.customerIds);
        return;
      }
      openCoverageModal(row.sellerId);
    },
    [coverageByTitular, openCoverageModal],
  );

  const isBoardLoading = sellersQuery.isLoading || walletStats.isLoading;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        {/* Fixed header block — the progress line rides its bottom edge. */}
        <div className="relative">
          <CarteiraHeader
            totalCustomers={walletStats.board.total}
            sellerCount={sellers.length}
            coverageCount={coverages.length}
            coveredCustomers={coveredCustomers}
            unassigned={walletStats.board.unassigned}
            isLoading={isBoardLoading}
            canManage={canManage}
            onNewCoverage={() => openCoverageModal()}
            onTransferCustomers={goToCustomers}
          />
          <ScrollProgressBar container={scrollEl} />
        </div>

        <TabsContent
          value="wallet"
          className="m-0 min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 md:px-6"
          ref={setScrollEl}
        >
          <SectionHeading
            title={CARTEIRA_STRINGS.wallet.boardTitle}
            count={CARTEIRA_STRINGS.wallet.boardCount(sellers.length, walletStats.board.total)}
          >
            <SellerWalletBoard
              rows={walletStats.board.rows}
              unassigned={walletStats.board.unassigned}
              coverageByTitular={coverageByTitular}
              sellersById={sellersById}
              isLoading={isBoardLoading}
              isError={walletStats.isError}
              canManage={canManage}
              onOpenSeller={setSellerDetail}
              onCoverSeller={handleCoverSeller}
              onDistributeUnassigned={() => setUnassignedOpen(true)}
            />
          </SectionHeading>

          <SectionHeading
            title={CARTEIRA_STRINGS.coverage.sectionTitle}
            count={coverages.length || null}
            hint={coverages.length ? CARTEIRA_STRINGS.coverage.sectionHint : undefined}
          >
            {coveragesQuery.isLoading ? (
              <Skeleton className="h-28 w-full rounded-xl" />
            ) : coverages.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {coverages.map((t) => (
                  <ActiveCoverageCard
                    key={t.id}
                    transfer={t}
                    sellersById={sellersById}
                    canRevert={canManage}
                    onRevert={setRevertTarget}
                    onViewCustomers={(transfer) => setCustomerListIds(transfer.customerIds)}
                  />
                ))}
              </div>
            ) : (
              <CoverageEmptyState canManage={canManage} onNewCoverage={() => openCoverageModal()} />
            )}
          </SectionHeading>

          <SectionHeading
            title={CARTEIRA_STRINGS.changes.sectionTitle}
            count={CARTEIRA_STRINGS.changes.sectionCount(recentChanges.length)}
            hint={CARTEIRA_STRINGS.changes.sectionHint}
            right={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setTab("history")}
              >
                {CARTEIRA_STRINGS.changes.seeFullHistory}
                <Icon icon="mdi:arrow-right" size={13} />
              </Button>
            }
          >
            {changesQuery.isLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : recentChanges.length === 0 ? (
              <EmptyState
                icon="mdi:swap-horizontal"
                title={CARTEIRA_STRINGS.changes.emptyTitle}
                description={CARTEIRA_STRINGS.changes.emptyDescription}
              />
            ) : (
              <RecentChangesTable
                transfers={recentChanges}
                sellersById={sellersById}
                canRevert={canManage}
                onRevert={setRevertTarget}
                onViewCustomers={(t) => setCustomerListIds(t.customerIds)}
              />
            )}
          </SectionHeading>
        </TabsContent>

        <TabsContent
          value="history"
          className="m-0 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-6"
        >
          <TransferFiltersBar
            filters={historyFilters}
            sellers={sellers}
            showStatusFilter
            onChange={handleHistoryFilterChange}
            onClear={() => {
              setHistoryFilters(EMPTY_FILTERS);
              setHistoryPage(1);
            }}
          />

          {historyQuery.isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : historyQuery.isError ? (
            <EmptyState
              icon="mdi:alert-circle-outline"
              title="Falha ao carregar histórico"
              description="Tente novamente em instantes."
            />
          ) : (historyQuery.data?.data.length ?? 0) === 0 ? (
            <EmptyState
              icon="mdi:history"
              title={CARTEIRA_STRINGS.history.emptyTitle}
              description={CARTEIRA_STRINGS.history.emptyDescription}
            />
          ) : (
            <TransferHistoryTable
              transfers={historyQuery.data?.data ?? []}
              sellersById={sellersById}
              closureByTransferId={closureByTransferId}
              page={historyPage}
              totalPages={historyTotalPages}
              total={historyTotal}
              onPageChange={setHistoryPage}
            />
          )}
        </TabsContent>

        <TabsContent value="audit" className="m-0 min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
          <TransferAuditTab storeId={currentStoreId ?? undefined} sellersById={sellersById} />
        </TabsContent>
      </Tabs>

      {canManage && currentUser && (
        <NewTemporaryTransferModal
          open={coverageOpen}
          sellers={sellers}
          storeId={currentStoreId ?? "00000000-0000-0000-0000-000000000001"}
          currentSellerId={currentUser.sellerId}
          activeTransfers={coverages}
          presetFromSellerId={coveragePreset}
          onClose={() => setCoverageOpen(false)}
        />
      )}

      {canManage && (
        <UnassignedCustomersModal
          open={unassignedOpen}
          storeId={currentStoreId ?? undefined}
          sellers={sellers}
          onClose={() => setUnassignedOpen(false)}
        />
      )}

      <SellerWalletModal
        row={sellerDetail}
        coveredBy={sellerDetail ? coverageByTitular.get(sellerDetail.sellerId) : undefined}
        sellersById={sellersById}
        recentChanges={recentChanges}
        canManage={canManage}
        onClose={() => setSellerDetail(null)}
        onCover={(row) => {
          setSellerDetail(null);
          openCoverageModal(row.sellerId);
        }}
        onViewCustomers={(row) => {
          setSellerDetail(null);
          // `sellers` is the CSV search param the Clientes list reads.
          void navigate({ to: "/app/clientes", search: { sellers: row.sellerId } });
        }}
        onHandWallet={() => {
          setSellerDetail(null);
          goToCustomers();
        }}
      />

      <CustomerListModal
        open={customerListIds !== null}
        customerIds={customerListIds ?? []}
        onClose={() => setCustomerListIds(null)}
      />

      <RevertTransferModal
        transfer={revertTarget}
        sellersById={sellersById}
        currentSellerId={currentUser?.sellerId}
        onClose={() => setRevertTarget(null)}
      />
    </div>
  );
}
