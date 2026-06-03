import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { getBrandIcon } from "../utils/brandIcon";

export function BrandAvatar({ brand, className }: { brand: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground",
        className,
      )}
    >
      <Icon icon={getBrandIcon(brand)} size={20} />
    </span>
  );
}
