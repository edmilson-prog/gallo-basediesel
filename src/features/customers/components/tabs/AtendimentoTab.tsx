import type { IConversation, ICustomer, ISeller, IWhatsAppAccount } from "@/shared/types";
import type { ICollaboratorWithSeller } from "@/features/conversations/hooks/useConversationDetail";
import { ConversationManagementCard } from "@/features/conversations/components/ConversationManagementCard";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { TabEmptyState } from "../TabEmptyState";

const COPY = CUSTOMER_STRINGS.atendimento;

export interface IAtendimentoTabProps {
  /** Kept for the ProfileTabs contract; the management card is customer-agnostic. */
  customer: ICustomer;
  /** Conversation currently open in the Atendimento screen — absent on the standalone /app/clientes/:id page. */
  conversation?: IConversation | null;
  /** Resolved from conversation.assignedSellerId by the caller (ConversationPage) — never re-fetched here. */
  assignedSeller?: ISeller | null;
  /** Resolved from conversation.whatsappAccountId by the caller — never re-fetched here. */
  whatsappAccount?: IWhatsAppAccount | null;
  /** Resolved by the caller (useConversationDetail) — never re-fetched here. */
  collaborators?: ICollaboratorWithSeller[];
  /** Bubbles a StatusControl change up so the caller can refresh its own conversation cache. */
  onConversationChanged?: () => void;
}

export function AtendimentoTab({
  conversation,
  assignedSeller,
  whatsappAccount,
  collaborators = [],
  onConversationChanged,
}: IAtendimentoTabProps) {
  if (!conversation) {
    return <TabEmptyState icon="mdi:check-circle-outline" message={COPY.empty} />;
  }

  return (
    <div className="space-y-3">
      <ConversationManagementCard
        conversation={conversation}
        assignedSeller={assignedSeller}
        whatsappAccount={whatsappAccount}
        collaborators={collaborators}
        onConversationChanged={onConversationChanged}
      />
    </div>
  );
}
