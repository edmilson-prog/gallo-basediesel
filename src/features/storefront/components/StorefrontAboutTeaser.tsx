import type { IStorefrontConfig } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { STOREFRONT_STRINGS as S } from "../i18n/pt-BR";

export interface IStorefrontAboutTeaserProps {
  about: IStorefrontConfig["about"];
}

/**
 * "Sobre a GALLO" teaser block (PRD-060 RF-019/020). Texto + foto opcional.
 */
export function StorefrontAboutTeaser({ about }: IStorefrontAboutTeaserProps) {
  return (
    <section aria-label={S.aboutTitle} className="bg-card/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:py-16 lg:grid-cols-2 lg:items-center">
        <div className="space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Icon icon="mdi:office-building-outline" size={14} aria-hidden />
            {S.aboutTitle}
          </p>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {about.headline}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{about.body}</p>
          <Button variant="outline">
            <Icon icon="mdi:information-outline" size={16} className="mr-1.5" />
            {S.aboutCta}
          </Button>
        </div>
        <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/10 via-card to-primary/5">
          {about.photoUrl ? (
            <img src={about.photoUrl} alt={about.headline} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <Icon icon="mdi:warehouse" size={140} className="text-primary/40" aria-hidden />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
