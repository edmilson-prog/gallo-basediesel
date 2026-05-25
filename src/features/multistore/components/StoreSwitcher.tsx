import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useCurrentStore } from "../hooks/useCurrentStore";
import { StoreBadge } from "./StoreBadge";

const SHORT_NAME_MAX = 24;

function shortenName(name: string): string {
  if (name.length <= SHORT_NAME_MAX) return name;
  return `${name.slice(0, SHORT_NAME_MAX - 1).trimEnd()}…`;
}

/**
 * Active store selector that lives in the TopBar (PRD-003 → PRD-007).
 *
 * Displays the active store name with a type badge. Clicking opens a dropdown
 * of accessible stores. On the MVP only the matriz is accessible, so the
 * dropdown contains a single item and a discreet note pointing at Fase 2 —
 * the component stays visible to validate the UX and prepare the user for
 * future filials/parceiras.
 *
 * Hidden by callers (e.g. the public `<LojaHeader>`) when the active store
 * doesn't apply — customers browsing the storefront don't have one.
 *
 * @see ../MultistoreProvider.tsx
 */
export function StoreSwitcher({ className }: { className?: string }) {
  const { currentStore, accessibleStores, setCurrentStore, canSwitchStore, isHydrating } =
    useCurrentStore();

  if (isHydrating) {
    return (
      <div className={cn("hidden items-center gap-2 md:flex", className)}>
        <Skeleton className="h-9 w-44 rounded-md" />
      </div>
    );
  }

  if (!currentStore) return null;

  const shortName = shortenName(currentStore.name.replace("GALLO BASE DIESEL — ", "GALLO "));

  const handleSelect = (storeId: string) => {
    if (storeId === currentStore.id) return;
    setCurrentStore(storeId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Não foi possível trocar a loja ativa.";
      toast.error(message);
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Trocar loja ativa"
          className={cn(
            "hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors md:flex",
            canSwitchStore
              ? "hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              : "cursor-default",
            className,
          )}
        >
          <Icon icon="mdi:store" size={16} />
          <span className="font-medium text-foreground">{shortName}</span>
          <StoreBadge store={currentStore} className="ml-1" />
          <Icon
            icon={canSwitchStore ? "mdi:chevron-down" : "mdi:information-outline"}
            size={14}
            className="text-muted-foreground"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Loja ativa
        </DropdownMenuLabel>
        {accessibleStores.map((store) => {
          const isActive = store.id === currentStore.id;
          return (
            <DropdownMenuItem
              key={store.id}
              onSelect={() => handleSelect(store.id)}
              className="flex items-start gap-2"
            >
              <Icon
                icon={isActive ? "mdi:check-circle" : "mdi:circle-outline"}
                size={18}
                className={isActive ? "text-primary" : "text-muted-foreground"}
              />
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-sm font-medium text-foreground">
                  {shortenName(store.name.replace("GALLO BASE DIESEL — ", "GALLO "))}
                </span>
                <div className="flex items-center gap-2">
                  <StoreBadge store={store} />
                  <span className="truncate text-[11px] text-muted-foreground">{store.cnpj}</span>
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
        {!canSwitchStore && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <Icon icon="mdi:information-outline" size={12} className="mr-1 inline" />
              Filiais e parceiras serão habilitadas na Fase 2.
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
