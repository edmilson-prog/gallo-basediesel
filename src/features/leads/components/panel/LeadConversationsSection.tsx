import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ID, ILead } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { useConversationsProvider } from "@/providers/data";
import { formatRelativeTimeBR } from "@/shared/utils/format";
import { PanelCard } from "@/features/conversations/components/panel/PanelKit";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.panel;

export interface ILeadConversationsSectionProps {
  lead: ILead;
  /** The conversation this panel is open inside — marked, never linked. */
  currentConversationId: ID;
}

/**
 * Every conversation this lead has had, with the current one marked.
 *
 * Reads under the caller's own RLS rather than the conversation gate the lead
 * itself came through: a conversation this seller cannot see should not appear
 * in a list whose only purpose is to be clicked. `list` filtered by `leadId`
 * already enforces that — nothing extra to do beyond not inventing a second
 * path around it.
 */
export function LeadConversationsSection({
  lead,
  currentConversationId,
}: ILeadConversationsSectionProps) {
  const conversationsProvider = useConversationsProvider();
  const query = useQuery({
    queryKey: ["lead-panel-conversations", lead.id] as const,
    queryFn: () =>
      conversationsProvider.list({ leadId: lead.id, storeId: lead.storeId, pageSize: 20 }),
    staleTime: 60_000,
    retry: false,
  });

  const conversations = query.data?.data ?? [];
  const others = conversations.filter((c) => c.id !== currentConversationId);

  return (
    <PanelCard icon="mdi:chat-outline" title={COPY.sections.conversations}>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2 text-xs">
          <Icon icon="mdi:chat-processing-outline" size={13} className="shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
            {COPY.conversations.current}
          </span>
        </li>
        {others.map((conversation) => (
          <li key={conversation.id} className="flex items-center gap-2 text-xs">
            <Icon
              icon="mdi:chat-outline"
              size={13}
              className="shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {formatRelativeTimeBR(conversation.lastMessageAt)}
            </span>
            <Link
              to="/app/atendimento/$id"
              params={{ id: conversation.id }}
              className="shrink-0 font-semibold text-primary hover:underline"
            >
              {COPY.conversations.open}
            </Link>
          </li>
        ))}
      </ul>
      {!query.isLoading && others.length === 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">{COPY.conversations.empty}</p>
      )}
    </PanelCard>
  );
}
