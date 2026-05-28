import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { IPart } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useCartStore } from "@/features/storefront/store/cartStore";
import { formatBRL } from "@/shared/utils/format";
import { STOREFRONT_PRODUCT_STRINGS as S } from "../i18n/pt-BR";

export interface IStickyMobileBarProps {
  part: IPart;
}

const SEE_CART_DURATION_MS = 3500;

/**
 * Mobile-only sticky bottom bar with price + add-to-cart (PRD-063 RF-031).
 *
 * Hidden on `lg` viewports because the full `ProductInfo` block is visible
 * there. Mirrors the cart flow from `ProductInfo` to keep the affordance
 * consistent regardless of which CTA the user taps.
 */
export function StickyMobileBar({ part }: IStickyMobileBarProps) {
  const addItem = useCartStore((s) => s.addItem);
  const [showSeeCart, setShowSeeCart] = useState(false);
  const outOfStock = part.stockAvailable <= 0;
  const oem = part.oemCodes?.[0];

  useEffect(() => {
    if (!showSeeCart) return undefined;
    const timer = window.setTimeout(() => setShowSeeCart(false), SEE_CART_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [showSeeCart]);

  const handleAdd = () => {
    if (outOfStock) return;
    addItem({
      partId: part.id,
      partName: part.name,
      partSku: part.sku,
      partOemCode: oem,
      unitPrice: part.unitPrice,
      quantity: 1,
      imageUrl: part.imageUrl,
    });
    toast.success(S.toastAdded(1));
    setShowSeeCart(true);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-1 text-xs text-muted-foreground">{part.name}</p>
          <p className="text-base font-semibold text-primary">{formatBRL(part.unitPrice)}</p>
        </div>
        {outOfStock ? (
          <Button size="sm" disabled>
            <Icon icon="mdi:close-circle" size={14} className="mr-1" aria-hidden />
            {S.stockOut}
          </Button>
        ) : showSeeCart ? (
          <Button asChild size="sm">
            <Link to="/loja/carrinho">
              <Icon icon="mdi:cart-check" size={14} className="mr-1" aria-hidden />
              {S.ctaSeeCart}
            </Link>
          </Button>
        ) : (
          <Button size="sm" onClick={handleAdd}>
            <Icon icon="mdi:cart-plus" size={14} className="mr-1" aria-hidden />
            {S.ctaAddToCart}
          </Button>
        )}
      </div>
    </div>
  );
}
