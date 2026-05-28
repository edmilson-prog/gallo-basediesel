import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { IPart } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { PartImage, StockBadge } from "@/features/catalog";
import { formatBRL } from "@/shared/utils/format";
import { useCartStore } from "@/features/storefront";
import { STOREFRONT_SEARCH_STRINGS as S } from "../i18n/pt-BR";

export interface IProductCardProps {
  part: IPart;
  /** Compact mode used inside dense grids (PRD-062 listing). Defaults to standard. */
  density?: "default" | "compact";
}

/**
 * Reusable product card for the storefront search, listings and home
 * (PRD-061 RF-013/014). Click on the card body navigates to the product
 * detail page (PRD-063 placeholder for now); the cart button is wired to
 * `useCartStore` so the header badge updates immediately.
 */
export function ProductCard({ part, density = "default" }: IProductCardProps) {
  const navigate = useNavigate();
  const addItem = useCartStore((s) => s.addItem);
  const oem = part.oemCodes?.[0];
  const outOfStock = part.stockAvailable <= 0;

  const goToDetail = () => {
    void navigate({ to: "/loja/produto/$slug", params: { slug: part.id } });
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    toast.success(S.addedToCartToast);
  };

  return (
    <Card
      role="article"
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter") goToDetail();
      }}
      className={`group flex h-full cursor-pointer flex-col gap-3 border-border bg-background p-4 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        density === "compact" ? "gap-2 p-3" : ""
      }`}
      aria-label={part.name}
    >
      <div className="relative">
        <PartImage
          part={part}
          size="lg"
          className={density === "compact" ? "h-24 w-full rounded-md" : "h-32 w-full rounded-md"}
        />
        <Badge
          variant="outline"
          className={`absolute right-2 top-2 ${
            part.isOriginal
              ? "border-primary/30 bg-primary/15 text-primary"
              : "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300"
          }`}
        >
          {part.isOriginal ? S.cardOriginalBadge : S.cardEquivalentBadge}
        </Badge>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {part.brand}
        </p>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {part.name}
        </h3>
        {oem && (
          <p className="text-xs text-muted-foreground">
            OEM: <span className="font-mono">{oem}</span>
          </p>
        )}
        <div className="pt-1">
          <StockBadge part={part} variant="compact" />
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-lg font-semibold text-primary">{formatBRL(part.unitPrice)}</p>
        <Button
          size="sm"
          onClick={handleAddToCart}
          disabled={outOfStock}
          aria-label={outOfStock ? S.cardOutOfStock : S.cardAddToCart}
        >
          <Icon icon="mdi:cart-plus" size={14} className="mr-1" aria-hidden />
          {density === "compact" ? "" : S.cardAddToCart}
        </Button>
      </div>
    </Card>
  );
}
