import type {
  IConversation,
  IConversationContact,
  ILead,
  ISeller,
  IWhatsAppAccount,
} from "@/shared/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
// Reuses the customer fiche's breakpoint hook as the single source of truth
// (column ≥1280 / drawer 768–1279 / route <768 — identical thresholds).
import { useFicheLayout } from "@/features/customers/hooks/useFicheLayout";
import type { ICollaboratorWithSeller } from "@/features/conversations/hooks/useConversationDetail";
import { LeadPanelBody } from "./panel/LeadPanelBody";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.fiche;

export interface ILeadProfileFicheProps {
  /** Lead resolved via the conversation-gated RPC — null falls back to `contact`. */
  lead: ILead | null;
  /** Pool-safe contact from `conversation_contacts` — feeds the degraded card. */
  contact: IConversationContact | null;
  /** The anchoring conversation — feeds the direct-read predicate of "Ver lead". */
  conversation: IConversation;
  /** Resolved from conversation.assignedSellerId by the caller — feeds the registry card. */
  assignedSeller?: ISeller | null;
  /** Resolved from conversation.whatsappAccountId by the caller — feeds the registry card. */
  whatsappAccount?: IWhatsAppAccount | null;
  /** Resolved from useConversationDetail by the caller — feeds the registry card. */
  collaborators?: ICollaboratorWithSeller[];
  /** Drawer open state from `useConversationFiche()`. */
  open: boolean;
  /** Drawer close handler. */
  onOpenChange: (open: boolean) => void;
  /** Called after a successful lead→customer conversion (caller refreshes the detail). */
  onConverted?: () => void;
  /** Bubbles a status/tag/collaborator/lead change up so the caller can refresh. */
  onConversationChanged?: () => void;
  /** The rail's "Mídias" entry — handed to the screen's own media panel. */
  onOpenMedia?: () => void;
}

/**
 * Lateral panel for LEAD-anchored conversations, rebuilt from
 * `ui_kits/atendimento/painel/painel-lead-v2-conversao.html`.
 *
 * This file is only the responsive shell — the three behaviors the customer
 * fiche also has (column ≥1280px / drawer 768–1279 / route <768). The panel
 * itself lives in `panel/LeadPanelBody`.
 *
 * Route mode (<768px) deliberately falls back to the same overlay Sheet as
 * drawer mode — a spec §4 deviation, recorded in the PR: navigating to
 * /app/leads/:id would land the pool attendant on "Lead não encontrado" (the
 * PAGE reads under the per-owner leads RLS; only the panel is
 * conversation-gated), so the mobile "Ficha" tap opens the sheet instead.
 */
export function LeadProfileFiche({
  lead,
  contact,
  conversation,
  assignedSeller,
  whatsappAccount,
  collaborators,
  open,
  onOpenChange,
  onConverted,
  onConversationChanged,
  onOpenMedia,
}: ILeadProfileFicheProps) {
  const mode = useFicheLayout();

  const body = (className: string) => (
    <LeadPanelBody
      lead={lead}
      contact={contact}
      conversation={conversation}
      assignedSeller={assignedSeller}
      whatsappAccount={whatsappAccount}
      collaborators={collaborators}
      onConverted={onConverted}
      onConversationChanged={onConversationChanged}
      onOpenMedia={onOpenMedia}
      className={className}
    />
  );

  if (mode === "drawer" || mode === "route") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full max-w-sm overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>{COPY.title}</SheetTitle>
            <SheetDescription>{COPY.sheetDescription}</SheetDescription>
          </SheetHeader>
          {body("h-full border-l-0")}
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
      {open && body("h-full")}
    </aside>
  );
}
