import type { IKitItem, IPart, ID } from "@/shared/types";
import { Icon } from "@/components/Icon";

export interface IKitItemsPreviewProps {
  items: IKitItem[];
  partsById: Map<ID, IPart>;
}

export function KitItemsPreview({ items, partsById }: IKitItemsPreviewProps) {
  const baseCount = items.filter((i) => !i.isOptional).length;
  const optionalCount = items.filter((i) => i.isOptional).length;

  return (
    <div className="rounded-md bg-muted/50 p-3">
      <ul className="space-y-1">
        {items.map((item) => {
          const part = partsById.get(item.partId);
          const label = part?.name ?? (
            <span className="text-muted-foreground">
              {item.partId.length > 16 ? `${item.partId.slice(0, 16)}…` : item.partId}
            </span>
          );

          return (
            <li key={item.partId} className="flex items-center gap-1.5 text-sm">
              {item.isOptional ? (
                <Icon
                  icon="mdi:circle-outline"
                  size={8}
                  className="shrink-0 text-muted-foreground"
                />
              ) : (
                <Icon icon="mdi:circle" size={8} className="shrink-0 text-foreground" />
              )}
              <span className={item.isOptional ? "text-muted-foreground" : "text-foreground"}>
                {label}
              </span>
              {item.defaultQuantity > 1 && (
                <span className="text-muted-foreground">×{item.defaultQuantity}</span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Legend */}
      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-0.5">
          <Icon icon="mdi:circle" size={8} className="text-foreground" />
          {baseCount} base
        </span>
        <span>·</span>
        <span className="flex items-center gap-0.5">
          <Icon icon="mdi:circle-outline" size={8} className="text-muted-foreground" />
          {optionalCount} opcional
        </span>
      </p>
    </div>
  );
}
