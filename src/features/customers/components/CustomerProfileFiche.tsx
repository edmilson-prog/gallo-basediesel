import type { IConversation, ID, ISeller, IWhatsAppAccount } from "@/shared/types";
import type { ICollaboratorWithSeller } from "@/features/conversations/hooks/useConversationDetail";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { CustomerProfile } from "./CustomerProfile";
import { useFicheLayout } from "../hooks/useFicheLayout";

export interface ICustomerProfileFicheProps {
  customerId: ID;
  conversation: IConversation;
  /** Resolved from conversation.assignedSellerId by the caller — feeds the Atendimento tab. */
  assignedSeller?: ISeller | null;
  /** Resolved from conversation.whatsappAccountId by the caller — feeds the Atendimento tab. */
  whatsappAccount?: IWhatsAppAccount | null;
  /** Resolved from useConversationDetail by the caller — feeds the Atendimento tab. */
  collaborators?: ICollaboratorWithSeller[];
  /** Bubbles a StatusControl change up to the caller's conversation refresh. */
  onConversationChanged?: () => void;
  /** Drawer open state from `useConversationFiche()`. */
  open: boolean;
  /** Drawer close handler. */
  onOpenChange: (open: boolean) => void;
  /** Optional "Copiloto" tab content injected by the conversation screen (PRD-025). */
  copilotTab?: React.ReactNode;
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
  assignedSeller,
  whatsappAccount,
  collaborators,
  onConversationChanged,
  open,
  onOpenChange,
  copilotTab,
}: ICustomerProfileFicheProps) {
  const mode = useFicheLayout();

  if (mode === "route") return null;

  if (mode === "drawer") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full max-w-sm overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>Ficha do cliente</SheetTitle>
            <SheetDescription>
              Dados cadastrais, status, carteira e histórico do cliente.
            </SheetDescription>
          </SheetHeader>
          <CustomerProfile
            customerId={customerId}
            conversation={conversation}
            assignedSeller={assignedSeller}
            whatsappAccount={whatsappAccount}
            collaborators={collaborators}
            onConversationChanged={onConversationChanged}
            defaultTab="atendimento"
            variant="column"
            className="h-full border-l-0"
            copilotTab={copilotTab}
          />
        </SheetContent>
      </Sheet>
    );
  }

  // column mode
  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 transition-[width] duration-200 ease-in-out min-[1440px]:block",
        open ? "w-[360px]" : "w-0 overflow-hidden",
      )}
      aria-hidden={!open}
    >
      {open && (
        <CustomerProfile
          customerId={customerId}
          conversation={conversation}
          assignedSeller={assignedSeller}
          whatsappAccount={whatsappAccount}
          collaborators={collaborators}
          onConversationChanged={onConversationChanged}
          defaultTab="atendimento"
          variant="column"
          className="h-full"
          copilotTab={copilotTab}
        />
      )}
    </aside>
  );
}
