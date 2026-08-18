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
import { PanelRow } from "./panel/PanelKit";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

const COPY = CONVERSATION_STRINGS.management;

export interface IConversationManagementCardProps {
  /**
   * `section` — the bordered block the customer fiche's Atendimento tab has
   * always rendered. `panel` — the lateral panel's row grammar
   * (ui_kits/atendimento/painel), where the card shell comes from `PanelCard`
   * and every value sits right-aligned on a 29px row.
   *
   * A prop rather than a restyle because both fiches render this component:
   * changing the look in place would silently redesign the customer fiche too.
   */
  variant?: "section" | "panel";
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
  variant = "section",
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

  if (variant === "panel") {
    return (
      <>
        <PanelRow label={COPY.statusShort}>
          <StatusControl
            conversation={conversation}
            mode="menu"
            onChanged={onConversationChanged}
          />
        </PanelRow>

        <PanelRow label={COPY.assigneeShort}>
          {assignedSeller ? (
            <AssigneeChip
              seller={assignedSeller}
              variant="compact"
              viewing={viewing?.has(assignedSeller.id) ?? false}
            />
          ) : (
            <span className="text-muted-foreground">{COPY.unassignedShort}</span>
          )}
        </PanelRow>

        <PanelRow label={COPY.origin}>
          {whatsappAccount ? (
            <OriginChip account={whatsappAccount} variant="label" />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </PanelRow>

        {conversation.adReferral && (
          <PanelRow label={COPY.adSource}>
            <AdSourceBadge />
            {conversation.adReferral.headline && (
              <span
                className="max-w-[120px] truncate text-muted-foreground"
                title={conversation.adReferral.headline}
              >
                &quot;{conversation.adReferral.headline}&quot;
              </span>
            )}
          </PanelRow>
        )}

        <PanelRow label={`${COPY.collaborators}${collaborators.length ? ` (${collaborators.length})` : ""}`}>
          {collab?.canManage ? (
            <AddCollaboratorDialog
              conversation={conversation}
              existingCollaboratorIds={collaborators.map((c) => c.seller.id)}
              onAdd={(sellerId) => collab.addCollaborator(sellerId)}
            />
          ) : collaborators.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : null}
        </PanelRow>
        {collaborators.length > 0 && (
          <div className="-mt-0.5 mb-1">
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

        <PanelRow label={COPY.tagsShort}>
          {canEditTags ? (
            <ConversationTagPicker conversation={conversation} onChanged={onConversationChanged} />
          ) : conversationTags.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : null}
        </PanelRow>
        {conversationTags.length > 0 && (
          <ul className="-mt-0.5 mb-1 flex flex-wrap justify-end gap-1" aria-label={COPY.tagsShort}>
            {conversationTags.map((tag) => (
              <li key={tag.id}>
                <ConversationTagChip tag={tag} />
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

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
