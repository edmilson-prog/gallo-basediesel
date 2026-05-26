import type { IConversation, ID } from "@/shared/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { CustomerProfile } from "./CustomerProfile";
import { useFicheLayout } from "../hooks/useFicheLayout";

export interface ICustomerProfileFicheProps {
  customerId: ID;
  conversation: IConversation;
  /** Drawer open state from `useConversationFiche()`. */
  open: boolean;
  /** Drawer close handler. */
  onOpenChange: (open: boolean) => void;
}

/**
 * Responsive wrapper that renders the customer profile next to the
 * conversation viewer.
 *
 * Three behaviors share the same `<CustomerProfile>` body:
 *  - **column mode** (≥ 1280px): the profile is always mounted as a fixed
 *    360px sidebar; `open` collapses it visually but doesn't unmount —
 *    keeping the React Query cache warm so toggling back is instant.
 *  - **drawer mode** (768–1279): a Sheet slides in from the right when
 *    `open` is true.
 *  - **route mode** (< 768): the component renders nothing — the header
 *    button's onClick should navigate to `/app/clientes/:id` instead
 *    (handled by `useFicheButtonHandler` below).
 */
export function CustomerProfileFiche({
  customerId,
  conversation,
  open,
  onOpenChange,
}: ICustomerProfileFicheProps) {
  const mode = useFicheLayout();

  if (mode === "route") return null;

  if (mode === "drawer") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full max-w-sm overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>Ficha do cliente</SheetTitle>
          </SheetHeader>
          <CustomerProfile
            customerId={customerId}
            conversation={conversation}
            variant="column"
            className="h-full border-l-0"
          />
        </SheetContent>
      </Sheet>
    );
  }

  // column mode
  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 transition-[width] duration-200 ease-in-out xl:block",
        open ? "w-[360px]" : "w-0 overflow-hidden",
      )}
      aria-hidden={!open}
    >
      {open && (
        <CustomerProfile
          customerId={customerId}
          conversation={conversation}
          variant="column"
          className="h-full"
        />
      )}
    </aside>
  );
}
