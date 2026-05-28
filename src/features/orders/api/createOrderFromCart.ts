import type {
  ICustomer,
  ICustomerAddress,
  ID,
  IOrder,
  IOrderItem,
  OrderPaymentMethod,
} from "@/shared/types";
import type { ICustomersProvider } from "@/providers/data/contracts/customers";
import type { IOrdersProvider } from "@/providers/data/contracts/orders";
import type { ISellersProvider } from "@/providers/data/contracts/sellers";
import type { ICartItem } from "@/features/storefront/store/cartStore";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { computeCommissionPreview } from "../utils/commissionPreview";
import { composeOrderPaymentCondition, generateOrderNumber } from "../utils/orderNumber";

export interface ICreateOrderFromCartIdentity {
  kind: "registered" | "guest";
  /** When `kind === 'registered'`, the authenticated user id. */
  userId?: ID;
  /** Customer id when the order should attach to an existing customer record. */
  customerId?: ID;
  /** Display name on the order (used to mint the placeholder visitor customer). */
  fullName: string;
  email: string;
  phone: string;
  docType?: "pf" | "pj";
  doc?: string;
}

export interface ICreateOrderFromCartInput {
  storeId: ID;
  items: ICartItem[];
  subtotal: number;
  shipping: number;
  identity: ICreateOrderFromCartIdentity;
  address: ICustomerAddress;
  paymentMethod: OrderPaymentMethod;
  /** Free-form notes the customer left at checkout. */
  customerNotes?: string;
}

export interface ICreateOrderFromCartOptions {
  ordersProvider: IOrdersProvider;
  customersProvider: ICustomersProvider;
  sellersProvider: ISellersProvider;
  actorId?: ID;
}

/**
 * Convert a storefront cart into a real `IOrder` (PRD-064 RF-030 + PRD-032).
 *
 * - Snapshots prices and SKUs at the moment of the sale.
 * - Creates a placeholder `ICustomerB2C` (or `B2B`) for guest checkouts so
 *   the resulting order obeys the relational constraints; an authenticated
 *   purchase reuses the provided `customerId`.
 * - Round-robin distribution: picks the active seller with the smallest
 *   round-robin token (id sort) so e-commerce orders spread fairly across
 *   the team. Production wiring (PRD-013) will replace this on Fase 2.
 * - Emits `order_create` and `customer_create` audit logs.
 */
export async function createOrderFromCart(
  input: ICreateOrderFromCartInput,
  opts: ICreateOrderFromCartOptions,
): Promise<IOrder> {
  const { ordersProvider, customersProvider, sellersProvider, actorId } = opts;

  // Round-robin seller pick (PRD-013 placeholder).
  const sellers = await sellersProvider.list({ storeId: input.storeId, active: true });
  if (sellers.length === 0) {
    throw new Error("[createOrderFromCart] No active sellers available — cannot route the order.");
  }
  const sellerId = sellers.sort((a, b) => a.id.localeCompare(b.id))[0]!.id;

  // Identity → customer.
  let customerId = input.identity.customerId;
  if (!customerId) {
    const created = await ensureGuestCustomer(
      customersProvider,
      input.identity,
      input.address,
      input.storeId,
      sellerId,
    );
    customerId = created.id;
    auditLog({
      actorId,
      action: "customer_create",
      resource: "customer",
      resourceId: created.id,
      after: { source: "ecommerce_guest_checkout", email: input.identity.email },
      storeId: input.storeId,
    });
  }

  const orderItems: IOrderItem[] = input.items.map((it, idx) => {
    const unitCost = round(it.unitPrice * 0.7);
    const total = round(it.unitPrice * it.quantity);
    const marginValue = round((it.unitPrice - unitCost) * it.quantity);
    return {
      id: `oi-cart-${Date.now()}-${idx + 1}`,
      partId: it.partId,
      partSku: it.partSku,
      partName: it.partName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      unitCost,
      discount: 0,
      total,
      marginValue,
    };
  });

  const total = round(input.subtotal + input.shipping);
  const paymentCondition = composeOrderPaymentCondition(input.paymentMethod, undefined);

  const existing = await ordersProvider.list({ storeId: input.storeId, pageSize: 1000 });
  const number = generateOrderNumber(existing.data, input.storeId);

  const commissionPreview = computeCommissionPreview(
    { subtotal: input.subtotal, discount: 0 },
    { storeId: input.storeId },
  );

  const created = await ordersProvider.create({
    storeId: input.storeId,
    customerId,
    sellerId,
    number,
    items: orderItems,
    subtotal: round(input.subtotal),
    discount: 0,
    shipping: round(input.shipping),
    total,
    paymentCondition,
    paymentMethod: input.paymentMethod,
    paymentStatus: "pendente",
    fulfillmentStatus: "pendente",
    deliveryAddress: input.address,
    origin: "ecommerce",
    division: "parts",
    customerNotes: input.customerNotes,
    commissionPreview,
    notes: input.customerNotes,
  });

  auditLog({
    actorId,
    action: "order_create",
    resource: "order",
    resourceId: created.id,
    after: {
      number: created.number,
      total: created.total,
      origin: created.origin,
      paymentMethod: created.paymentMethod,
    },
    storeId: created.storeId,
  });

  return created;
}

async function ensureGuestCustomer(
  customersProvider: ICustomersProvider,
  identity: ICreateOrderFromCartIdentity,
  address: ICustomerAddress,
  storeId: ID,
  sellerId: ID,
): Promise<ICustomer> {
  const isB2B = identity.docType === "pj";
  const sharedBase = {
    storeId,
    email: identity.email,
    phone: identity.phone,
    address,
    sellerId,
    status: "ativo" as const,
    tags: ["ecommerce", "visitante"],
    isGuestCheckout: true,
  };

  if (isB2B) {
    return customersProvider.create({
      ...sharedBase,
      type: "B2B",
      cnpj: identity.doc ?? "",
      razaoSocial: identity.fullName,
      nomeFantasia: identity.fullName,
      contactName: identity.fullName,
    });
  }
  return customersProvider.create({
    ...sharedBase,
    type: "B2C",
    cpf: identity.doc ?? "",
    fullName: identity.fullName,
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
