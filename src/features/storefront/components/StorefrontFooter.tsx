import type { IStorefrontConfig } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { STOREFRONT_STRINGS as S } from "../i18n/pt-BR";

export interface IStorefrontFooterProps {
  footer: IStorefrontConfig["footer"];
}

const SOCIAL_ICONS: Record<keyof IStorefrontConfig["footer"]["social"], string> = {
  instagram: "mdi:instagram",
  facebook: "mdi:facebook",
  youtube: "mdi:youtube",
  linkedin: "mdi:linkedin",
};

/**
 * Institutional footer (PRD-060 RF-021/022). 4 colunas: contato, atendimento,
 * institucional e social. Padding-bottom extra no mobile para abrir espaço
 * para a barra de busca fixa.
 */
export function StorefrontFooter({ footer }: IStorefrontFooterProps) {
  const social = Object.entries(footer.social).filter(([, url]) => Boolean(url)) as Array<
    [keyof IStorefrontConfig["footer"]["social"], string]
  >;

  return (
    <footer className="mt-auto border-t border-border bg-card pb-20 lg:pb-0" role="contentinfo">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {/* Brand + address */}
        <div>
          <Logo variant="horizontal" className="h-8" />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{footer.address}</p>
        </div>

        {/* Contact */}
        <div>
          <h4 className="text-sm font-semibold text-foreground">{S.footerSupportHeading}</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {footer.phone && (
              <li className="flex items-center gap-2">
                <Icon icon="mdi:phone" size={14} aria-hidden />
                <a href={`tel:${footer.phone.replace(/\D/g, "")}`} className="hover:text-primary">
                  {footer.phone}
                </a>
              </li>
            )}
            {footer.whatsapp && (
              <li className="flex items-center gap-2">
                <Icon icon="mdi:whatsapp" size={14} aria-hidden />
                <a
                  href={`https://wa.me/${footer.whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary"
                >
                  {footer.whatsapp}
                </a>
              </li>
            )}
            {footer.email && (
              <li className="flex items-center gap-2">
                <Icon icon="mdi:email-outline" size={14} aria-hidden />
                <a href={`mailto:${footer.email}`} className="hover:text-primary">
                  {footer.email}
                </a>
              </li>
            )}
          </ul>
        </div>

        {/* Institutional links */}
        <div>
          <h4 className="text-sm font-semibold text-foreground">{S.footerLegalHeading}</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {footer.institutionalLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="hover:text-primary">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Social */}
        <div>
          <h4 className="text-sm font-semibold text-foreground">{S.footerSocialHeading}</h4>
          <div className="mt-3 flex items-center gap-3">
            {social.length === 0 ? (
              <p className="text-xs text-muted-foreground">Em breve.</p>
            ) : (
              social.map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={key}
                  className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <Icon icon={SOCIAL_ICONS[key]} size={18} />
                </a>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row">
          <p>{S.footerCopyright}</p>
          <p className="opacity-60">CNPJ 12.345.678/0001-90</p>
        </div>
      </div>
    </footer>
  );
}
