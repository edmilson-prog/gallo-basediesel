import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { getCategoryDescriptor, type IPartCategoryDescriptor } from "../utils/categories";

export interface IPartImageProps {
  part: Pick<IPart, "category" | "imageUrl" | "name">;
  size?: keyof typeof SIZE_MAP;
  className?: string;
  /**
   * Live taxonomy, for callers inside the app. Omitted on the public storefront,
   * which is anonymous and cannot read the store-scoped category table — there
   * the built-in families answer and a custom family falls back to the cube.
   */
  descriptors?: readonly IPartCategoryDescriptor[];
}

const SIZE_MAP = {
  sm: { box: "h-10 w-10 rounded-md", icon: 22 },
  md: { box: "h-14 w-14 rounded-lg", icon: 28 },
  /** Identity card thumbnail from the catalog design kit (96px). */
  detail: { box: "h-24 w-24 rounded-xl", icon: 44 },
  lg: { box: "h-32 w-32 rounded-xl", icon: 64 },
} as const;

export function PartImage({ part, size = "sm", className, descriptors }: IPartImageProps) {
  const descriptor = getCategoryDescriptor(part.category, descriptors);
  const dims = SIZE_MAP[size];

  if (part.imageUrl) {
    return (
      <img
        src={part.imageUrl}
        alt={part.name}
        className={cn(dims.box, "object-cover", className)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={part.name}
      className={cn(
        dims.box,
        "grid place-items-center",
        descriptor?.tone ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon icon={descriptor?.icon ?? "mdi:cube-outline"} size={dims.icon} />
    </div>
  );
}
