import type { ReactNode } from "react";

/**
 * Inner container for management/BI dashboards.
 * Just a centered max-width wrapper — assumes Sidebar + TopBar come from
 * the parent route (`app.tsx`).
 */
export function DashboardLayout({ children }: { children?: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-8">{children}</div>;
}
