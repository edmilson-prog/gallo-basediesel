import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IWhatsAppAccount } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { useWhatsAppAccountsProvider } from "@/providers/data";

/**
 * Header WhatsApp connection indicator.
 *
 * Shows a WhatsApp icon with a status dot derived from the current store's
 * accounts: online (green, pulsing) when at least one account is connected,
 * offline (muted, static) otherwise. Clicking opens the WhatsApp settings page.
 *
 * Phase 1: reads the mock accounts via the provider; no live socket yet.
 */
export function WhatsAppStatusButton() {
  const navigate = useNavigate();
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
  const provider = useWhatsAppAccountsProvider();
  const [accounts, setAccounts] = useState<IWhatsAppAccount[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    provider
      .list({ storeId })
      .then((list) => {
        if (!cancelled) setAccounts(list);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, storeId]);

  const loading = accounts === null;
  const online = !loading && accounts.some((a) => a.status === "connected");
  const label = loading
    ? "WhatsApp — verificando conexão"
    : online
      ? "WhatsApp conectado"
      : "WhatsApp desconectado";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={() => void navigate({ to: "/app/configuracoes/whatsapp" })}
      aria-label={label}
      title={label}
    >
      <Icon icon="mdi:whatsapp" size={20} />
      <span className="absolute right-1.5 top-1.5 flex size-2">
        {online && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-severity-success opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full ring-2 ring-background",
            online ? "bg-severity-success" : "bg-muted-foreground/60",
          )}
        />
      </span>
    </Button>
  );
}
