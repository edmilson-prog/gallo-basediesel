import { useQuery } from "@tanstack/react-query";
import type { ID, ILead } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConversationsProvider } from "@/providers/data/hooks/useConversationsProvider";
import { useAuditsProvider } from "@/providers/data/hooks/useAuditsProvider";
import { formatDateTimeBR, formatRelativeTimeBR } from "@/shared/utils/format";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.detail;

export interface ILeadTabsProps {
  lead: ILead;
}

export function LeadTabs({ lead }: ILeadTabsProps) {
  return (
    <Tabs defaultValue="conversations" className="w-full">
      <TabsList>
        <TabsTrigger value="conversations">
          <Icon icon="mdi:chat-outline" size={14} className="mr-1" />
          {COPY.tabs.conversations}
        </TabsTrigger>
        <TabsTrigger value="notes">
          <Icon icon="mdi:note-text-outline" size={14} className="mr-1" />
          {COPY.tabs.notes}
        </TabsTrigger>
        <TabsTrigger value="history">
          <Icon icon="mdi:history" size={14} className="mr-1" />
          {COPY.tabs.history}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="conversations" className="pt-3">
        <ConversationsTab lead={lead} />
      </TabsContent>
      <TabsContent value="notes" className="pt-3">
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
          {COPY.emptyNotes}
        </p>
      </TabsContent>
      <TabsContent value="history" className="pt-3">
        <HistoryTab leadId={lead.id} />
      </TabsContent>
    </Tabs>
  );
}

function ConversationsTab({ lead }: { lead: ILead }) {
  const provider = useConversationsProvider();
  const query = useQuery({
    queryKey: ["lead-conversations", lead.id] as const,
    queryFn: () => provider.list({ leadId: lead.id, pageSize: 50 }),
    staleTime: 30_000,
  });

  if (query.isLoading) {
    return <p className="px-4 py-6 text-center text-xs text-muted-foreground">Carregando…</p>;
  }
  const conversations = query.data?.data ?? [];
  if (conversations.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
        {COPY.emptyConversations}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {conversations.map((c) => (
        <li
          key={c.id}
          className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate text-foreground">
              {c.channel.toUpperCase()} · {c.status}
            </p>
            <p className="text-xs text-muted-foreground">{formatRelativeTimeBR(c.lastMessageAt)}</p>
          </div>
          {c.unreadCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
              {c.unreadCount}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function HistoryTab({ leadId }: { leadId: ID }) {
  const provider = useAuditsProvider();
  const query = useQuery({
    queryKey: ["lead-audits", leadId] as const,
    queryFn: () => provider.list({ resource: "lead", resourceId: leadId, pageSize: 100 }),
    staleTime: 30_000,
  });

  if (query.isLoading) {
    return <p className="px-4 py-6 text-center text-xs text-muted-foreground">Carregando…</p>;
  }
  const entries = query.data?.data ?? [];
  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
        {COPY.emptyHistory}
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-md border border-border bg-card px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">{labelForAction(entry.action)}</span>
            <span className="text-[10px] text-muted-foreground">
              {formatDateTimeBR(entry.createdAt)}
            </span>
          </div>
          {entry.before !== undefined && entry.after !== undefined && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {formatDelta(entry.before, entry.after)}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function labelForAction(action: string): string {
  switch (action) {
    case "lead.created":
      return "Lead criado";
    case "lead.stage_changed":
      return "Mudança de estágio";
    case "lead.updated":
      return "Lead atualizado";
    case "lead.converted":
      return "Convertido em cliente";
    case "lead.lost":
      return "Marcado como perdido";
    default:
      return action;
  }
}

function formatDelta(before: unknown, after: unknown): string {
  try {
    const beforeStr = typeof before === "object" ? JSON.stringify(before) : String(before);
    const afterStr = typeof after === "object" ? JSON.stringify(after) : String(after);
    return `${beforeStr} → ${afterStr}`;
  } catch {
    return "";
  }
}
