import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ConversationTagsHeaderMode, ID, IConversationTag } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { recordAuditLog, useConversationTagsProvider } from "@/providers/data";
import {
  TAG_PALETTE,
  TAG_LABEL_MAX,
  validateTagLabel,
} from "@/features/conversations/engine/tagCatalog";
import { ConversationTagChip } from "@/features/conversations/components/tags/ConversationTagChip";
import { usePlatformSettings } from "../hooks/usePlatformSettings";
import { SectionHeader } from "../components/SectionHeader";

const HEADER_MODES: { value: ConversationTagsHeaderMode; label: string; description: string }[] = [
  {
    value: "readonly",
    label: "Somente leitura no cabeçalho",
    description: "Chips aparecem no cabeçalho da conversa; a associação fica na aba Atendimento da ficha.",
  },
  {
    value: "quick-add",
    label: "Cabeçalho com adição rápida",
    description: "Chips + botão “+” no cabeçalho abrem o seletor sem abrir a ficha.",
  },
  {
    value: "band",
    label: "Faixa dedicada",
    description: "Uma linha própria abaixo do cabeçalho, sempre visível, com todas as tags.",
  },
];

function SwatchGrid({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor da tag">
      {TAG_PALETTE.map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="radio"
          aria-checked={value === entry.id}
          aria-label={entry.label}
          title={entry.label}
          className={cn(
            "size-8 rounded-full border border-border transition-shadow motion-reduce:transition-none",
            value === entry.id && "ring-2 ring-ring ring-offset-2 ring-offset-background",
          )}
          style={{ backgroundColor: entry.hex }}
          onClick={() => onChange(entry.id)}
        />
      ))}
    </div>
  );
}

