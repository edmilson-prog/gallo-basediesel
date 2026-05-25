import type { ReactNode } from "react";

export interface IDetailLayoutProps {
  /** Left column: list. */
  listSlot?: ReactNode;
  /** Right column: detail of the selected item. */
  detailSlot?: ReactNode;
}

/**
 * Inner two-column layout for list + detail screens (Clientes, Catálogo).
 *
 *   ≥ 1024px:  List (360px) | Detail (1fr)
 *   < 1024px:  full-width list OR detail (route param decides)
 *
 * Assumes Sidebar + TopBar are provided by the parent route (`app.tsx`).
 */
export function DetailLayout({ listSlot, detailSlot }: IDetailLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <div className="hidden w-[360px] shrink-0 border-r border-border lg:flex lg:flex-col">
        {listSlot}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">{detailSlot}</div>
    </div>
  );
}
