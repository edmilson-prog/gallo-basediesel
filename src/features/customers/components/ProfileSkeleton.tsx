import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface IProfileSkeletonProps {
  variant: "column" | "page";
  className?: string;
}

/**
 * Initial loading placeholder for the customer profile. Mirrors the rough
 * anatomy of the loaded state (avatar + name + badges + tabs + body) so the
 * layout doesn't jump when the data arrives.
 */
export function ProfileSkeleton({ variant, className }: IProfileSkeletonProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-card",
        variant === "column" && "border-l border-border",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      {/* Header */}
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-1.5">
              <Skeleton className="h-4 w-12 rounded-full" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-7 w-7" />
          <Skeleton className="h-7 flex-1" />
          <Skeleton className="h-7 w-7" />
        </div>
      </div>

      {/* Tabs strip */}
      <div className="flex gap-1.5 border-b border-border px-3 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-16 rounded" />
        ))}
      </div>

      {/* Body cards */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
      </div>
    </div>
  );
}
