import { Icon } from "@/components/Icon";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

/** "Modo demonstração" banner for placeholder-heavy modules (PRD-071). */
export function PortalBanner({ text = S.phase2Banner }: { text?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
      <Icon icon="mdi:information-outline" size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
