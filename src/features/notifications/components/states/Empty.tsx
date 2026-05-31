import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";

interface NotificationsEmptyProps {
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  title?: string;
  description?: string;
}

export function NotificationsEmpty({
  hasActiveFilters = false,
  onClearFilters,
  title,
  description,
}: NotificationsEmptyProps) {
  const resolvedTitle = title ?? (hasActiveFilters ? "Nenhum resultado" : "Você está em dia ✅");
  const resolvedDescription =
    description ??
    (hasActiveFilters
      ? "Nenhuma notificação corresponde aos filtros."
      : "Nenhuma notificação no momento.");

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Icon icon="mdi:bell-sleep-outline" size={40} className="text-muted-foreground/50" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{resolvedTitle}</p>
        <p className="text-xs text-muted-foreground">{resolvedDescription}</p>
      </div>
      {hasActiveFilters && onClearFilters && (
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
