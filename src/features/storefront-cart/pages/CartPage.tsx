import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useCartStore, selectCartSubtotal } from "@/features/storefront/store/cartStore";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { formatBRL } from "@/shared/utils/format";
import { CartItemRow } from "../components/CartItemRow";
import { CartEmpty } from "../components/CartEmpty";
import { CartSummary } from "../components/CartSummary";
import { useCartShipping } from "../hooks/useCartShipping";
import { useCartValidation } from "../hooks/useCartValidation";
import { STOREFRONT_CART_STRINGS as S } from "../i18n/pt-BR";

/**
 * `/loja/carrinho` — public cart page (PRD-064 RF-006/007/009/011).
 *
 * Two-column layout on desktop with a sticky summary; stacks vertically on
 * mobile with a fixed bottom CTA so the user always knows how to finish the
 * purchase. Items are hydrated against the live catalog by `useCartValidation`
 * which surfaces toasts when stock changes.
 */
export function CartPage() {
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectCartSubtotal);
  const shipping = useCartShipping();

  useCartValidation();

  useSeoMeta({
    title: items.length > 0 ? `Carrinho (${items.length}) · GALLO PARTS` : "Carrinho · GALLO PARTS",
    description: "Revise os itens, calcule o frete e finalize seu pedido na GALLO PARTS.",
  });

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:py-14">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {S.cartTitle}
        </h1>
        <CartEmpty />
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 pb-40 sm:py-10 lg:pb-10">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {S.cartTitle}
            </h1>
            <p className="text-sm text-muted-foreground">{S.cartItemsHeading(items.length)}</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/loja">
              <Icon icon="mdi:arrow-left" size={14} className="mr-1" aria-hidden />
              {S.cartContinueShopping}
            </Link>
          </Button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.partId}>
                <CartItemRow item={item} />
              </li>
            ))}
          </ul>
          <div>
            <CartSummary subtotal={subtotal} shipping={shipping} />
          </div>
        </div>
      </div>

      {/* Sticky bottom CTA on mobile — mirrors the desktop summary action */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{S.summaryTotal}</p>
            <p className="text-base font-semibold text-primary">
              {formatBRL(subtotal + (shipping.hasValue ? shipping.value : 0))}
            </p>
          </div>
          <Button asChild size="sm" disabled={subtotal <= 0}>
            <Link to="/loja/checkout">
              <Icon icon="mdi:credit-card-check-outline" size={14} className="mr-1" aria-hidden />
              {S.summaryCheckoutCta}
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
