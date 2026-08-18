import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import {
  buildDisconnectBannerCopy,
  muteDisconnectAlerts,
  useWhatsAppConnectionStatus,
} from "../hooks/useWhatsAppConnectionStatus";

/**
 * Translucent alert shown while at least one WhatsApp account is
 * disconnected — operation is stopped, so the signal must survive scrolling.
 * Mounted stacked inside `<AlertBannerStack>` (shared sticky anchor with the
 * other operational banners); it renders as a normal flow block here.
 *
 * Per the design review: critical tint stays on the icon/border/background
 * (text keeps `foreground` for contrast over scrolling content), the blur has
 * a no-backdrop-filter fallback, role="alert" mounts once per episode (the
 * node only exists while alerting), and the X snoozes per account for 30min
 * (see useWhatsAppConnectionStatus for the resurface rules).
 */
export function WhatsAppDisconnectedBanner() {
  const { alerting } = useWhatsAppConnectionStatus();
  if (alerting.length === 0) return null;

  const { headline, cta } = buildDisconnectBannerCopy(alerting.map((a) => a.label));

  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-severity-critical/40 bg-severity-critical/15 px-4 py-2 text-sm text-foreground backdrop-blur-md supports-[backdrop-filter]:bg-severity-critical/10 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200"
    >
      <Icon
        icon="mdi:alert-circle-outline"
        size={16}
        className="shrink-0 text-severity-critical"
        aria-hidden
      />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{headline}</span>{" "}
        <span className="opacity-90">Mensagens não estão sendo enviadas nem recebidas.</span>
      </p>
      <Link
        to="/app/configuracoes/whatsapp"
        className="shrink-0 font-medium underline-offset-4 hover:underline"
      >
        {cta} →
      </Link>
      <button
        type="button"
        aria-label="Silenciar aviso por 30 minutos"
        title="Silenciar aviso por 30 minutos"
        className="shrink-0 rounded p-1 transition-colors hover:bg-severity-critical/15"
        onClick={() => muteDisconnectAlerts(alerting.map((a) => a.id))}
      >
        <Icon icon="mdi:close" size={14} aria-hidden />
      </button>
    </div>
  );
}
