import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import { useCartStore, selectCartSubtotal } from "@/features/storefront/store/cartStore";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { useStorefrontSettings } from "@/features/storefront/hooks/useStorefrontSettings";
import { formatBRL } from "@/shared/utils/format";
import { useCartValidation } from "../../hooks/useCartValidation";
import { buildHandoffMessage } from "../../utils/handoffMessage";
import { STOREFRONT_CART_STRINGS as S } from "../../i18n/pt-BR";

/**
 * Checkout handoff screen (#42) — rendered in `supabase` mode, where the
 * storefront visitor is anonymous and anon writes are blocked by RLS.
 *
 * Rather than the demo order-creation funnel (which would fail on anon writes),
 * this routes the order request to the store's WhatsApp via a write-free deep
 * link, with a clipboard fallback when no WhatsApp number is configured. No
 * backend, no writes.
 */
export function CheckoutHandoff() {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectCartSubtotal);
  const { config } = useStorefrontSettings();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useCartValidation();

  useSeoMeta({
    title: "Finalizar pedido · GALLO PARTS",
    description:
      "Envie seu pedido direto ao time da GALLO PARTS pelo WhatsApp — confirmamos disponibilidade, frete e pagamento.",
  });

  // Redirect back to the cart when the user lands here without items.
  useEffect(() => {
    if (items.length === 0) {
      void navigate({ to: "/loja/carrinho" });
    }
  }, [items.length, navigate]);

  if (items.length === 0) {
    return null; // effect above is navigating away
  }

  const message = buildHandoffMessage(items, subtotal, { name, phone });
  const whatsappDigits = (config.footer.whatsapp ?? "").replace(/\D/g, "");
  const hasWhatsapp = whatsappDigits.length > 0;
  const whatsappHref = `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(message)}`;

  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error(S.handoffCopyFailed);
      return;
    }
    try {
      await navigator.clipboard.writeText(message);
      toast.success(S.handoffCopied);
    } catch {
      toast.error(S.handoffCopyFailed);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 pb-24 sm:py-10 lg:pb-10">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {S.handoffTitle}
        </h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/loja/carrinho">
            <Icon icon="mdi:arrow-left" size={14} className="mr-1" aria-hidden />
            {S.handoffBackToCart}
          </Link>
        </Button>
      </header>

      <Card className="flex items-start gap-3 border-primary/30 bg-primary/5 p-4">
        <Icon icon="mdi:whatsapp" size={22} className="mt-0.5 text-primary" aria-hidden />
        <p className="text-sm leading-relaxed text-muted-foreground">{S.handoffIntro}</p>
      </Card>

      {/* Cart review */}
      <Card className="space-y-4 p-6">
        <h2 className="text-base font-semibold text-foreground">{S.handoffReviewTitle}</h2>
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((item) => (
            <li
              key={item.partId}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="line-clamp-1 font-medium text-foreground">{item.partName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.quantity} × {formatBRL(item.unitPrice)}
                </p>
              </div>
              <span className="font-medium text-foreground">
                {formatBRL(item.unitPrice * item.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm font-semibold text-foreground">{S.summarySubtotal}</span>
          <span className="text-base font-semibold text-primary">{formatBRL(subtotal)}</span>
        </div>
        <p className="text-xs text-muted-foreground">{S.handoffShippingNote}</p>
      </Card>

      {/* Optional contact */}
      <Card className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{S.handoffContactTitle}</h2>
          <p className="text-xs text-muted-foreground">{S.handoffContactHint}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="handoff-name">{S.handoffNameLabel}</Label>
            <Input
              id="handoff-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={S.handoffNamePlaceholder}
              autoComplete="name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="handoff-phone">{S.handoffPhoneLabel}</Label>
            <Input
              id="handoff-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={S.handoffPhonePlaceholder}
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
        </div>
      </Card>

      {/* Call to action */}
      <div className="flex flex-col gap-2 sm:flex-row">
        {hasWhatsapp && (
          <Button asChild size="lg" className="flex-1">
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
              <Icon icon="mdi:whatsapp" size={18} className="mr-2" aria-hidden />
              {S.handoffWhatsappCta}
            </a>
          </Button>
        )}
        <Button
          variant={hasWhatsapp ? "outline" : "default"}
          size="lg"
          className="flex-1"
          onClick={() => void handleCopy()}
        >
          <Icon icon="mdi:content-copy" size={18} className="mr-2" aria-hidden />
          {S.handoffCopyCta}
        </Button>
      </div>

      {!hasWhatsapp && (
        <Card className="space-y-2 border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            {S.handoffNoWhatsapp}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-800 dark:text-amber-200">
            {config.footer.phone && (
              <span className="inline-flex items-center gap-1">
                <Icon icon="mdi:phone" size={13} aria-hidden />
                {config.footer.phone}
              </span>
            )}
            {config.footer.email && (
              <span className="inline-flex items-center gap-1">
                <Icon icon="mdi:email-outline" size={13} aria-hidden />
                {config.footer.email}
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
