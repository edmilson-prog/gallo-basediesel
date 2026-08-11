// src/features/quotes/components/new/items/KitPicker.tsx
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IVehicleModelKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePermission } from "@/features/rbac/hooks/usePermission";

export interface IKitPickerProps {
  kits: IVehicleModelKit[];
  onPickKit: (kit: IVehicleModelKit) => void;
  /** True while the kit list is still being fetched. */
  loading?: boolean;
}

/**
 * "Kits" button in the items header — always present, as the UI kit specifies.
 *
 * It used to unmount itself when the store had no kits, which meant the whole
 * feature was invisible in production (zero `model_kits`): no button, and no
 * suggestion banner either, since that one needs an official kit to match the
 * customer's fleet. The button now stays and explains the empty state, sending
 * whoever can manage models to the screen that fills it.
 */
export function KitPicker({ kits, onPickKit, loading = false }: IKitPickerProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const canManageModels = usePermission("vehicleModel", "view");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Icon icon="mdi:air-filter" size={15} />
          Kits
          {kits.length > 0 && (
            <span className="ml-0.5 rounded bg-muted px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {kits.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {loading ? (
          <p className="flex items-center gap-1.5 px-3 py-4 text-xs text-muted-foreground">
            <Icon
              icon="mdi:loading"
              size={13}
              className="animate-spin motion-reduce:animate-none"
            />
            Carregando kits…
          </p>
        ) : kits.length === 0 ? (
          <div className="px-3 py-3.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Icon icon="mdi:air-filter" size={15} className="text-muted-foreground" />
              Nenhum kit cadastrado
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Kits reúnem as peças de uma revisão — filtros, óleo, reparo — para entrar no orçamento
              de uma vez. Quando um kit oficial combina com o veículo do cliente, ele ainda é
              sugerido sozinho aqui.
            </p>
            {canManageModels && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => {
                  setOpen(false);
                  void navigate({ to: "/app/kits" });
                }}
              >
                <Icon icon="mdi:plus" size={15} />
                Criar kit por modelo
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              Pré-visualizar e aplicar um kit
            </p>
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {kits.map((kit) => (
                <li key={kit.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPickKit(kit);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {kit.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {kit.items.length} {kit.items.length === 1 ? "peça" : "peças"}
                        {kit.category ? ` · ${kit.category}` : ""}
                      </span>
                    </span>
                    <Icon icon="mdi:eye-outline" size={16} className="shrink-0 text-primary" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
