import { Icon } from "@/components/Icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { NotificationLayout } from "../lib/useNotificationLayout";

interface NotificationLayoutSwitcherProps {
  value: NotificationLayout;
  onChange: (l: NotificationLayout) => void;
}

/**
 * Segmented control to toggle between Painel (sidebar filters) and Lista (bar filters)
 * layouts in the Notification Center.
 */
export function NotificationLayoutSwitcher({ value, onChange }: NotificationLayoutSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        // Ignore empty string — never allow deselecting all items.
        if (!next) return;
        onChange(next as NotificationLayout);
      }}
      aria-label="Layout de notificações"
      className="gap-0 rounded-md border border-border"
    >
      <ToggleGroupItem
        value="painel"
        aria-label="Painel"
        size="sm"
        className="rounded-none px-2.5 first:rounded-l-md last:rounded-r-md"
      >
        <Icon icon="mdi:view-split-vertical" size={16} aria-hidden />
        <span className="ml-1.5 text-xs">Painel</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        value="lista"
        aria-label="Lista"
        size="sm"
        className="rounded-none px-2.5 first:rounded-l-md last:rounded-r-md"
      >
        <Icon icon="mdi:view-agenda-outline" size={16} aria-hidden />
        <span className="ml-1.5 text-xs">Lista</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
