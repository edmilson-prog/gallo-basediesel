import { Icon } from "@/components/Icon";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

/** Persistent band shown while the device reports no connection. */
export function PwaOfflineBar({ online, onRetry }: { online: boolean; onRetry: () => void }) {
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 bg-severity-critical/15 px-3.5 text-[12.5px] font-semibold text-severity-critical shadow-[inset_0_-1px_0] shadow-severity-critical/30"
    >
      <Icon icon="mdi:wifi-off" size={15} />
      <span className="flex-1 py-2">{S.offline.message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[44px] px-1 text-xs font-bold text-foreground underline"
      >
        {S.offline.retry}
      </button>
    </div>
  );
}
