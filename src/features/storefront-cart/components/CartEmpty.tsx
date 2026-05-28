import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { STOREFRONT_CART_STRINGS as S } from "../i18n/pt-BR";

export function CartEmpty() {
  return (
    <Card className="flex flex-col items-center gap-4 border-dashed border-border bg-muted/30 p-10 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon icon="mdi:cart-off" size={32} aria-hidden />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{S.emptyTitle}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{S.emptyHint}</p>
      </div>
      <Button asChild>
        <Link to="/loja">
          <Icon icon="mdi:storefront-outline" size={14} className="mr-1" aria-hidden />
          {S.emptyCta}
        </Link>
      </Button>
    </Card>
  );
}
