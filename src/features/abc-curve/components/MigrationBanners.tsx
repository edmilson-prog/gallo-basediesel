import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { ICustomerABCWithMigration } from "../engine/classifyABC";
import { ABC_STRINGS as S } from "../i18n/pt-BR";

export interface IMigrationBannersProps {
  upgradedToA: ICustomerABCWithMigration[];
  downgradedFromA: ICustomerABCWithMigration[];
  newCustomersInA: ICustomerABCWithMigration[];
  isLoading?: boolean;
  onViewClass?: (klass: "A" | "B" | "C", filter?: "upgraded" | "downgraded" | "new") => void;
}

interface IBannerProps {
  icon: string;
  title: string;
  description: string;
  count: number;
  tone: "positive" | "negative" | "neutral";
  onClick?: () => void;
}

const TONE_STYLES: Record<IBannerProps["tone"], string> = {
  positive:
    "border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100",
  negative: "border-red-500/40 bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-100",
  neutral: "border-sky-500/40 bg-sky-50 text-sky-900 dark:bg-sky-500/10 dark:text-sky-100",
};

function Banner({ icon, title, description, count, tone, onClick }: IBannerProps) {
  const interactive = Boolean(onClick);
  return (
    <Card
      className={cn(
        "flex items-start gap-3 border p-4",
        TONE_STYLES[tone],
        interactive && "cursor-pointer transition-colors hover:shadow-md",
      )}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <Icon icon={icon} size={22} className="mt-0.5 shrink-0" />
      <div className="flex flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold">{title}</p>
          <span className="text-2xl font-semibold tabular-nums">{count}</span>
        </div>
        <p className="text-xs opacity-90">{description}</p>
        {interactive && (
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium opacity-90">
            {S.migrationsViewAll}
            <Icon icon="mdi:chevron-right" size={12} />
          </span>
        )}
      </div>
    </Card>
  );
}

export function MigrationBanners({
  upgradedToA,
  downgradedFromA,
  newCustomersInA,
  isLoading,
  onViewClass,
}: IMigrationBannersProps) {
  if (isLoading) return null;
  const total = upgradedToA.length + downgradedFromA.length + newCustomersInA.length;
  if (total === 0) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <Icon icon="mdi:check-circle-outline" size={18} className="text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{S.migrationsEmpty}</span>
      </Card>
    );
  }
  return (
    <section
      className="grid grid-cols-1 gap-3 lg:grid-cols-3"
      aria-label="Migrações ABC do período"
    >
      <Banner
        icon="mdi:trending-up"
        tone="positive"
        title={S.migrationsUpgradedTitle}
        description={S.migrationsUpgradedHelp}
        count={upgradedToA.length}
        onClick={onViewClass ? () => onViewClass("A", "upgraded") : undefined}
      />
      <Banner
        icon="mdi:trending-down"
        tone="negative"
        title={S.migrationsDowngradedTitle}
        description={S.migrationsDowngradedHelp}
        count={downgradedFromA.length}
        onClick={onViewClass ? () => onViewClass("A", "downgraded") : undefined}
      />
      <Banner
        icon="mdi:account-star-outline"
        tone="neutral"
        title={S.migrationsNewTitle}
        description={S.migrationsNewHelp}
        count={newCustomersInA.length}
        onClick={onViewClass ? () => onViewClass("A", "new") : undefined}
      />
    </section>
  );
}
