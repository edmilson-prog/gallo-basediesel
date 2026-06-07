import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { IQuickReply } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
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
import { useQuickReplyProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface ISharedSnippetsManagerProps {}

/**
 * Shared-snippet governance (D-12, RF-013/019). Owner/Gestor create/edit/delete
 * `scope: "shared"` quick replies. Every mutation goes through the provider
 * (which logMockMutation-audits) and refreshes the local list.
 */
export function SharedSnippetsManager(_: ISharedSnippetsManagerProps) {
  const s = QUICK_SEND_STRINGS.library;
  const provider = useQuickReplyProvider();
  const { currentUser } = useAuth();
  const [items, setItems] = useState<IQuickReply[] | null>(null);
  const [editing, setEditing] = useState<IQuickReply | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<IQuickReply | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    void provider.list({ scope: "shared" }).then(setItems);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const resetForm = () => {
    setEditing(null);
    setShortcut("");
    setTitle("");
    setBody("");
  };

  const startEdit = (item: IQuickReply) => {
    setEditing(item);
    setShortcut(item.shortcut);
    setTitle(item.title);
    setBody(item.body);
  };

  const handleSave = async () => {
    const sc = shortcut.trim();
    const tt = title.trim();
    const bd = body.trim();
    if (!sc || !tt || !bd) {
      toast.error(s.snippetMissingFields);
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await provider.update(editing.id, { shortcut: sc, title: tt, body: bd });
        toast.success(s.snippetSaved);
      } else {
        await provider.create({
          shortcut: sc,
          title: tt,
          body: bd,
          scope: "shared",
          ownerId: currentUser?.id ?? "system",
        });
        toast.success(s.snippetCreated);
      }
      resetForm();
      refresh();
    } catch {
      toast.error(s.snippetSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: IQuickReply) => {
    try {
      await provider.delete(item.id);
      toast.success(s.snippetDeleted);
      setConfirmDelete(null);
      refresh();
    } catch {
      toast.error(s.snippetSaveFailed);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{s.manageSnippets}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.manageSnippetsDesc}</p>
      </div>

      {/* Editor */}
      <section className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-sm font-medium">
          {editing ? s.snippetEditTitle : s.snippetNewTitle}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="/garantia"
            aria-label="Atalho"
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={s.snippetTitlePlaceholder}
            aria-label="Título"
          />
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={s.snippetBodyPlaceholder}
          rows={3}
          className="mt-2 resize-none"
          aria-label="Conteúdo"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{s.snippetVarsHint}</p>
        <div className="mt-3 flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            <Icon icon="mdi:content-save-outline" size={14} />
            {editing ? s.snippetSave : s.snippetCreate}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={resetForm} disabled={saving}>
              {s.cancel}
            </Button>
          )}
        </div>
      </section>

      {/* List */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{s.sharedSnippetsList}</p>
        </div>
        {items === null ? (
          <div className="p-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{s.snippetsEmpty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {item.shortcut}
                    </Badge>
                    <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label={s.edit}
                    onClick={() => startEdit(item)}
                  >
                    <Icon icon="mdi:pencil-outline" size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    aria-label="Excluir"
                    onClick={() => setConfirmDelete(item)}
                  >
                    <Icon icon="mdi:trash-can-outline" size={15} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{s.snippetDeleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && s.snippetDeleteDesc(confirmDelete.title)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{s.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {s.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
