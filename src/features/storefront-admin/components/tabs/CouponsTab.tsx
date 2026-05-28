import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { STOREFRONT_ADMIN_STRINGS as S } from "../../i18n/pt-BR";

interface IMockCoupon {
  code: string;
  description: string;
  discount: string;
  status: "ativo" | "agendado" | "expirado";
}

const MOCK_COUPONS: IMockCoupon[] = [
  { code: "PRIMEIRA10", description: "10% na primeira compra", discount: "10%", status: "ativo" },
  { code: "FRETEGRATIS", description: "Frete grátis acima de R$ 500", discount: "Frete", status: "ativo" },
  { code: "BLACK25", description: "25% em filtros — Black Friday", discount: "25%", status: "agendado" },
  { code: "VOLTA15", description: "15% para clientes inativos", discount: "15%", status: "expirado" },
];

const STATUS_LABEL: Record<IMockCoupon["status"], string> = {
  ativo: "Ativo",
  agendado: "Agendado",
  expirado: "Expirado",
};

const STATUS_VARIANT: Record<IMockCoupon["status"], string> = {
  ativo: "border-primary/40 bg-primary/10 text-primary",
  agendado: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  expirado: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function CouponsTab() {
  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon icon="mdi:ticket-percent-outline" size={28} aria-hidden />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{S.couponsTitle}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{S.couponsPlaceholder}</p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button disabled className="gap-2">
                  <Icon icon="mdi:plus" size={16} aria-hidden />
                  {S.couponsCreateDisabled}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{S.couponsCreateTooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Card>

      <p className="text-xs text-muted-foreground">{S.couponsDemoNote}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {MOCK_COUPONS.map((coupon) => (
          <Card key={coupon.code} className="flex items-center justify-between gap-3 p-4 opacity-80">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm text-foreground">
                  {coupon.code}
                </code>
                <Badge variant="outline" className={STATUS_VARIANT[coupon.status]}>
                  {STATUS_LABEL[coupon.status]}
                </Badge>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{coupon.description}</p>
            </div>
            <span className="shrink-0 text-lg font-semibold text-primary">{coupon.discount}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}
