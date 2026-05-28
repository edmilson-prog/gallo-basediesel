import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

export type KpiBadgeKind = "real" | "mock" | "phase2";

export interface IKpiCardProps {
  label: string;
  value: string;
  icon: string;
  badge?: KpiBadgeKind;
  badgeLabel?: string;
  hint?: string;
}

const BADGE_VARIANT: Record<KpiBadgeKind, string> = {
  real: "border-primary/40 bg-primary/10 text-primary",
  mock: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  phase2: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function KpiCard({ label, value, icon, badge, badgeLabel, hint }: IKpiCardProps) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon icon={icon} size={18} aria-hidden />
        </div>
        {badge && badgeLabel && (
          <Badge variant="outline" className={cn("text-[10px]", BADGE_VARIANT[badge])}>
            {badgeLabel}
          </Badge>
        )}
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {hint && <p className="mt-1 text-[11px] text-muted-foreground/80">{hint}</p>}
      </div>
    </Card>
  );
}
