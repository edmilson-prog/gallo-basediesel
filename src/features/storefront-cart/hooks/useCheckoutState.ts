import { useMemo, useState } from "react";
import type { ICustomerAddress, OrderPaymentMethod } from "@/shared/types";

export type CheckoutStep = 1 | 2 | 3;

export interface IGuestIdentity {
  kind: "guest";
  fullName: string;
  docType: "pf" | "pj";
  doc: string;
  email: string;
  phone: string;
}

export interface IRegisteredIdentity {
  kind: "registered";
  /** Reference to the authenticated session — populated when `useAuth().currentUser` is present. */
  userId: string;
  /** Customer record id, when the session maps to an `ICustomer` (storefront login). */
  customerId?: string;
  displayName: string;
  email?: string;
}

export type CheckoutIdentity = IGuestIdentity | IRegisteredIdentity;

export interface ICheckoutAddress extends ICustomerAddress {
  saveForLater?: boolean;
}

export interface ICheckoutPayment {
  method: Extract<OrderPaymentMethod, "pix" | "boleto" | "cartao">;
}

export interface ICheckoutState {
  step: CheckoutStep;
  identity: CheckoutIdentity | null;
  address: ICheckoutAddress | null;
  payment: ICheckoutPayment;
  goTo: (step: CheckoutStep) => void;
  setIdentity: (identity: CheckoutIdentity) => void;
  setAddress: (address: ICheckoutAddress) => void;
  setPayment: (payment: ICheckoutPayment) => void;
  canAdvance: boolean;
}

const DEFAULT_PAYMENT: ICheckoutPayment = { method: "pix" };

/**
 * Co-located state container for the 3-step checkout wizard (PRD-064 RF-014–017).
 *
 * Keeps each step's data isolated and exposes a `canAdvance` flag that the
 * wizard buttons consume to enforce "validate per step" UX.
 */
export function useCheckoutState(): ICheckoutState {
  const [step, setStep] = useState<CheckoutStep>(1);
  const [identity, setIdentity] = useState<CheckoutIdentity | null>(null);
  const [address, setAddress] = useState<ICheckoutAddress | null>(null);
  const [payment, setPayment] = useState<ICheckoutPayment>(DEFAULT_PAYMENT);

  const canAdvance = useMemo(() => {
    switch (step) {
      case 1:
        return identity !== null;
      case 2:
        return address !== null;
      case 3:
        return Boolean(payment.method);
      default:
        return false;
    }
  }, [step, identity, address, payment]);

  return {
    step,
    identity,
    address,
    payment,
    goTo: (s) => setStep(s),
    setIdentity,
    setAddress,
    setPayment,
    canAdvance,
  };
}
