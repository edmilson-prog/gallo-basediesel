import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, ILead } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConversationsProvider } from "@/providers/data/hooks/useConversationsProvider";
import { useAuditsProvider } from "@/providers/data/hooks/useAuditsProvider";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useAuth } from "@/features/auth/useAuth";
import { formatRelativeTimeBR } from "@/shared/utils/format";
import { describeLeadAudit } from "../../engine/leadHistory";
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
        <NotesTab lead={lead} />
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
  const sellersProvider = useSellersProvider();
  const query = useQuery({
    queryKey: ["lead-audits", leadId] as const,
    queryFn: () => provider.list({ resource: "lead", resourceId: leadId, pageSize: 100 }),
    staleTime: 30_000,
  });
  const sellersQuery = useQuery({
    queryKey: ["sellers-min"] as const,
    queryFn: () => sellersProvider.list(),
    staleTime: 5 * 60_000,
  });
  const nameOf = (id: ID) => sellersQuery.data?.find((s) => s.id === id)?.fullName ?? "";

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
      {entries.map((entry) => {
        const d = describeLeadAudit(entry);
        return (
          <li key={entry.id} className="rounded-md border border-border bg-card px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <Icon icon={d.icon} size={13} className="text-muted-foreground" />
                {d.title}
              </span>
              <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                {formatRelativeTimeBR(entry.timestamp)}
              </span>
            </div>
            {d.lines.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                {d.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
            {nameOf(entry.actorId) && (
              <p className="mt-1 text-[10px] text-muted-foreground/80">por {nameOf(entry.actorId)}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function NotesTab({ lead }: { lead: ILead }) {
  const provider = useLeadsProvider();
  const sellersProvider = useSellersProvider();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  const notesQuery = useQuery({
    queryKey: ["lead-notes", lead.id] as const,
    queryFn: () => provider.listNotes(lead.id),
    staleTime: 30_000,
  });
  const sellersQuery = useQuery({
    queryKey: ["sellers-min"] as const,
    queryFn: () => sellersProvider.list(),
    staleTime: 5 * 60_000,
  });
  const nameOf = (id: ID) => sellersQuery.data?.find((s) => s.id === id)?.fullName ?? "";

  const add = async () => {
    const body = content.trim();
    const authorId = currentUser?.sellerId;
    if (!body || !authorId) return;
    setBusy(true);
    try {
      await provider.addNote(lead.id, body, authorId);
      setContent("");
      await queryClient.invalidateQueries({ queryKey: ["lead-notes", lead.id] });
    } catch {
      toast.error(COPY.noteSaveError);
    } finally {
      setBusy(false);
    }
  };

  const notes = notesQuery.data ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={COPY.notesComposerPlaceholder}
          rows={2}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            className="cursor-pointer"
            disabled={busy || !content.trim() || !currentUser?.sellerId}
            onClick={() => void add()}
          >
            {COPY.addNote}
          </Button>
        </div>
      </div>
      {notes.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
          {COPY.emptyNotes}
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
              <p className="whitespace-pre-wrap text-foreground">{n.content}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {nameOf(n.authorId)} · {formatRelativeTimeBR(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
