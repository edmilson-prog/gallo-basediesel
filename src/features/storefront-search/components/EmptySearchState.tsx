import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useStorefrontSettings } from "@/features/storefront";
import { STOREFRONT_SEARCH_STRINGS as S } from "../i18n/pt-BR";

export interface IEmptySearchStateProps {
  onClearFilters: () => void;
}

/**
 * Empty result state (PRD-061 RF-023). Surfaces actionable hints and a
 * WhatsApp CTA that reuses the storefront-configured number, falling back
 * to a placeholder when the footer config is empty.
 */
export function EmptySearchState({ onClearFilters }: IEmptySearchStateProps) {
  const { config } = useStorefrontSettings();
  const whatsappRaw = config.footer.whatsapp ?? "";
  const whatsappDigits = whatsappRaw.replace(/\D/g, "");
  const whatsappUrl =
    whatsappDigits.length > 0
      ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(
          "Olá! Não encontrei a peça que eu precisava na loja online.",
        )}`
      : null;

  return (
    <Card className="flex flex-col items-center gap-4 border-dashed border-border bg-muted/30 p-10 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon icon="mdi:package-variant-closed" size={32} aria-hidden />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{S.emptyTitle}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{S.emptyHint}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" onClick={onClearFilters}>
          <Icon icon="mdi:filter-remove-outline" size={14} className="mr-1" aria-hidden />
          {S.emptyClearFilters}
        </Button>
        {whatsappUrl && (
          <Button asChild>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <Icon icon="mdi:whatsapp" size={14} className="mr-1" aria-hidden />
              {S.emptyContactCta}
            </a>
          </Button>
        )}
      </div>
    </Card>
  );
}
