import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth/useAuth";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import { getActiveDataSource } from "@/providers/data";
import { presetOf } from "@/shared/lib/environmentMode";
import { StoreSwitcher, useCurrentStore } from "@/features/multistore";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { AvailabilityToggle } from "@/features/distribution/components/AvailabilityToggle";
import { NotificationDropdown } from "@/features/notifications/components/NotificationDropdown";
import { WhatsAppStatusButton } from "@/features/shell/components/WhatsAppStatusButton";
import { InboxUnreadBadgeIcon, SoundAlertToggle } from "@/features/inbox-alerts";
import { IdlePendingChip } from "@/features/idle-alerts";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { ROUTES } from "@/features/shell/config/routes";
import { TourHelpButton } from "@/features/tour";

export function TopBar() {
  const { currentUser, signOut } = useAuth();
  const navigate = useNavigate();

  // Analytics copilot (PRD-057). Gated by the per-store platform setting
  // (default on when undefined). Opened via the TopBar button or Ctrl/Cmd+K.
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { settings } = usePlatformSettings(storeId);
  const copilotEnabled = settings?.analyticsCopilotEnabled !== false;

  useEffect(() => {
    if (!copilotEnabled) return;
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      void navigate({ to: ROUTES.GESTAO_COPILOTO });
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [copilotEnabled, navigate]);

  const handleSwitchProfile = () => {
    signOut();
    void navigate({ to: "/auth/login" });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/40 bg-background/85 px-4 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-foreground/15 before:to-transparent">
      {/* Mobile compact logo (visible only when sidebar hidden) */}
      <div className="md:hidden">
        <Logo variant="mark" className="h-7 w-7" />
      </div>

      {/* Active store selector (PRD-007). Reactive — drives every list query
          via withStoreScope and persists the choice in localStorage. */}
      <StoreSwitcher />

      <div className="ml-auto flex items-center gap-1">
        {/* WhatsApp connection indicator — online/offline status per store. */}
        <WhatsAppStatusButton />

        <InboxUnreadBadgeIcon />

        <IdlePendingChip />

        <SoundAlertToggle />

        {/* Analytics copilot entry point (PRD-057). Hidden when disabled per store. */}
        {copilotEnabled && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void navigate({ to: ROUTES.GESTAO_COPILOTO })}
            aria-label="Copiloto analítico"
            title="Copiloto (Ctrl+K)"
          >
            <Icon icon="mdi:robot-happy-outline" size={20} />
          </Button>
        )}

        {/* TODO(PRD-067 ↔ PRD-008): live e-commerce orders (triggerEcommerceOrder → useEcommerceNotificationStore) aren't emitted onto notificationBus yet, so only seeded order notifications appear here. They still toast via useEcommerceSellerNotifier. */}
        <NotificationDropdown />

        <TourHelpButton />

        <ThemeSwitcher />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-1 flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Menu do usuário"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {currentUser?.avatarInitials ?? "?"}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-1.5">
                <span className="font-semibold">{currentUser?.displayName ?? "—"}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {currentUser?.role} · {currentUser?.storeLabel}
                </span>
                <EnvironmentBadge />
              </div>
            </DropdownMenuLabel>
            {currentUser?.sellerId && (
              <>
                <DropdownMenuSeparator />
                <AvailabilityToggle sellerId={currentUser.sellerId} />
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void navigate({ to: "/app/configuracoes/perfil" })}>
              <Icon icon="mdi:account" size={16} className="mr-2" />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void navigate({ to: "/app/configuracoes" })}>
              <Icon icon="mdi:cog-outline" size={16} className="mr-2" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleSwitchProfile}>
              <Icon icon="mdi:account-switch" size={16} className="mr-2" />
              Trocar perfil
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleSwitchProfile} className="text-destructive">
              <Icon icon="mdi:logout" size={16} className="mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Scroll progress line riding the bottom edge of the glass header. */}
      <ScrollProgressBar />
    </header>
  );
}

/** Quiet reminder of the running environment mode inside the user menu. */
function EnvironmentBadge() {
  const preset = presetOf(getActiveDataSource(), AUTH_SOURCE);
  if (preset === "production") {
    return (
      <Badge
        variant="outline"
        className="w-fit border-severity-success/30 bg-severity-success/10 font-normal text-severity-success"
      >
        <Icon icon="mdi:rocket-launch-outline" size={12} className="mr-1" />
        Produção
      </Badge>
    );
  }
  if (preset === "demo") {
    return (
      <Badge
        variant="outline"
        className="w-fit border-severity-info/30 bg-severity-info/10 font-normal text-severity-info"
      >
        <Icon icon="mdi:flask-outline" size={12} className="mr-1" />
        Demonstração
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="w-fit border-severity-warning/30 bg-severity-warning/10 font-normal text-severity-warning"
    >
      <Icon icon="mdi:tune-variant" size={12} className="mr-1" />
      Personalizado
    </Badge>
  );
}
