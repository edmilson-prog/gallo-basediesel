import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic skeleton used as `<Suspense>` fallback during lazy route loads.
 * Respects `prefers-reduced-motion` by setting `animate-none` when needed.
 */
export function RouteSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6 motion-reduce:[&_*]:animate-none">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-1/2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </div>
  );
}
