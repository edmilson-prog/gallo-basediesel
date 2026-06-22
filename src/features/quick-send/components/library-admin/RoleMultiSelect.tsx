/**
 * RoleMultiSelect — searchable multi-select for IAssetLibraryItem.allowedRoleIds.
 *
 * Mirrors the DepartmentManager house pattern: Popover + Command (cmdk) for
 * searchable list with checkmarks; selected roles render as removable Badges
 * above the trigger. Controlled via value/onChange.
 *
 * House pattern reference: src/features/people/components/DepartmentManager.tsx
 * (sellerIds multi-select, lines ~501–570).
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IRole } from "@/shared/types";
import { useRolesProvider } from "@/providers/data";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Icon } from "@/components/Icon";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

const L = QUICK_SEND_STRINGS.library;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface IRoleMultiSelectProps {
  value: string[]; // role ids (allowedRoleIds)
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RoleMultiSelect({ value, onChange, disabled = false }: IRoleMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const rolesProvider = useRolesProvider();
  const { data: roles = [], isLoading } = useQuery<IRole[]>({
    queryKey: ["roles", "list"],
    queryFn: () => rolesProvider.list(),
  });

  // Toggle a single role id in/out of the selection
  function toggleRole(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  // Remove a role by id (used by badge ×)
  function removeRole(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  const hasSelection = value.length > 0;

  return (
    <div className="space-y-2">
      {/* Removable badges for selected roles */}
      {hasSelection && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const role = roles.find((r) => r.id === id);
            if (!role) return null;
            return (
              <Badge key={id} variant="secondary" className="gap-1">
                {role.name}
                <button
                  type="button"
                  aria-label={`Remover ${role.name}`}
                  className="ml-0.5 cursor-pointer rounded-full hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => removeRole(id)}
                  disabled={disabled}
                >
                  <Icon icon="mdi:close" size={12} />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Popover + Command (searchable list) */}
      <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={L.fieldRoles}
            disabled={disabled || isLoading}
            className={cn(
              "w-full justify-between font-normal",
              !hasSelection && "text-muted-foreground",
            )}
          >
            <span>
              {hasSelection
                ? `${value.length} papel${value.length === 1 ? "" : "s"} selecionado${value.length === 1 ? "" : "s"}`
                : L.fieldRoles}
            </span>
            <Icon icon="mdi:unfold-more-horizontal" size={16} className="ml-2 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar papel…" />
            <CommandList>
              <CommandEmpty>Nenhum papel encontrado.</CommandEmpty>
              <CommandGroup>
                {roles.map((role) => {
                  const checked = value.includes(role.id);
                  return (
                    <CommandItem
                      key={role.id}
                      value={`${role.name} ${role.id}`}
                      onSelect={() => toggleRole(role.id)}
                      className="gap-2 cursor-pointer"
                    >
                      <Checkbox checked={checked} className="pointer-events-none" />
                      <span className="truncate">{role.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>

            {hasSelection && (
              <div className="border-t border-border p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    onChange([]);
                    setOpen(false);
                  }}
                >
                  Limpar seleção
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      {/* Help text */}
      <p className="text-xs text-muted-foreground">{L.rolesHint}</p>
    </div>
  );
}
