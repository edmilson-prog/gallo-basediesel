import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface IConversationLayoutProps {
  /** Left column: conversation list. */
  listSlot?: ReactNode;
  /** Middle column: selected conversation. */
  conversationSlot?: ReactNode;
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
 * Inner two-column layout used inside `<AppLayout>` for /app/atendimento.
 *
 * Anatomia:
 *   ≥ 768px:  List (320px) | Conversation (1fr)
 *   < 768px:  `mobileShow` decides which single column is visible
 *
 * The customer fiche is owned by `ConversationPage` itself (responsive
 * column/drawer/route via `useFicheLayout`), toggled from the conversation
 * header — so this layout renders no fiche slot of its own.
 *
 * Assumes Sidebar + TopBar are provided by the parent route (`app.tsx`).
 */
export function ConversationLayout({
  listSlot,
  conversationSlot,
  mobileShow = "conversation",
}: IConversationLayoutProps) {
  const showListOnMobile = mobileShow === "list";

  // Fill <main> minus the sticky TopBar (4rem) and, on desktop, the AppFooter
  // (2rem) — same `md:h-[calc(100vh-6rem)]` convention the list pages use.
  // Otherwise <main> overflows by the footer height and shows a phantom outer
  // scrollbar beside the panels' own scrollbars.
  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden md:h-[calc(100vh-6rem)]">
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
        <div className="min-h-0 flex-1 overflow-hidden">{conversationSlot}</div>
      </div>
    </div>
  );
}
