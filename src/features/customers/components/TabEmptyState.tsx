import { Icon } from "@/components/Icon";

export interface ITabEmptyStateProps {
  icon: string;
  message: string;
}

/** Compact empty state for inside-tab usage — smaller than the page-level EmptyState. */
export function TabEmptyState({ icon, message }: ITabEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-4 py-8 text-center">
      <Icon icon={icon} size={24} className="text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
