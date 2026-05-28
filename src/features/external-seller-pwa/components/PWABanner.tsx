import { Icon } from "@/components/Icon";
import { PWA_STRINGS as S } from "../i18n/pt-BR";

/** Transparency banner shown across PWA screens (PRD-070 RF-006). */
export function PWABanner({ text = S.phase2Banner }: { text?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
      <Icon icon="mdi:test-tube" size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
