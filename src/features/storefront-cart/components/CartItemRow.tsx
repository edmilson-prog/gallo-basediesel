import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ICartItem } from "@/features/storefront/store/cartStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { PartImage } from "@/features/catalog";
import { useStorefrontProvider } from "@/providers/data";
import { useCartStore } from "@/features/storefront/store/cartStore";
import { formatBRL } from "@/shared/utils/format";
import { STOREFRONT_CART_STRINGS as S } from "../i18n/pt-BR";

export interface ICartItemRowProps {
  item: ICartItem;
}

const STALE_MS = 5 * 60 * 1000;

/**
 * Single row of the cart page (PRD-064 RF-007).
 *
 * Hydrates a thumbnail + category metadata from the live catalog so the row
 * looks current even when the snapshot stored in the cart is missing the
 * `imageUrl`. Quantity edits flow through the Zustand store and are clamped
 * by `useCartValidation` (running one level up on `CartPage`).
 */
export function CartItemRow({ item }: ICartItemRowProps) {
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const storefrontProvider = useStorefrontProvider();

  const partQuery = useQuery({
    queryKey: ["storefront-cart", "part", item.partId] as const,
    queryFn: () => storefrontProvider.getPart(item.partId),
    staleTime: STALE_MS,
    retry: false,
  });

  const live = partQuery.data;
  const stockCap = useMemo(() => {
    if (!live) return Math.max(1, item.quantity + 5);
    return Math.max(1, live.stockAvailable);
  }, [live, item.quantity]);

  const clamp = (raw: number): number => {
    if (!Number.isFinite(raw)) return 1;
    return Math.max(1, Math.min(stockCap, Math.floor(raw)));
  };

  const handleQuantity = (next: number) => setQuantity(item.partId, clamp(next));
  const handleRemove = () => {
    removeItem(item.partId);
    toast.success(S.cartItemRemoved);
  };

  const lineTotal = item.unitPrice * item.quantity;

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
      <Link
        to="/loja/produto/$slug"
        params={{ slug: item.partId }}
        className="shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={item.partName}
      >
        <PartImage
          part={{
            category: live?.category,
            imageUrl: item.imageUrl ?? live?.imageUrl,
            name: item.partName,
          }}
          size="md"
          className="!h-24 !w-24 !rounded-lg"
        />
      </Link>

      <div className="min-w-0 flex-1 space-y-1.5">
        <Link
          to="/loja/produto/$slug"
          params={{ slug: item.partId }}
          className="block text-sm font-semibold leading-snug text-foreground hover:text-primary sm:text-base"
        >
          {item.partName}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {item.partOemCode && (
            <span>
              Cód. OEM <span className="font-mono text-foreground">{item.partOemCode}</span>
            </span>
          )}
          <span>
            SKU <span className="font-mono text-foreground">{item.partSku}</span>
          </span>
          {live && live.stockAvailable <= 0 && (
            <Badge
              variant="outline"
              className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
            >
              Sem estoque
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {S.cartUnitPrice}: <span className="text-foreground">{formatBRL(item.unitPrice)}</span>
        </p>
        <Button
          variant="link"
          size="sm"
          onClick={handleRemove}
          className="h-auto px-0 text-xs text-destructive hover:text-destructive"
        >
          <Icon icon="mdi:trash-can-outline" size={14} className="mr-1" aria-hidden />
          {S.cartRemove}
        </Button>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="inline-flex items-center rounded-md border border-border bg-background">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Diminuir quantidade"
            onClick={() => handleQuantity(item.quantity - 1)}
            disabled={item.quantity <= 1}
            className="h-9 w-9 rounded-none rounded-l-md"
          >
            <Icon icon="mdi:minus" size={16} />
          </Button>
          <Input
            type="number"
            min={1}
            max={stockCap}
            value={item.quantity}
            onChange={(e) => handleQuantity(Number(e.target.value))}
            className="h-9 w-14 rounded-none border-0 border-x border-border text-center [appearance:textfield] focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label={S.cartQuantityAria}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Aumentar quantidade"
            onClick={() => handleQuantity(item.quantity + 1)}
            disabled={live ? item.quantity >= live.stockAvailable : false}
            className="h-9 w-9 rounded-none rounded-r-md"
          >
            <Icon icon="mdi:plus" size={16} />
          </Button>
        </div>
        <p className="text-sm font-semibold text-primary">{formatBRL(lineTotal)}</p>
      </div>
    </Card>
  );
}
