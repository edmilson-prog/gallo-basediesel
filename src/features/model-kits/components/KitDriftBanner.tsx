// src/features/model-kits/components/KitDriftBanner.tsx
import { useState } from "react";
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";

interface KitDriftBannerProps {
  parts: IPart[];
  onAdd: (part: IPart) => void;
}

export function KitDriftBanner({ parts, onAdd }: KitDriftBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (parts.length === 0 || dismissed) return null;

  const count = parts.length;
  const label =
    count === 1
      ? "1 peça compatível com este modelo está fora deste kit."
      : `${count} peças compatíveis com este modelo estão fora deste kit.`;

  return (
    <div className="rounded-md border border-border bg-muted/50 p-3">
      <div className="flex items-start gap-2">
        <Icon
          icon="mdi:information-outline"
          size={16}
          className="mt-0.5 shrink-0 text-muted-foreground"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm text-muted-foreground">{label}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-1 py-0 text-sm text-muted-foreground underline-offset-4 hover:underline"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Ocultar peças ▴" : "Ver peças ▾"}
            </Button>
          </div>

          {expanded && (
            <ul className="mt-2 space-y-1.5">
              {parts.map((part) => (
                <li
                  key={part.id}
                  className="flex items-center justify-between gap-2 rounded-sm px-1"
                >
                  <span className="text-sm text-muted-foreground truncate">
                    <span className="text-foreground font-medium">{part.name}</span>
                    {part.sku && <span className="ml-1.5 text-xs opacity-70">#{part.sku}</span>}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => onAdd(part)}
                  >
                    <Icon icon="mdi:plus" size={14} className="mr-1" />
                    Adicionar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Ocultar"
          className="h-6 w-6 shrink-0 p-0 text-muted-foreground"
          onClick={() => setDismissed(true)}
        >
          <Icon icon="mdi:close" size={14} />
        </Button>
      </div>
    </div>
  );
}
