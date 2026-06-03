// src/features/quotes/components/new/items/KitPicker.tsx
import { useState } from "react";
import type { IServiceKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface IKitPickerProps {
  kits: IServiceKit[];
  onAddKit: (kit: IServiceKit) => void;
}

export function KitPicker({ kits, onAddKit }: IKitPickerProps) {
  const [open, setOpen] = useState(false);
  if (kits.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Icon icon="mdi:toolbox-outline" size={16} />
          Kit de revisão
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          Inserir um kit adiciona todas as peças dele de uma vez
        </p>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {kits.map((kit) => (
            <li key={kit.id}>
              <button
                type="button"
                onClick={() => {
                  onAddKit(kit);
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
                    {kit.vehicleApplication
                      ? ` · ${kit.vehicleApplication.brand} ${kit.vehicleApplication.model}`
                      : ""}
                  </span>
                </span>
                <Icon icon="mdi:plus" size={16} className="shrink-0 text-primary" />
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
