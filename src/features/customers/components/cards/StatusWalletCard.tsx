import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StoreBadge } from "@/features/multistore/components/StoreBadge";
import { NewPermanentIndividualTransferModal } from "@/features/carteira/components/NewPermanentIndividualTransferModal";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useStoresProvider } from "@/providers/data/hooks/useStoresProvider";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useAuth } from "@/features/auth/useAuth";
import { hashHue, initialsFrom, avatarColors } from "@/shared/utils/avatar";
import { formatDateBR } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { STATUS_BADGE_CLASSES } from "../../utils/customerDisplay";
import { resolveFirstPurchaseAt, resolveLastPurchaseAt } from "../../utils/dintecStats";
import { DintecSourceBadge } from "../DintecSourceBadge";

const COPY = CUSTOMER_STRINGS.overview.statusWallet;

export interface IStatusWalletCardProps {
  customer: ICustomer;
}

/** Status, vendedor responsável, loja vinculada, e datas de primeira/última compra. */
export function StatusWalletCard({ customer }: IStatusWalletCardProps) {
  const sellersProvider = useSellersProvider();
  const storesProvider = useStoresProvider();
  const { currentUser } = useAuth();
  const canTransfer = usePermission("transfer", "create");
  const [transferOpen, setTransferOpen] = useState(false);

  const sellerQuery = useQuery({
    queryKey: ["seller", customer.sellerId] as const,
    staleTime: 5 * 60 * 1000,
    // Imported pending_review anchors have no wallet owner (seller_id null) —
    // skip the lookup and render the "—" placeholder below.
    enabled: customer.sellerId !== null,
    queryFn: () =>
      customer.sellerId ? sellersProvider.get(customer.sellerId).catch(() => null) : null,
  });

  const sellersListQuery = useQuery({
    queryKey: ["customer-profile-sellers", customer.storeId],
    queryFn: () => sellersProvider.list({ storeId: customer.storeId }),
    staleTime: 60_000,
    enabled: transferOpen,
  });

  const storeQuery = useQuery({
    queryKey: ["store", customer.storeId] as const,
    staleTime: 30 * 60 * 1000,
    queryFn: () => storesProvider.get(customer.storeId).catch(() => null),
  });

  const seller = sellerQuery.data;
  const store = storeQuery.data;
  const firstPurchase = resolveFirstPurchaseAt(customer);
  const lastPurchase = resolveLastPurchaseAt(customer);
  const sellerHue = hashHue(customer.sellerId ?? "");
  const sellerColors = avatarColors(sellerHue);

  return (
    <>
      <section className="rounded-lg border border-border bg-background p-3">
        <header className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon icon="mdi:account-group-outline" size={14} />
          {COPY.title}
        </header>

        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{COPY.lifecycle}</span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                STATUS_BADGE_CLASSES[customer.status],
              )}
            >
              {CUSTOMER_STRINGS.lifecycle[customer.status]}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <span className="text-muted-foreground">{COPY.seller}</span>
            <div className="flex items-center gap-2">
              {sellerQuery.isLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : seller ? (
                <>
                  <Avatar className="h-6 w-6 text-[10px]">
                    <AvatarFallback
                      style={{ backgroundColor: sellerColors.bg, color: sellerColors.fg }}
                      aria-hidden
                    >
                      {initialsFrom(seller.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-foreground">{seller.fullName}</span>
                </>
              ) : (
                <span className="italic text-muted-foreground">—</span>
              )}
              {canTransfer && customer.sellerId !== null && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={COPY.transferWallet}
                  onClick={() => setTransferOpen(true)}
                  className="h-6 w-6"
                >
                  <Icon icon="mdi:swap-horizontal" size={14} />
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-muted-foreground">{COPY.store}</span>
            {storeQuery.isLoading ? (
              <Skeleton className="h-5 w-20" />
            ) : store ? (
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{store.name}</span>
                <StoreBadge store={store} />
              </div>
            ) : (
              <span className="italic text-muted-foreground">—</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
            <div>
              <p className="text-muted-foreground">{COPY.firstPurchase}</p>
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                {firstPurchase ? formatDateBR(firstPurchase.value) : COPY.noPurchase}
                {firstPurchase?.fromDintec && <DintecSourceBadge />}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{COPY.lastPurchase}</p>
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                {lastPurchase ? formatDateBR(lastPurchase.value) : COPY.noPurchase}
                {lastPurchase?.fromDintec && <DintecSourceBadge />}
              </p>
            </div>
          </div>
        </div>
      </section>

      <NewPermanentIndividualTransferModal
        open={transferOpen}
        customer={transferOpen ? customer : null}
        sellers={sellersListQuery.data ?? []}
        currentSellerId={currentUser?.sellerId}
        onClose={() => setTransferOpen(false)}
        onCreated={() => setTransferOpen(false)}
      />
    </>
  );
}
