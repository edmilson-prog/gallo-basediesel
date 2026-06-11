import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IWhatsAppAccount } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { useWhatsAppAccountsProvider } from "@/providers/data";

/**
 * Header WhatsApp connection indicator (SIGPRO-inspired).
 *
 * Reads the current store's accounts and keeps itself fresh: re-fetches every
 * 60s while the tab is visible and on window focus — the DB status is kept
 * truthful by the webhook (connection.update) and the accounts-screen polling,
 * so a cheap list read is enough here.
 *
 * Visual states:
 *   green  — every account connected;
 *   amber  — partial (some connected, some not);
 *   red+!  — none connected;
 *   muted  — loading or no accounts registered.
 * Clicking opens Configurações → WhatsApp.
 */

const REFRESH_INTERVAL_MS = 60_000;

export function WhatsAppStatusButton() {
  const navigate = useNavigate();
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const provider = useWhatsAppAccountsProvider();
  const [accounts, setAccounts] = useState<IWhatsAppAccount[] | null>(null);

  const reload = useCallback(() => {
    provider
      .list({ storeId })
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [provider, storeId]);

  useEffect(() => {
    reload();
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval) return;
      interval = setInterval(reload, REFRESH_INTERVAL_MS);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        reload();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", reload);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", reload);
    };
  }, [reload]);

  const loading = accounts === null;
  const total = accounts?.length ?? 0;
  const connected = accounts?.filter((a) => a.status === "connected").length ?? 0;
  const allConnected = total > 0 && connected === total;
  const noneConnected = total > 0 && connected === 0;

  const label = loading
    ? "WhatsApp — verificando conexão"
    : total === 0
      ? "Nenhuma conta WhatsApp cadastrada"
      : noneConnected
        ? "WhatsApp desconectado — clique para reconectar"
        : allConnected
          ? `WhatsApp conectado (${connected} ${connected === 1 ? "conta" : "contas"})`
          : `WhatsApp parcial — ${connected} de ${total} contas conectadas`;

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
