import type { TourDef } from "../types";

export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function resolveTourForPath(pathname: string, tours: TourDef[]): TourDef | null {
  const path = normalizePath(pathname);
  const exact = tours.find((t) => t.route && normalizePath(t.route) === path);
  if (exact) return exact;
  const prefixed = tours.find((t) => t.matchPrefix && path.startsWith(t.matchPrefix));
  return prefixed ?? null;
}

export function shouldAutoStart(ctx: { optOut: boolean; seen: boolean }): boolean {
  return !ctx.optOut && !ctx.seen;
}
