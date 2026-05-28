import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { STOREFRONT_ADMIN_STRINGS as S } from "../../i18n/pt-BR";

interface IMockCampaign {
  title: string;
  period: string;
  gradient: string;
  icon: string;
}

const MOCK_CAMPAIGNS: IMockCampaign[] = [
  {
    title: "Black Friday Diesel",
    period: "22/11 – 29/11",
    gradient: "from-zinc-900 to-zinc-700",
    icon: "mdi:tag-multiple",
  },
  {
    title: "Semana do Caminhoneiro",
    period: "21/07 – 28/07",
    gradient: "from-primary/80 to-primary/40",
    icon: "mdi:truck-fast",
  },
  {
    title: "Liquidação de Filtros",
    period: "Mensal",
    gradient: "from-amber-600 to-amber-400",
    icon: "mdi:air-filter",
  },
];

export function CampaignsTab() {
  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon icon="mdi:bullhorn-outline" size={28} aria-hidden />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{S.campaignsTitle}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{S.campaignsPlaceholder}</p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button disabled className="gap-2">
                  <Icon icon="mdi:plus" size={16} aria-hidden />
                  Nova campanha
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{S.badgePhase2}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Card>

      <p className="text-xs text-muted-foreground">{S.campaignsDemoNote}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {MOCK_CAMPAIGNS.map((c) => (
          <Card key={c.title} className="overflow-hidden p-0 opacity-90">
            <div
              className={`flex h-28 items-center justify-center bg-gradient-to-br ${c.gradient} text-white`}
            >
              <Icon icon={c.icon} size={36} aria-hidden />
            </div>
            <div className="p-4">
              <p className="font-semibold text-foreground">{c.title}</p>
              <p className="text-xs text-muted-foreground">{c.period}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
