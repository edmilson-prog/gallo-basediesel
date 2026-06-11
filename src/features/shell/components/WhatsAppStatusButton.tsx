import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWhatsAppConnectionStatus } from "../hooks/useWhatsAppConnectionStatus";

/**
 * Header WhatsApp connection indicator (SIGPRO-inspired).
 *
 * Shares the 60s TanStack Query with WhatsAppDisconnectedBanner — one fetch
 * feeds both. Visual states:
 *   green  — every account connected;
 *   amber  — partial (some connected, some not);
 *   red+!  — none connected;
 *   muted  — loading or no accounts registered.
 * While the disconnect banner is snoozed, the icon pulses as the residual
 * signal that something is still down. Clicking opens Configurações → WhatsApp.
 */
export function WhatsAppStatusButton() {
  const navigate = useNavigate();
  const { loading, total, connectedCount, snoozed } = useWhatsAppConnectionStatus();

  const allConnected = total > 0 && connectedCount === total;
  const noneConnected = total > 0 && connectedCount === 0;

  const label = loading
    ? "WhatsApp — verificando conexão"
    : total === 0
      ? "Nenhuma conta WhatsApp cadastrada"
      : noneConnected
        ? "WhatsApp desconectado — clique para reconectar"
        : allConnected
          ? `WhatsApp conectado (${connectedCount} ${connectedCount === 1 ? "conta" : "contas"})`
          : `WhatsApp parcial — ${connectedCount} de ${total} contas conectadas`;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={() => void navigate({ to: "/app/configuracoes/whatsapp" })}
      aria-label={label}
      title={label}
    >
      <Icon
        icon="mdi:whatsapp"
        size={20}
        className={cn(
          loading || total === 0
            ? "text-muted-foreground"
            : noneConnected
              ? "text-severity-critical"
              : allConnected
                ? "text-severity-success"
                : "text-severity-warning",
          // Residual signal while the disconnect banner is snoozed.
          snoozed && "motion-safe:animate-pulse",
        )}
      />
      {noneConnected && (
        <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-background bg-severity-critical text-[8px] font-bold text-white">
          !
        </span>
      )}
    </Button>
  );
}
