import type { ReactNode } from "react";
import type { IConversation, ICustomer, ISeller, IWhatsAppAccount } from "@/shared/types";
import { PendingContactBanner } from "@/features/contact-review";
import { AssigneeChip } from "@/features/conversations/components/AssigneeChip";
import { OriginChip } from "@/features/conversations/components/OriginChip";
import { StatusControl } from "@/features/conversations/components/status/StatusControl";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { ConversationTagChip } from "@/features/conversations/components/tags/ConversationTagChip";
import { ConversationTagPicker } from "@/features/conversations/components/tags/ConversationTagPicker";
import { useConversationTags } from "@/features/conversations/hooks/useConversationTags";
import { resolveConversationTags } from "@/features/conversations/engine/tagCatalog";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { TabEmptyState } from "../TabEmptyState";

const COPY = CUSTOMER_STRINGS.atendimento;

export interface IAtendimentoTabProps {
  customer: ICustomer;
  /** Conversation currently open in the Atendimento screen — absent on the standalone /app/clientes/:id page. */
  conversation?: IConversation | null;
  /** Resolved from conversation.assignedSellerId by the caller (ConversationPage) — never re-fetched here. */
  assignedSeller?: ISeller | null;
  /** Resolved from conversation.whatsappAccountId by the caller — never re-fetched here. */
  whatsappAccount?: IWhatsAppAccount | null;
  /** Bubbles a StatusControl change up so the caller can refresh its own conversation cache. */
  onConversationChanged?: () => void;
}

function ContextRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  );
}

export function AtendimentoTab({
  customer,
  conversation,
  assignedSeller,
  whatsappAccount,
  onConversationChanged,
}: IAtendimentoTabProps) {
  const showBanner =
    customer.tags.includes("pending_review") || customer.tags.includes("reviewed_not_customer");
  const canEditTags = usePermission("conversation", "edit", "own");
  const { tags: catalog } = useConversationTags();
  const conversationTags = conversation ? resolveConversationTags(conversation.tags, catalog) : [];

  if (!showBanner && !conversation) {
    return <TabEmptyState icon="mdi:check-circle-outline" message={COPY.empty} />;
  }

  return (
    <div className="space-y-3">
      {showBanner && <PendingContactBanner customer={customer} conversation={conversation} />}

      {conversation && (
        <section className="divide-y divide-border rounded-lg border border-border bg-background px-3">
          <ContextRow label={COPY.status}>
            <StatusControl
              conversation={conversation}
              mode="menu"
              onChanged={onConversationChanged}
            />
          </ContextRow>
          {assignedSeller && (
            <ContextRow label={COPY.assignee}>
              <AssigneeChip seller={assignedSeller} variant="compact" />
            </ContextRow>
          )}
          {whatsappAccount && (
            <ContextRow label={COPY.origin}>
              <OriginChip account={whatsappAccount} variant="label" />
            </ContextRow>
          )}
          {conversation && (
            <div className="py-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{COPY.tags}</span>
                {canEditTags && (
                  <ConversationTagPicker
                    conversation={conversation}
                    onChanged={onConversationChanged}
                  />
                )}
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={COPY.tags}>
                {conversationTags.length === 0 && (
                  <li className="text-muted-foreground">{COPY.tagsEmpty}</li>
                )}
                {conversationTags.map((tag) => (
                  <li key={tag.id}>
                    <ConversationTagChip tag={tag} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
