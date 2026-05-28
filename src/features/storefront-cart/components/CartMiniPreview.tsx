import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { PartImage } from "@/features/catalog";
import { useCartStore } from "@/features/storefront/store/cartStore";
import { formatBRL } from "@/shared/utils/format";
import { STOREFRONT_CART_STRINGS as S } from "../i18n/pt-BR";

export interface ICartMiniPreviewProps {
  onClose?: () => void;
}

const PREVIEW_LIMIT = 3;

/**
 * Inline mini-preview rendered inside the storefront-header cart popover
 * (PRD-064 RF-013). Lists the last three items added to the cart and a
 * subtotal so the user can decide between continuing to shop or jumping
 * straight to the cart page.
 */
export function CartMiniPreview({ onClose }: ICartMiniPreviewProps) {
  const items = useCartStore((s) => s.items);

  if (items.length === 0) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">{S.miniPreviewEmpty}</p>
        <Button asChild size="sm" variant="outline" className="w-full" onClick={onClose}>
          <Link to="/loja">
            <Icon icon="mdi:storefront-outline" size={14} className="mr-1" aria-hidden />
            {S.miniPreviewExploreCta}
          </Link>
        </Button>
      </div>
    );
  }

  // Sort by addedAt desc so most recent shows on top; fall back to insertion order.
  const sorted = [...items].sort((a, b) =>
    a.addedAt && b.addedAt ? (a.addedAt < b.addedAt ? 1 : -1) : 0,
  );
  const preview = sorted.slice(0, PREVIEW_LIMIT);
  const remaining = items.length - preview.length;
  const subtotal = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  return (
    <div className="flex max-h-[24rem] flex-col">
      <header className="border-b border-border p-3">
        <p className="text-sm font-semibold text-foreground">{S.miniPreviewTitle}</p>
      </header>
      <ul className="flex-1 divide-y divide-border overflow-y-auto">
        {preview.map((item) => (
          <li key={item.partId} className="flex items-start gap-3 p-3">
            <PartImage
              part={{ category: undefined, imageUrl: item.imageUrl, name: item.partName }}
              size="sm"
              className="!h-12 !w-12 !rounded-md"
            />
            <div className="min-w-0 flex-1">
              <Link
                to="/loja/produto/$slug"
                params={{ slug: item.partId }}
                className="line-clamp-2 text-xs font-medium text-foreground hover:text-primary"
                onClick={onClose}
              >
                {item.partName}
              </Link>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {item.quantity} × {formatBRL(item.unitPrice)}
              </p>
            </div>
            <p className="text-xs font-semibold text-primary">
              {formatBRL(item.unitPrice * item.quantity)}
            </p>
          </li>
        ))}
        {remaining > 0 && (
          <li className="px-3 py-2 text-center text-[11px] text-muted-foreground">
            {S.miniPreviewMoreItems(remaining)}
          </li>
        )}
      </ul>
      <footer className="space-y-2 border-t border-border p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">{S.miniPreviewSubtotal}</span>
          <span className="font-semibold text-primary">{formatBRL(subtotal)}</span>
        </div>
        <Button asChild size="sm" className="w-full" onClick={onClose}>
          <Link to="/loja/carrinho">
            <Icon icon="mdi:cart" size={14} className="mr-1" aria-hidden />
            {S.miniPreviewSeeCart}
          </Link>
        </Button>
      </footer>
    </div>
  );
}
