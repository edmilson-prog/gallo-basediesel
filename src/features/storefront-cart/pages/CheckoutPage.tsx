import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useCartStore, selectCartSubtotal } from "@/features/storefront/store/cartStore";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import {
  useConversationsProvider,
  useCustomersProvider,
  useOrdersProvider,
  useSellersProvider,
  useSettingsProvider,
} from "@/providers/data";
import { createOrderFromCart } from "@/features/orders/api/createOrderFromCart";
import { triggerEcommerceOrder } from "@/features/ecommerce-integration";
import { useCustomerAuth } from "@/features/storefront-account/hooks/useCustomerAuth";
import { useState } from "react";
import { CheckoutStepper } from "../components/checkout/CheckoutStepper";
import { IdentificationStep } from "../components/checkout/IdentificationStep";
import { AddressStep } from "../components/checkout/AddressStep";
import { PaymentStep } from "../components/checkout/PaymentStep";
import { CartSummary } from "../components/CartSummary";
import { useCheckoutState } from "../hooks/useCheckoutState";
import { useCartShipping } from "../hooks/useCartShipping";
import { useCartValidation } from "../hooks/useCartValidation";
import { STOREFRONT_CART_STRINGS as S } from "../i18n/pt-BR";

const STORE_ID = "store-matriz";

/**
 * `/loja/checkout` — three-step wizard (PRD-064 RF-014–029).
 *
 * Each step is gated by `canAdvance` from `useCheckoutState`; once the user
 * completes step 3 we call `createOrderFromCart`, clear the cart and
 * navigate to `/loja/pedido-confirmado/:orderId`.
 */
export function CheckoutPage() {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectCartSubtotal);
  const clear = useCartStore((s) => s.clear);
  const checkout = useCheckoutState();
  const shipping = useCartShipping();
  const auth = useCustomerAuth();
  const ordersProvider = useOrdersProvider();
  const customersProvider = useCustomersProvider();
  const sellersProvider = useSellersProvider();
  const conversationsProvider = useConversationsProvider();
  const settingsProvider = useSettingsProvider();
  const [submitting, setSubmitting] = useState(false);

  useCartValidation();

  useSeoMeta({
    title: "Checkout · GALLO PARTS",
    description:
      "Finalize seu pedido na GALLO PARTS — identifique-se, informe o endereço e escolha a forma de pagamento.",
  });

  // Redirect back to the cart when the user lands on /loja/checkout without items.
  useEffect(() => {
    if (items.length === 0) {
      void navigate({ to: "/loja/carrinho" });
    }
  }, [items.length, navigate]);

  // Recalculate shipping whenever the user confirms a new address.
  useEffect(() => {
    if (checkout.address) {
      void shipping.applyAddress(checkout.address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout.address?.zipCode, checkout.address?.city, checkout.address?.state]);

  const handleAdvance = () => {
    if (!checkout.canAdvance) return;
    if (checkout.step < 3) {
      checkout.goTo((checkout.step + 1) as 1 | 2 | 3);
    }
  };

  const handleBack = () => {
    if (checkout.step > 1) checkout.goTo((checkout.step - 1) as 1 | 2 | 3);
  };

  const handleConfirm = async () => {
    if (!checkout.identity || !checkout.address || submitting) return;
    setSubmitting(true);
    try {
      const order = await createOrderFromCart(
        {
          storeId: STORE_ID,
          items,
          subtotal,
          shipping: shipping.hasValue ? shipping.value : 0,
          identity: {
            kind: checkout.identity.kind,
            userId: checkout.identity.kind === "registered" ? checkout.identity.userId : undefined,
            customerId:
              checkout.identity.kind === "registered" ? checkout.identity.customerId : undefined,
            fullName:
              checkout.identity.kind === "guest"
                ? checkout.identity.fullName
                : checkout.identity.displayName,
            email:
              checkout.identity.kind === "guest"
                ? checkout.identity.email
                : (checkout.identity.email ?? ""),
            phone: checkout.identity.kind === "guest" ? checkout.identity.phone : "",
            docType: checkout.identity.kind === "guest" ? checkout.identity.docType : undefined,
            doc: checkout.identity.kind === "guest" ? checkout.identity.doc : undefined,
          },
          address: checkout.address,
          paymentMethod: checkout.payment.method,
        },
        {
          ordersProvider,
          customersProvider,
          sellersProvider,
          actorId: auth.customer?.id,
        },
      );
      // PRD-067 — orchestrate assignment, conversation and notifications.
      try {
        const settings = await settingsProvider.get(STORE_ID);
        await triggerEcommerceOrder(order, {
          ordersProvider,
          sellersProvider,
          customersProvider,
          conversationsProvider,
          settings: settings.ecommerceIntegration,
        });
      } catch (triggerErr) {
        console.error("[CheckoutPage] e-commerce integration trigger failed", triggerErr);
      }
      clear();
      void navigate({
        to: "/loja/pedido-confirmado/$orderId",
        params: { orderId: order.id },
      });
    } catch (err) {
      console.error("[CheckoutPage] order creation failed", err);
      toast.error(S.confirmCreateFailed);
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return null; // effect above is navigating away
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 pb-24 sm:py-10 lg:pb-10">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {S.checkoutTitle}
        </h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/loja/carrinho">
            <Icon icon="mdi:arrow-left" size={14} className="mr-1" aria-hidden />
            Voltar ao carrinho
          </Link>
        </Button>
      </header>

      <CheckoutStepper current={checkout.step} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {checkout.step === 1 && (
            <IdentificationStep value={checkout.identity} onChange={checkout.setIdentity} />
          )}
          {checkout.step === 2 && (
            <AddressStep value={checkout.address} onChange={checkout.setAddress} />
          )}
          {checkout.step === 3 && (
            <>
              <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/10 p-4">
                <Icon
                  icon="mdi:test-tube"
                  size={20}
                  className="mt-0.5 text-amber-700 dark:text-amber-300"
                  aria-hidden
                />
                <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                  {S.checkoutDemoBanner}
                </p>
              </Card>
              <PaymentStep
                value={checkout.payment}
                onChange={checkout.setPayment}
                identity={checkout.identity}
                address={checkout.address}
                items={items}
                subtotal={subtotal}
                shipping={shipping.hasValue ? shipping.value : 0}
                shippingNegotiate={shipping.result?.isToNegotiate ?? false}
              />
            </>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={checkout.step === 1 || submitting}
            >
              <Icon icon="mdi:arrow-left" size={14} className="mr-1" aria-hidden />
              {S.checkoutBack}
            </Button>
            {checkout.step < 3 ? (
              <Button onClick={handleAdvance} disabled={!checkout.canAdvance}>
                {S.checkoutContinue}
                <Icon icon="mdi:arrow-right" size={14} className="ml-1" aria-hidden />
              </Button>
            ) : (
              <Button onClick={() => void handleConfirm()} disabled={submitting}>
                <Icon icon="mdi:check-bold" size={14} className="mr-1" aria-hidden />
                {submitting ? "Processando…" : S.checkoutConfirmCta}
              </Button>
            )}
          </div>
        </div>

        <div>
          <CartSummary subtotal={subtotal} shipping={shipping} showCheckoutCta={false} />
        </div>
      </div>
    </div>
  );
}
