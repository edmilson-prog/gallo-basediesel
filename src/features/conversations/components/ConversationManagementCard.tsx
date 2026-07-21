import type { ReactNode } from "react";
import type { IConversation, ISeller, IWhatsAppAccount } from "@/shared/types";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { AssigneeChip } from "./AssigneeChip";
import { OriginChip } from "./OriginChip";
import { AdSourceBadge } from "./AdSourceBadge";
import { StatusControl } from "./status/StatusControl";
import { ConversationTagChip } from "./tags/ConversationTagChip";
import { ConversationTagPicker } from "./tags/ConversationTagPicker";
import { useConversationTags } from "../hooks/useConversationTags";
import { resolveConversationTags } from "../engine/tagCatalog";
import { useConversationCollaborators } from "../hooks/useConversationCollaborators";
import { useConversationPresence } from "../hooks/useConversationPresence";
import type { ICollaboratorWithSeller } from "../hooks/useConversationDetail";
import { CollaboratorRow } from "./CollaboratorRow";
import { AddCollaboratorDialog } from "./AddCollaboratorDialog";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

const COPY = CONVERSATION_STRINGS.management;

export interface IConversationManagementCardProps {
  /** The conversation being managed — always present (callers gate on it). */
  conversation: IConversation;
  /** Resolved from conversation.assignedSellerId by the caller — never re-fetched here. */
  assignedSeller?: ISeller | null;
  /** Resolved from conversation.whatsappAccountId by the caller — never re-fetched here. */
  whatsappAccount?: IWhatsAppAccount | null;
  /** Resolved by the caller (useConversationDetail) — never re-fetched here. */
  collaborators?: ICollaboratorWithSeller[];
  /** Bubbles a status/tag/collaborator change up so the caller can refresh its conversation cache. */
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

/**
 * Conversation-management panel (Status · Respondendo por · Atendente ·
 * Colaboradores · Tags da conversa). Extracted from the customer fiche's
 * "Atendimento" tab so the lead fiche can render the exact same controls —
 * both fiches stay in sync. Purely conversation-scoped (no customer/lead
 * dependency); does NOT touch the frozen message/media cache.
 */
export function ConversationManagementCard({
  conversation,
  assignedSeller,
  whatsappAccount,
  collaborators = [],
  onConversationChanged,
}: IConversationManagementCardProps) {
  const canEditTags = usePermission("conversation", "edit", "own");
  const { tags: catalog } = useConversationTags();
  const conversationTags = resolveConversationTags(conversation.tags, catalog);

  const collab = useConversationCollaborators(conversation, () => onConversationChanged?.());
  const viewing = useConversationPresence(conversation.id);

  return (
    <section className="divide-y divide-border rounded-lg border border-border bg-background px-3">
      <ContextRow label={COPY.status}>
        <StatusControl conversation={conversation} mode="menu" onChanged={onConversationChanged} />
      </ContextRow>
      {assignedSeller && (
        <ContextRow label={COPY.assignee}>
          <AssigneeChip
            seller={assignedSeller}
            variant="compact"
            viewing={viewing?.has(assignedSeller.id) ?? false}
          />
        </ContextRow>
      )}
      {whatsappAccount && (
        <ContextRow label={COPY.origin}>
          <OriginChip account={whatsappAccount} variant="label" />
        </ContextRow>
      )}
      {conversation.adReferral && (
        <ContextRow label={COPY.adSource}>
          <span className="flex items-center gap-1.5">
            <AdSourceBadge />
            {conversation.adReferral.headline && (
              <span
                className="max-w-[160px] truncate text-muted-foreground"
                title={conversation.adReferral.headline}
              >
                &quot;{conversation.adReferral.headline}&quot;
              </span>
            )}
          </span>
        </ContextRow>
      )}
      <div className="py-2 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">
            {COPY.collaborators} ({collaborators.length})
          </span>
          {collab?.canManage && (
            <AddCollaboratorDialog
              conversation={conversation}
              existingCollaboratorIds={collaborators.map((c) => c.seller.id)}
              onAdd={(sellerId) => collab.addCollaborator(sellerId)}
            />
          )}
        </div>
        {collaborators.length === 0 ? (
          <p className="mt-1 text-muted-foreground">{COPY.collaboratorsEmpty}</p>
        ) : (
          <div className="mt-1">
            {collaborators.map(({ seller, source }) => (
              <CollaboratorRow
                key={seller.id}
                seller={seller}
                source={source}
                viewing={viewing?.has(seller.id) ?? false}
                canRemove={collab?.canRemove(seller.id) ?? false}
                onRemove={() => void collab?.removeCollaborator(seller.id)}
              />
            ))}
          </div>
        )}
      </div>
      <div className="py-2 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{COPY.tags}</span>
          {canEditTags && (
            <ConversationTagPicker conversation={conversation} onChanged={onConversationChanged} />
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
    </section>
  );
}
