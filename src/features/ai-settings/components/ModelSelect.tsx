import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { isModelPriceUndefined } from "@/providers/data/engine/aiCatalog";
import type { IAiModelOption } from "@/shared/types";

const COMBOBOX_THRESHOLD = 20;

function priceLabel(m: IAiModelOption): string {
  return isModelPriceUndefined(m)
    ? "preço a definir"
    : `entrada $${m.inputPricePer1kUsd}/1k · saída $${m.outputPricePer1kUsd}/1k`;
}

export function ModelSelect({
  models,
  value,
  onChange,
  disabled,
}: {
  models: IAiModelOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (models.length <= COMBOBOX_THRESHOLD) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} — {priceLabel(m)}
          </option>
        ))}
      </select>
    );
  }

  const current = models.find((m) => m.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{current ? current.label : value || "Selecione o modelo"}</span>
          <Icon icon="mdi:unfold-more-horizontal" className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar modelo…" />
          <CommandList>
            <CommandEmpty>Nenhum modelo encontrado.</CommandEmpty>
            <CommandGroup>
              {models.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.id} ${m.label}`}
                  onSelect={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{m.label}</span>
                    <span className="text-xs text-muted-foreground">{priceLabel(m)}</span>
                  </div>
                  {m.id === value && <Icon icon="mdi:check" className="ml-auto size-4 shrink-0" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
