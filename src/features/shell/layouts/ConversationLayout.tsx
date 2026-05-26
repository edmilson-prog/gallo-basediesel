import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface IConversationLayoutProps {
  /** Left column: conversation list. */
  listSlot?: ReactNode;
  /** Middle column: selected conversation. */
  conversationSlot?: ReactNode;
  /** Right column / drawer: customer fiche. */
  ficheSlot?: ReactNode;
  /** Default open state of the fiche drawer (md viewport). */
  ficheDefaultOpen?: boolean;
  /**
   * Which slot owns the screen on mobile (< md).
   *
   * - `"list"`   — full-width list, conversation column hidden
   * - `"conversation"` — full-width conversation, list hidden
   *
   * Defaults to `"conversation"` to preserve the original behavior of this
   * layout. The inbox page (PRD-010) sets `"list"` at the index route so the
   * vendor can browse the queue on a phone.
   */
  mobileShow?: "list" | "conversation";
}

/**
 * Inner three-column layout used inside `<AppLayout>` for /app/atendimento.
 *
 * Anatomia:
 *   ≥ 1280px:  List (320px) | Conversation (1fr) | Fiche (sticky 360px)
 *   768-1279:  List (320px) | Conversation (1fr); Fiche becomes a Sheet
 *   < 768px:   `mobileShow` decides which single column is visible
 *
 * Assumes Sidebar + TopBar are provided by the parent route (`app.tsx`).
 */
export function ConversationLayout({
  listSlot,
  conversationSlot,
  ficheSlot,
  ficheDefaultOpen = false,
  mobileShow = "conversation",
}: IConversationLayoutProps) {
  const [ficheOpen, setFicheOpen] = useState(ficheDefaultOpen);
  const showListOnMobile = mobileShow === "list";

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* List column */}
      <div
        className={cn(
          "w-full shrink-0 border-r border-border md:flex md:w-80 md:flex-col",
          showListOnMobile ? "flex flex-col" : "hidden",
        )}
      >
        {listSlot}
      </div>
      {/* Conversation column */}
      <div className={cn("min-w-0 flex-1 flex-col md:flex", showListOnMobile ? "hidden" : "flex")}>
        <div className="flex items-center justify-end border-b border-border px-3 py-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFicheOpen((o) => !o)}
            className="gap-2"
          >
            <Icon icon="mdi:account-details" size={16} />
            Ficha
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{conversationSlot}</div>
      </div>
      {/* Fiche column / drawer */}
      <aside
        className={cn(
          "hidden border-l border-border bg-card transition-[width] duration-200 xl:block",
          ficheOpen ? "w-[360px]" : "w-0 overflow-hidden",
        )}
        aria-hidden={!ficheOpen}
      >
        {ficheOpen && <div className="h-full w-[360px] overflow-y-auto">{ficheSlot}</div>}
      </aside>
      <Sheet open={ficheOpen} onOpenChange={setFicheOpen}>
        <SheetContent side="right" className="w-[360px] p-0 xl:hidden">
          {ficheSlot}
        </SheetContent>
      </Sheet>
    </div>
  );
}