export function ConversationTagsSettingsTab() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { hasRole, currentUser } = useAuth();
  const canManage = hasRole("Owner");
  const provider = useConversationTagsProvider();
  const queryClient = useQueryClient();
  const { settings, saving: savingSettings, update: updateSettings } = usePlatformSettings(storeId);

  const tagsQuery = useQuery({
    queryKey: ["conversation-tags", storeId],
    queryFn: () => provider.list({ storeId }),
    staleTime: 30 * 60 * 1000,
  });
  const usageQuery = useQuery({
    queryKey: ["conversation-tags-usage", storeId],
    queryFn: () => provider.usageCount(storeId),
  });

  const tags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);
  const usage = usageQuery.data ?? {};

  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(TAG_PALETTE[0]!.id);
  const [renaming, setRenaming] = useState<IConversationTag | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<IConversationTag | null>(null);
  const [busy, setBusy] = useState(false);

  const headerMode = settings?.conversationTags?.headerMode ?? "readonly";

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["conversation-tags"] }),
      queryClient.invalidateQueries({ queryKey: ["conversation-tags-usage", storeId] }),
    ]);
  }

  function audit(action: string, resourceId: ID, before: unknown, after: unknown) {
    if (!currentUser) return;
    void recordAuditLog({
      actorId: currentUser.id,
      storeId,
      action,
      resource: "settings",
      resourceId,
      before,
      after,
    });
  }

  async function handleCreate() {
    const validation = validateTagLabel(newLabel, tags.map((t) => t.label));
    if (!validation.ok) {
      toast.error(
        validation.error === "duplicate"
          ? "Já existe uma tag com esse nome."
          : validation.error === "too_long"
            ? `O nome deve ter no máximo ${TAG_LABEL_MAX} caracteres.`
            : "Informe um nome para a tag.",
      );
      return;
    }
    setBusy(true);
    try {
      const created = await provider.create({ storeId, label: validation.label, color: newColor });
      audit("settings.conversation_tag.create", created.id, {}, { label: created.label, color: created.color });
      setNewLabel("");
      await refresh();
      toast.success("Tag criada.");
    } catch {
      toast.error("Não foi possível criar a tag.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename() {
    if (!renaming) return;
    const others = tags.filter((t) => t.id !== renaming.id).map((t) => t.label);
    const validation = validateTagLabel(renameValue, others);
    if (!validation.ok) {
      toast.error(validation.error === "duplicate" ? "Já existe uma tag com esse nome." : "Nome inválido.");
      return;
    }
    setBusy(true);
    try {
      await provider.update(renaming.id, { label: validation.label });
      audit("settings.conversation_tag.rename", renaming.id, { label: renaming.label }, { label: validation.label });
      setRenaming(null);
      await refresh();
    } catch {
      toast.error("Não foi possível renomear a tag.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRecolor(tag: IConversationTag, color: string) {
    try {
      await provider.update(tag.id, { color });
      audit("settings.conversation_tag.recolor", tag.id, { color: tag.color }, { color });
      await refresh();
    } catch {
      toast.error("Não foi possível trocar a cor.");
    }
  }

  async function handleArchiveToggle(tag: IConversationTag): Promise<boolean> {
    try {
      await provider.update(tag.id, { archived: !tag.archived });
      audit(
        tag.archived ? "settings.conversation_tag.unarchive" : "settings.conversation_tag.archive",
        tag.id,
        { archived: tag.archived },
        { archived: !tag.archived },
      );
      await refresh();
      return true;
    } catch {
      toast.error("Não foi possível atualizar a tag.");
      return false;
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await provider.delete(confirmDelete.id);
      audit("settings.conversation_tag.delete", confirmDelete.id, { label: confirmDelete.label }, {});
      setConfirmDelete(null);
      await refresh();
      toast.success("Tag excluída.");
    } catch {
      toast.error("Não foi possível excluir a tag.");
    } finally {
      setBusy(false);
    }
  }

  async function handleHeaderMode(mode: ConversationTagsHeaderMode) {
    try {
      await updateSettings({ conversationTags: { headerMode: mode } }, "settings.conversation_tags.header_mode");
      await queryClient.invalidateQueries({ queryKey: ["platform-settings", storeId] });
    } catch {
      toast.error("Não foi possível salvar a exibição do cabeçalho.");
    }
  }

  if (tagsQuery.isLoading || !settings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Tags de conversa"
        description="Etiquetas aplicadas às conversas do Atendimento. Somente o proprietário gerencia o catálogo; atendentes aplicam nas conversas."
      />

      {!canManage && (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Apenas o proprietário pode criar, editar ou excluir tags de conversa.
        </p>
      )}

      {/* Create */}
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="mb-3 text-sm font-medium">Criar tag</p>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Ex.: Aguardando peça"
              maxLength={TAG_LABEL_MAX}
              disabled={busy || !canManage}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              className="min-w-[12rem] flex-1"
            />
            <Button disabled={busy || !canManage || !newLabel.trim()} onClick={() => void handleCreate()}>
              <Icon icon="mdi:plus" size={16} />
              Criar
            </Button>
          </div>
          {canManage && <SwatchGrid value={newColor} onChange={setNewColor} />}
          {newLabel.trim() && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Prévia:
              <ConversationTagChip
                tag={{
                  id: "preview",
                  storeId,
                  label: newLabel.trim(),
                  color: newColor,
                  archived: false,
                  createdAt: "",
                  updatedAt: "",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Catalog list */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Catálogo</p>
          <p className="text-xs text-muted-foreground">{tags.length} tag(s)</p>
        </div>
        {tags.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Icon icon="mdi:tag-plus-outline" size={28} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma tag criada ainda.</p>
          </div>
        )}
        <ul className="divide-y divide-border">
          {tags.map((tag) => {
            const used = usage[tag.id] ?? 0;
            return (
              <li key={tag.id} className="flex items-center gap-3 px-4 py-2.5">
                <ConversationTagChip tag={tag} />
                <span className="text-xs text-muted-foreground">
                  usada em {used} conversa(s)
                </span>
                {canManage && (
                  <span className="ml-auto">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={`Ações da tag ${tag.label}`}>
                          <Icon icon="mdi:dots-vertical" size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onSelect={() => {
                            setRenaming(tag);
                            setRenameValue(tag.label);
                          }}
                        >
                          Renomear
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {TAG_PALETTE.map((entry) => (
                          <DropdownMenuItem
                            key={entry.id}
                            onSelect={() => void handleRecolor(tag, entry.id)}
                            className="gap-2"
                          >
                            <span
                              aria-hidden
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: entry.hex }}
                            />
                            {entry.label}
                            {tag.color === entry.id && <Icon icon="mdi:check" size={13} className="ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void handleArchiveToggle(tag)}>
                          {tag.archived ? "Reativar" : "Arquivar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setConfirmDelete(tag)}
                        >
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Header layout parameter */}
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="mb-1 text-sm font-medium">Exibição no cabeçalho da conversa</p>
        <p className="mb-3 text-xs text-muted-foreground">
          A associação de tags fica sempre na aba Atendimento da ficha; este parâmetro controla o cabeçalho.
        </p>
        <div className="space-y-2" role="radiogroup" aria-label="Exibição no cabeçalho">
          {HEADER_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              role="radio"
              aria-checked={headerMode === mode.value}
              disabled={!canManage || savingSettings}
              onClick={() => void handleHeaderMode(mode.value)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors motion-reduce:transition-none",
                headerMode === mode.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/40",
                (!canManage || savingSettings) && "cursor-not-allowed opacity-60",
              )}
            >
              <Icon
                icon={headerMode === mode.value ? "mdi:radiobox-marked" : "mdi:radiobox-blank"}
                size={18}
                className={headerMode === mode.value ? "text-primary" : "text-muted-foreground"}
              />
              <span>
                <span className="block text-sm font-medium">{mode.label}</span>
                <span className="block text-xs text-muted-foreground">{mode.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear tag</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={TAG_LABEL_MAX}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleRename();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            O novo nome aparece imediatamente em todas as conversas que usam esta tag.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancelar
            </Button>
            <Button disabled={busy || !renameValue.trim()} onClick={() => void handleRename()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tag?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  {(usage[confirmDelete.id] ?? 0) > 0 ? (
                    <>
                      A tag <strong>{confirmDelete.label}</strong> está aplicada em{" "}
                      <strong>{usage[confirmDelete.id]} conversa(s)</strong>. Excluir não é permitido
                      enquanto houver uso — prefira <strong>Arquivar</strong>: ela some do seletor e
                      continua visível no histórico.
                    </>
                  ) : (
                    <>
                      A tag <strong>{confirmDelete.label}</strong> não está aplicada em nenhuma
                      conversa e será excluída definitivamente.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {confirmDelete && (usage[confirmDelete.id] ?? 0) > 0 ? (
              <AlertDialogAction
                onClick={async () => {
                  if (await handleArchiveToggle(confirmDelete)) setConfirmDelete(null);
                }}
              >
                Arquivar
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                onClick={() => void handleDelete()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
