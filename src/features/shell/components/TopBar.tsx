import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/features/auth/useAuth";
import { StoreSwitcher } from "@/features/multistore";
import { AvailabilityToggle } from "@/features/distribution/components/AvailabilityToggle";
import { useEcommerceNotificationStore } from "@/features/ecommerce-integration";
import { formatBRL } from "@/shared/utils/format";

const MOCK_NOTIFICATIONS = [
  {
    id: "n1",
    title: "Cliente respondeu",
    description: "Transportadora Aurora respondeu uma cotação.",
    time: "há 5 min",
  },
  {
    id: "n2",
    title: "Meta atingida",
    description: "Você bateu 95% da meta de positivação do mês.",
    time: "há 1 h",
  },
  {
    id: "n3",
    title: "Estoque crítico",
    description: "Filtro de óleo Volvo D13K está em ruptura.",
    time: "há 3 h",
  },
];

export function TopBar() {
  const { currentUser, signOut } = useAuth();
  const navigate = useNavigate();

  // PRD-067 — surface e-commerce order notifications routed to this user.
  const ecomNotifications = useEcommerceNotificationStore((s) => s.notifications);
  const sellerId = currentUser?.sellerId ?? null;
  const canDistribute = currentUser?.role === "Owner" || currentUser?.role === "Gestor";
  const relevantEcom = ecomNotifications
    .filter((n) =>
      n.kind === "pending_distribution"
        ? canDistribute
        : n.sellerId !== null && n.sellerId === sellerId,
    )
    .slice(0, 8);
  const notificationCount = MOCK_NOTIFICATIONS.length + relevantEcom.length;

  const handleSwitchProfile = () => {
    signOut();
    void navigate({ to: "/auth/login" });
  };

  return (
    <header className="flex h-16 items-center gap-3 border-b border-border bg-background px-4">
      {/* Mobile compact logo (visible only when sidebar hidden) */}
      <div className="md:hidden">
        <Logo variant="mark" className="h-7 w-7" />
      </div>

      {/* Active store selector (PRD-007). Reactive — drives every list query
          via withStoreScope and persists the choice in localStorage. */}
      <StoreSwitcher />

      {/* Global search placeholder */}
      <div className="hidden flex-1 max-w-xl md:block">
        <div className="relative">
          <Icon
            icon="mdi:magnify"
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            placeholder="Buscar clientes, peças, pedidos…"
            className="pl-9"
            aria-label="Busca global"
          />
        </div>
      </div>

      {/* Mobile search button */}
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buscar">
        <Icon icon="mdi:magnify" size={20} />
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Notificações" className="relative">
              <Icon icon="mdi:bell-outline" size={20} />
              <Badge
                variant="default"
                className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[10px]"
              >
                {notificationCount}
              </Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">
              Notificações
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {relevantEcom.map((n) => (
                <li
                  key={n.id}
                  className="cursor-pointer border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/50"
                  onClick={() =>
                    void navigate({ to: "/app/pedidos/$id", params: { id: n.orderId } })
                  }
                >
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Icon icon="mdi:cart" size={14} className="text-primary" aria-hidden />
                    {n.kind === "pending_distribution"
                      ? "Pedido e-commerce a distribuir"
                      : "Novo pedido via e-commerce"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {n.customerName} — {formatBRL(n.total)} — {n.orderNumber}
                  </p>
                </li>
              ))}
              {MOCK_NOTIFICATIONS.map((n) => (
                <li
                  key={n.id}
                  className="border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/50"
                >
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.description}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{n.time}</p>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

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
