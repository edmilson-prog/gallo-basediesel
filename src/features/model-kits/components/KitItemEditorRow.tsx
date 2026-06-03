// src/features/model-kits/components/KitItemEditorRow.tsx
import { useState } from "react";
import type { IKitItem, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export interface IKitItemEditorRowProps {
  item: IKitItem;
  part: IPart | undefined;
  onPatch: (patch: Partial<IKitItem>) => void;
  onRemove: () => void;
}

export function KitItemEditorRow({ item, part, onPatch, onRemove }: IKitItemEditorRowProps) {
  const [noteOpen, setNoteOpen] = useState(Boolean(item.note));

  function decrease() {
    const next = Math.max(1, item.defaultQuantity - 1);
    if (next !== item.defaultQuantity) onPatch({ defaultQuantity: next });
  }

  function increase() {
    onPatch({ defaultQuantity: item.defaultQuantity + 1 });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      {/* Top row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Optional/base marker */}
        <Icon
          icon={item.isOptional ? "mdi:circle-outline" : "mdi:circle"}
          size={16}
          className={
            item.isOptional ? "shrink-0 text-muted-foreground" : "shrink-0 text-foreground"
          }
          aria-hidden
        />

        {/* Part name */}
        <span className="flex-1 truncate text-sm font-medium text-foreground">
          {part?.name ?? item.partId}
        </span>

        {/* Stepper */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            className="size-9 p-0"
            aria-label="Diminuir quantidade"
            onClick={decrease}
          >
            <Icon icon="mdi:minus" size={16} />
          </Button>
          <span
            aria-live="polite"
            aria-label={`Quantidade: ${item.defaultQuantity}`}
            className="w-8 text-center text-sm tabular-nums"
          >
            {item.defaultQuantity}
          </span>
          <Button
            type="button"
            variant="outline"
            className="size-9 p-0"
            aria-label="Aumentar quantidade"
            onClick={increase}
          >
            <Icon icon="mdi:plus" size={16} />
          </Button>
        </div>

        {/* Base / Opcional switch */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Base / Opcional</span>
          <Switch
            checked={item.isOptional}
            onCheckedChange={(v) => onPatch({ isOptional: v })}
            aria-label="Item opcional"
          />
        </div>

        {/* Remove */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 text-muted-foreground hover:text-destructive"
          aria-label="Remover item"
          onClick={onRemove}
        >
          <Icon icon="mdi:trash-can-outline" size={16} />
        </Button>
      </div>

      {/* Collapsible note */}
      <div>
        {item.note && !noteOpen ? (
          <p className="pl-6 text-sm text-muted-foreground">{item.note}</p>
        ) : null}

        {noteOpen ? (
          <Input
            placeholder="Nota (ex.: trocar a cada 30.000 km)"
            value={item.note ?? ""}
            onChange={(e) => onPatch({ note: e.target.value })}
            className="mt-1 text-sm"
            maxLength={140}
          />
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="pl-6 text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            ▸ Nota
          </button>
        )}
      </div>
    </div>
  );
}
