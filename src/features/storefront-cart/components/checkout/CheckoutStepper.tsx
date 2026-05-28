import { Icon } from "@/components/Icon";
import type { CheckoutStep } from "../../hooks/useCheckoutState";
import { STOREFRONT_CART_STRINGS as S } from "../../i18n/pt-BR";

export interface ICheckoutStepperProps {
  current: CheckoutStep;
}

interface IStepDescriptor {
  index: CheckoutStep;
  label: string;
  icon: string;
}

const STEPS: IStepDescriptor[] = [
  { index: 1, label: S.checkoutStep1, icon: "mdi:account-circle-outline" },
  { index: 2, label: S.checkoutStep2, icon: "mdi:map-marker-outline" },
  { index: 3, label: S.checkoutStep3, icon: "mdi:credit-card-outline" },
];

export function CheckoutStepper({ current }: ICheckoutStepperProps) {
  return (
    <ol
      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 sm:p-4"
      aria-label="Etapas do checkout"
    >
      {STEPS.map((step, idx) => {
        const completed = current > step.index;
        const active = current === step.index;
        return (
          <li key={step.index} className="flex flex-1 items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm font-semibold ${
                completed
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground"
              }`}
            >
              {completed ? <Icon icon="mdi:check" size={16} /> : step.index}
            </span>
            <div className="min-w-0">
              <p
                className={`text-[10px] uppercase tracking-wider ${
                  active || completed ? "text-primary" : "text-muted-foreground"
                }`}
              >
                Passo {step.index}
              </p>
              <p className="truncate text-xs font-medium text-foreground sm:text-sm">
                {step.label}
              </p>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                aria-hidden
                className={`mx-1 hidden h-px flex-1 sm:block ${
                  completed ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
