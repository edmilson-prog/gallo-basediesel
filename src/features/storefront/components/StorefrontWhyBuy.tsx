import type { IStorefrontBenefit } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { STOREFRONT_STRINGS as S } from "../i18n/pt-BR";

export interface IStorefrontWhyBuyProps {
  benefits: IStorefrontBenefit[];
}

/**
 * Institutional reassurance row (PRD-060 RF-017/018). Up to 4 cards.
 */
export function StorefrontWhyBuy({ benefits }: IStorefrontWhyBuyProps) {
  if (benefits.length === 0) return null;
  return (
    <section aria-label={S.whyBuyTitle} className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
        <header className="mb-8 flex flex-col items-center gap-1 text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {S.whyBuyTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{S.whyBuySubtitle}</p>
        </header>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.slice(0, 4).map((benefit) => (
            <li key={benefit.title}>
              <Card className="flex h-full flex-col gap-3 border-border bg-card p-5">
                <span className="grid h-11 w-11 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon icon={benefit.icon} size={22} aria-hidden />
                </span>
                <h3 className="text-base font-semibold text-foreground">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground">{benefit.description}</p>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
