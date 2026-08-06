import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { IPart } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/Icon";
import { useCartStore } from "@/features/storefront/store/cartStore";
import { useStorefrontSettings } from "@/features/storefront/hooks/useStorefrontSettings";
import { getCategoryLabel } from "@/features/catalog";
import { formatBRL } from "@/shared/utils/format";
import { STOREFRONT_PRODUCT_STRINGS as S } from "../i18n/pt-BR";

export interface IProductInfoProps {
  part: IPart;
  /** When true, render only the metadata block — used by the sticky mobile bar. */
  variant?: "default";
}

const SEE_CART_DURATION_MS = 3500;

/**
 * Commercial header of the product detail page (PRD-063 RF-011/019–RF-026).
 *
 * Owns the qty stepper, the add-to-cart flow with the temporary "Ver
 * carrinho" affordance, the WhatsApp share CTA, and the stock messaging
 * (including the disabled state when `stockAvailable === 0`).
 */
export function ProductInfo({ part }: IProductInfoProps) {
  const addItem = useCartStore((s) => s.addItem);
  const { config } = useStorefrontSettings();
  const [quantity, setQuantity] = useState(1);
  const [showSeeCart, setShowSeeCart] = useState(false);

  const oem = part.oemCodes?.[0];
  const outOfStock = part.stockAvailable <= 0;
  const lowStock = !outOfStock && part.stockAvailable <= part.stockMinimum;
  const categoryLabel = getCategoryLabel(part.category);

  const clampQuantity = (raw: number): number => {
    if (!Number.isFinite(raw)) return 1;
    const min = 1;
    const max = part.stockAvailable > 0 ? part.stockAvailable : 999;
    return Math.max(min, Math.min(max, Math.floor(raw)));
  };

  const handleAdd = () => {
    if (outOfStock) return;
    const qty = clampQuantity(quantity);
    addItem({
      partId: part.id,
      partName: part.name,
      partSku: part.sku,
      partOemCode: oem,
      unitPrice: part.unitPrice,
      quantity: qty,
      imageUrl: part.imageUrl,
    });
    toast.success(S.toastAdded(qty));
    setShowSeeCart(true);
    window.setTimeout(() => setShowSeeCart(false), SEE_CART_DURATION_MS);
  };

  const whatsappRaw = config.footer.whatsapp ?? "";
  const whatsappDigits = whatsappRaw.replace(/\D/g, "");
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = [
    "Confira este produto na GALLO BASE DIESEL:",
    "",
    part.name,
    oem ? `Cód. ${oem} — ${formatBRL(part.unitPrice)}` : formatBRL(part.unitPrice),
    "",
    shareUrl,
  ].join("\n");

  const shareUrlHref = `https://wa.me/${whatsappDigits.length > 0 ? whatsappDigits : ""}?text=${encodeURIComponent(shareText)}`;

  const handleCopyLink = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error(S.toastLinkCopyFailed);
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(S.toastLinkCopied);
    } catch {
      toast.error(S.toastLinkCopyFailed);
    }
  };

  const stockColor = outOfStock
    ? "text-severity-critical"
    : lowStock
      ? "text-severity-warning"
      : "text-severity-success";
  const stockIcon = outOfStock
    ? "mdi:close-circle"
    : lowStock
      ? "mdi:alert-circle"
      : "mdi:check-circle";
  const stockLabel = outOfStock
    ? S.stockOut
    : lowStock
      ? S.stockLow(part.stockAvailable)
      : S.stockInStock;

  return (
    <div className="space-y-5" itemScope itemType="https://schema.org/Product">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge
          variant="outline"
          className={
            part.isOriginal
              ? "border-primary/30 bg-primary/15 text-primary"
              : "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300"
          }
        >
          {part.isOriginal ? S.badgeOriginal : S.badgeEquivalent}
        </Badge>
        {part.category && (
          <Badge variant="outline" className="border-border bg-card">
            {categoryLabel}
          </Badge>
        )}
        {part.subcategory && (
          <Badge variant="outline" className="border-border bg-card capitalize">
            {part.subcategory}
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <h1
          className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl"
          itemProp="name"
        >
          {part.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{S.infoBrandLabel}:</span>{" "}
          <span itemProp="brand">{part.brand}</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {oem && (
            <span className="text-muted-foreground">
              {S.infoOemLabel}:{" "}
              <span className="font-mono text-foreground" itemProp="mpn">
                {oem}
              </span>
            </span>
          )}
          <span className="text-muted-foreground">
            {S.infoSkuLabel}:{" "}
            <span className="font-mono text-foreground" itemProp="sku">
              {part.sku}
            </span>
          </span>
        </div>
      </div>

      <div className="space-y-1" itemProp="offers" itemScope itemType="https://schema.org/Offer">
        <p className="text-3xl font-semibold text-primary sm:text-4xl">
          <span itemProp="price" content={part.unitPrice.toFixed(2)}>
            {formatBRL(part.unitPrice)}
          </span>
          <meta itemProp="priceCurrency" content="BRL" />
        </p>
        <p className={`flex items-center gap-1.5 text-sm font-medium ${stockColor}`}>
          <Icon icon={stockIcon} size={16} aria-hidden />
          {stockLabel}
        </p>
        <link
          itemProp="availability"
          href={outOfStock ? "https://schema.org/OutOfStock" : "https://schema.org/InStock"}
        />
      </div>

      {outOfStock ? (
        <div className="space-y-3 rounded-md border border-severity-critical/30 bg-severity-critical/5 p-4">
          <p className="text-xs text-severity-critical">{S.stockOutHint}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled title={S.notifyMeDisabledHint}>
              <Icon icon="mdi:bell-outline" size={14} className="mr-1" aria-hidden />
              {S.notifyMeCta}
            </Button>
            {whatsappDigits.length > 0 && (
              <Button asChild variant="default" size="sm">
                <a
                  href={`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(
                    `Olá! Preciso da peça ${part.name}${oem ? ` (cód. ${oem})` : ""}. Vocês têm previsão?`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon icon="mdi:whatsapp" size={14} className="mr-1" aria-hidden />
                  {S.ctaCheckStock}
                </a>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-foreground">{S.qtyLabel}:</span>
            <div className="inline-flex items-center rounded-md border border-border bg-background">
              <Button
                variant="ghost"
                size="icon"
                aria-label={S.qtyDecreaseAria}
                onClick={() => setQuantity((q) => clampQuantity(q - 1))}
                disabled={quantity <= 1}
                className="h-9 w-9 rounded-none rounded-l-md"
              >
                <Icon icon="mdi:minus" size={16} />
              </Button>
              <Input
                type="number"
                min={1}
                max={part.stockAvailable}
                value={quantity}
                onChange={(e) => setQuantity(clampQuantity(Number(e.target.value)))}
                className="h-9 w-14 rounded-none border-0 border-x border-border text-center [appearance:textfield] focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                aria-label={S.qtyLabel}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={S.qtyIncreaseAria}
                onClick={() => setQuantity((q) => clampQuantity(q + 1))}
                disabled={quantity >= part.stockAvailable}
                className="h-9 w-9 rounded-none rounded-r-md"
              >
                <Icon icon="mdi:plus" size={16} />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {showSeeCart ? (
              <Button asChild size="lg" className="min-w-[14rem]">
                <Link to="/loja/carrinho">
                  <Icon icon="mdi:cart-check" size={16} className="mr-2" aria-hidden />
                  {S.ctaSeeCart}
                </Link>
              </Button>
            ) : (
              <Button size="lg" className="min-w-[14rem]" onClick={handleAdd}>
                <Icon icon="mdi:cart-plus" size={16} className="mr-2" aria-hidden />
                {S.ctaAddToCart}
              </Button>
            )}
            <Button asChild variant="outline" size="lg">
              <a href={shareUrlHref} target="_blank" rel="noopener noreferrer">
                <Icon icon="mdi:whatsapp" size={16} className="mr-2" aria-hidden />
                {S.ctaShareWhatsapp}
              </a>
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => void handleCopyLink()}
              aria-label={S.ctaCopyLink}
            >
              <Icon icon="mdi:link-variant" size={16} className="mr-2" aria-hidden />
              {S.ctaCopyLink}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
