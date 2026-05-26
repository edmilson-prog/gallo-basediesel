import { Skeleton } from "@/components/ui/skeleton";

export interface ITabSkeletonProps {
  /** Number of placeholder rows to render. Default 4. */
  rows?: number;
  /** Height of each row in tailwind units (h-N). Default `h-14`. */
  rowHeight?: string;
}

/** Per-tab loading state — used while the lazy data fetch resolves. */
export function TabSkeleton({ rows = 4, rowHeight = "h-14" }: ITabSkeletonProps) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`w-full ${rowHeight} rounded-md`} />
      ))}
    </div>
  );
}
