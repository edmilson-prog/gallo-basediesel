import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatRelativeTimeBR } from "@/shared/utils/format";
import type { ICopilotSessionRecord } from "../engine/sessionStore";
import { groupSessionsByDate } from "../utils/sessionGrouping";

interface ICopilotSessionListProps {
  sessions: ICopilotSessionRecord[];
  activeSessionId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

/** Preview of the last resolved answer in a session (already a motor-computed value). */
function lastResolvedPreview(session: ICopilotSessionRecord): string | null {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const m = session.messages[i]!;
    if (m.role === "assistant" && m.answer?.resolved && m.answer.formattedValue) {
      return m.answer.formattedValue;
    }
  }
  return null;
}

export function CopilotSessionList({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
}: ICopilotSessionListProps) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const groups = groupSessionsByDate(sessions);
  // A "fresh" session (empty) shouldn't count as history clutter in the empty view.
  const hasHistory = sessions.some((s) => s.messages.length > 0);

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="p-3">
        <Button variant="outline" className="w-full justify-start gap-2" onClick={onNew}>
          <Icon icon="mdi:plus" size={18} />
          Nova conversa
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {!hasHistory ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon icon="mdi:history" size={24} />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">Nenhuma conversa ainda</p>
            <p className="mt-1 text-xs text-muted-foreground">Suas perguntas ficam salvas aqui.</p>
          </div>
        ) : (
          <div className="px-2 pb-3">
            {groups.map((group) => (
              <div key={group.label} className="mb-3">
                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.sessions.map((session) => {
                    const active = session.id === activeSessionId;
                    const preview = lastResolvedPreview(session);
                    return (
                      <li key={session.id} className="group/item relative">
                        <button
                          type="button"
                          onClick={() => onSelect(session.id)}
                          className={cn(
                            "flex w-full flex-col gap-0.5 rounded-md border-l-2 px-3 py-2 pr-8 text-left transition-colors",
                            active
                              ? "border-primary bg-accent text-accent-foreground"
                              : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                          )}
                        >
                          <span className="truncate text-sm font-medium">{session.title}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {formatRelativeTimeBR(session.updatedAt)}
                            {preview ? ` · ${preview}` : ""}
                          </span>
                        </button>
                        <div className="absolute right-1 top-1.5 opacity-0 focus-within:opacity-100 group-hover/item:opacity-100">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label="Opções da conversa"
                              >
                                <Icon icon="mdi:dots-vertical" size={16} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() => setPendingDelete(session.id)}
                              >
                                <Icon icon="mdi:delete-outline" size={16} className="mr-2" />
                                Excluir conversa
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta conversa?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
