import type { ID, IConversation, ISeller, IWhatsAppAccount } from "@/shared/types";
import type { ICollaboratorWithSeller } from "@/features/conversations/hooks/useConversationDetail";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCustomerProfile } from "../hooks/useCustomerProfile";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileTabs, type TabKey } from "./ProfileTabs";
import { ProfileSkeleton } from "./ProfileSkeleton";

export interface ICustomerProfileProps {
  customerId: ID;
  /**
   * When the fiche is rendered inside a conversation viewer, this is the
   * conversation currently being read. Used to mark the "Conversa atual"
   * badge in the Conversations tab and to deep-link "Criar orçamento" with
   * `conversationId` query param.
   */
  conversation?: IConversation | null;
  /** Resolved from conversation.assignedSellerId by the caller — feeds the Atendimento tab. */
  assignedSeller?: ISeller | null;
  /** Resolved from conversation.whatsappAccountId by the caller — feeds the Atendimento tab. */
  whatsappAccount?: IWhatsAppAccount | null;
  /** Resolved from useConversationDetail by the caller — feeds the Atendimento tab. */
  collaborators?: ICollaboratorWithSeller[];
  /** Bubbles a StatusControl change up to the caller's conversation refresh. */
  onConversationChanged?: () => void;
  /** Forwarded to ProfileTabs — omit to keep "Visão geral" as the default (e.g. the customers-list preview panel). */
  defaultTab?: TabKey;
  /** Layout density — `column` is the lateral 360px panel; `page` is the full route. */
  variant?: "column" | "page";
  className?: string;
  /** Optional "Copiloto" tab content injected by the conversation screen (PRD-025). */
  copilotTab?: React.ReactNode;
}

/**
 * Root component of the unified customer profile (PRD-012).
 *
 * Used in two places:
 *  - the right column of `ConversationLayout` (≥ 1280px) and the conversation
 *    drawer (768–1279px) — both pass `variant="column"`.
 *  - the dedicated route `/app/clientes/:id` (< 768px and direct access) —
 *    passes `variant="page"`.
 *
 * Same component, same data hook, same tabs — only spacing & headings adapt.
 */
export function CustomerProfile({
  customerId,
  conversation = null,
  assignedSeller = null,
  whatsappAccount = null,
  collaborators = [],
  onConversationChanged,
  defaultTab,
  variant = "column",
  className,
  copilotTab,
}: ICustomerProfileProps) {
  // Pass the conversation id so a POOL conversation's customer resolves via the
  // conversation-gated read when the per-carteira customers RLS would hide it
  // (Portão A) — the fiche opened from the Inbox no longer 406s for a seller.
  const { customer, isLoading, isError, notFound, refetch } = useCustomerProfile(
    customerId,
    conversation?.id,
  );

  if (isLoading) {
    return <ProfileSkeleton variant={variant} className={className} />;
  }

  if (notFound) {
    return (
      <ProfileStateMessage
        variant={variant}
        className={className}
        icon="mdi:account-question-outline"
        title={CUSTOMER_STRINGS.notFound.title}
        description={CUSTOMER_STRINGS.notFound.description}
      />
    );
  }

  if (isError || !customer) {
    return (
      <ProfileStateMessage
        variant={variant}
        className={className}
        icon="mdi:alert-circle-outline"
        title={CUSTOMER_STRINGS.loadError.title}
        description={CUSTOMER_STRINGS.loadError.description}
        action={
          <Button variant="secondary" size="sm" onClick={refetch}>
            {CUSTOMER_STRINGS.loadError.retry}
          </Button>
        }
      />
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "flex h-full min-h-0 flex-col bg-card text-card-foreground",
          variant === "column" && "border-l border-border",
          className,
        )}
        aria-label={`Ficha de ${customer.type === "B2B" ? customer.nomeFantasia : customer.fullName}`}
      >
        <ProfileHeader customer={customer} conversation={conversation} variant={variant} />
        <ProfileTabs
          customer={customer}
          conversation={conversation}
          assignedSeller={assignedSeller}
          whatsappAccount={whatsappAccount}
          collaborators={collaborators}
          onConversationChanged={onConversationChanged}
          defaultTab={defaultTab}
          iconOnlyTabs={variant === "column"}
          copilotTab={copilotTab}
        />
      </div>
    </TooltipProvider>
  );
}

interface IProfileStateMessageProps {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  variant: "column" | "page";
  className?: string;
}

function ProfileStateMessage({
  icon,
  title,
  description,
  action,
  variant,
  className,
}: IProfileStateMessageProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-3 bg-card px-6 py-12 text-center",
        variant === "column" && "border-l border-border",
        className,
      )}
      role="status"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon icon={icon} size={24} />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
