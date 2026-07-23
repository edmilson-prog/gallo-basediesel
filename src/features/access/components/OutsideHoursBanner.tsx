import { Icon } from "@/components/Icon";
import { useOutsideHoursWatcher } from "../hooks/useOutsideHoursWatcher";

/**
 * Persistent session banner shown when the user is outside their work
 * schedule (PRD-212). Does NOT log out or block actions. Mounted stacked
 * inside `<AlertBannerStack>` (shared sticky anchor with the other
 * operational banners); it renders as a normal flow block here.
 */
export function OutsideHoursBanner() {
  const { outside } = useOutsideHoursWatcher();
  if (!outside) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-severity-warning/30 bg-severity-warning/10 px-4 py-2 text-xs text-severity-warning"
    >
      <Icon icon="mdi:clock-alert-outline" size={15} className="shrink-0" />
      <span>
        Você está fora do seu horário de atendimento. Pode concluir o que está em andamento; sua
        disponibilidade ficou <strong>offline</strong>.
      </span>
    </div>
  );
}
