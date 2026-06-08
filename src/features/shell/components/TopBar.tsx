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
import { useAuth } from "@/features/auth/useAuth";
import { GlobalSearch } from "@/features/shell/components/GlobalSearch";
import { StoreSwitcher, useCurrentStore } from "@/features/multistore";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { AvailabilityToggle } from "@/features/distribution/components/AvailabilityToggle";
import { NotificationDropdown } from "@/features/notifications/components/NotificationDropdown";
import { WhatsAppStatusButton } from "@/features/shell/components/WhatsAppStatusButton";
import { ROUTES } from "@/features/shell/config/routes";

export function TopBar() {
  const { currentUser, signOut } = useAuth();
  const navigate = useNavigate();

  // Analytics copilot (PRD-057). Gated by the per-store platform setting
  // (default on when undefined). Opened via the TopBar button or Ctrl/Cmd+K.
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 px-4 shadow-sm backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/65">
      {/* Mobile compact logo (visible only when sidebar hidden) */}
      <div className="md:hidden">
        <Logo variant="mark" className="h-7 w-7" />
      </div>

      {/* Active store selector (PRD-007). Reactive — drives every list query
          via withStoreScope and persists the choice in localStorage. */}
      <StoreSwitcher />

      {/* Global search — dynamic width + "/" keyboard activation */}
      <GlobalSearch />

      {/* Mobile search button */}
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buscar">
        <Icon icon="mdi:magnify" size={20} />
      </Button>

      <div className="ml-auto flex items-center gap-1">
        {/* WhatsApp connection indicator — online/offline status per store. */}
        <WhatsAppStatusButton />

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
              <div className="flex flex-col">
                <span className="font-semibold">{currentUser?.displayName ?? "—"}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {currentUser?.role} · {currentUser?.storeLabel}
                </span>
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
    </header>
  );
}
