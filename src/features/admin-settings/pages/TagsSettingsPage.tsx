import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import type { ICustomer, ITagSuggestion } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { useAuth } from "@/features/auth/useAuth";
import { FETCH_ALL_PAGE_SIZE, useCustomersProvider } from "@/providers/data";
import { SectionHeader } from "../components/SectionHeader";
import { usePlatformSettings } from "../hooks/usePlatformSettings";

const DEFAULT_FREE_COLOR = "#5b6b7a";

function makeTagId(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return `tag-${slug || Date.now().toString(36)}`;
}

interface IFreeTagEntry {
  label: string;
  usageCount: number;
}

function computeFreeTags(customers: ICustomer[], official: ITagSuggestion[]): IFreeTagEntry[] {
  const officialSet = new Set(official.map((t) => t.label.toLocaleLowerCase("pt-BR").trim()));
  const usage = new Map<string, IFreeTagEntry>();
  for (const c of customers) {
    for (const raw of c.tags ?? []) {
      const label = raw.trim();
      if (!label) continue;
      const key = label.toLocaleLowerCase("pt-BR");
      if (officialSet.has(key)) continue;
      const entry = usage.get(key);
      if (entry) entry.usageCount += 1;
      else usage.set(key, { label, usageCount: 1 });
    }
  }
  return [...usage.values()].sort((a, b) => b.usageCount - a.usageCount);
}

export function TagsSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { userRole } = useAuth();
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const customersProvider = useCustomersProvider();
  const [customers, setCustomers] = useState<ICustomer[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<ITagSuggestion | null>(null);

  const canPromote = userRole === "Owner" || userRole === "Gestor";

  useEffect(() => {
    let cancelled = false;
    customersProvider.list({ storeId, pageSize: FETCH_ALL_PAGE_SIZE }).then((res) => {
      if (!cancelled) setCustomers(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [customersProvider, storeId]);

  const freeTags = useMemo(
    () => (settings ? computeFreeTags(customers, settings.tagSuggestions) : []),
    [customers, settings],
  );

  const officialUsage = useMemo(() => {
    if (!settings) return new Map<string, number>();
    const map = new Map<string, number>();
    const labels = new Set(
      settings.tagSuggestions.map((t) => t.label.toLocaleLowerCase("pt-BR").trim()),
    );
    for (const c of customers) {
      for (const raw of c.tags ?? []) {
        const key = raw.trim().toLocaleLowerCase("pt-BR");
        if (labels.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return map;
  }, [customers, settings]);

  const persist = async (next: ITagSuggestion[], action: string) => {
    try {
      await update({ tagSuggestions: next }, action);
      toast.success("Catálogo atualizado", { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  const handlePromote = async (label: string) => {
    if (!settings) return;
    const next: ITagSuggestion[] = [
      ...settings.tagSuggestions,
      { id: makeTagId(label), label, color: DEFAULT_FREE_COLOR, promoted: true },
    ];
    await persist(next, "settings.tag.promote");
  };

  const handleAddOfficial = async () => {
    const trimmed = newLabel.trim();
    if (!trimmed || !settings) return;
    const exists = settings.tagSuggestions.some(
      (t) => t.label.toLocaleLowerCase("pt-BR") === trimmed.toLocaleLowerCase("pt-BR"),
    );
    if (exists) {
      toast.error("Esta tag já existe no catálogo.");
      return;
    }
    const next: ITagSuggestion[] = [
      ...settings.tagSuggestions,
      { id: makeTagId(trimmed), label: trimmed, color: DEFAULT_FREE_COLOR, promoted: true },
    ];
    setNewLabel("");
    await persist(next, "settings.tag.create");
  };

  const handleRemove = async (tag: ITagSuggestion) => {
    if (!settings) return;
    const next = settings.tagSuggestions.filter((t) => t.id !== tag.id);
    await persist(next, "settings.tag.remove");
    setConfirmRemove(null);
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Tags do catálogo"
          description="Tags oficiais aparecem como sugestão. Tags livres viram rascunho até serem promovidas."
        />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Tags do catálogo"
        description="Tags oficiais aparecem como sugestão na ficha do cliente e em buscas. Tags livres viram rascunho — você decide quando promover ao catálogo."
      />

      {/* Add official tag */}
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="mb-3 text-sm font-medium">Adicionar tag oficial</p>
        <div className="flex flex-wrap gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Ex.: Frota leve"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddOfficial();
              }
            }}
            disabled={saving || !canPromote}
            className="flex-1 min-w-[12rem]"
          />
          <Button disabled={saving || !canPromote || !newLabel.trim()} onClick={handleAddOfficial}>
            <Icon icon="mdi:plus" size={16} />
            Adicionar
          </Button>
        </div>
        {!canPromote && (
          <p className="mt-2 text-xs text-muted-foreground">
            Apenas Owner e Gestor podem promover ou criar tags oficiais.
          </p>
        )}
      </div>

      {/* Official catalog */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Catálogo oficial</p>
          <p className="text-xs text-muted-foreground">
            {settings.tagSuggestions.length} tag(s) oficiais
          </p>
        </div>
        <ul className="divide-y divide-border">
          {settings.tagSuggestions.map((tag) => {
            const usage = officialUsage.get(tag.label.toLocaleLowerCase("pt-BR")) ?? 0;
            return (
              <li key={tag.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-medium">{tag.label}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <Icon icon="mdi:check-decagram" size={12} />
                        Oficial
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {usage} cliente(s) usando
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmRemove(tag)}
                  disabled={!canPromote || saving}
                >
                  <Icon icon="mdi:trash-can-outline" size={16} />
                  Remover
                </Button>
              </li>
            );
          })}
          {settings.tagSuggestions.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhuma tag oficial. Adicione uma acima ou promova alguma dos rascunhos.
            </li>
          )}
        </ul>
      </div>

      {/* Free tags */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Tags livres (rascunho)</p>
          <p className="text-xs text-muted-foreground">
            {freeTags.length === 0
              ? "Nenhuma tag livre detectada no momento."
              : `${freeTags.length} tag(s) usadas por clientes mas ainda fora do catálogo.`}
          </p>
        </div>
        <ul className="divide-y divide-border">
          {freeTags.map((tag) => (
            <li key={tag.label} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground/40"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-medium">{tag.label}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      <Icon icon="mdi:pencil-outline" size={12} />
                      Rascunho
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Usada por {tag.usageCount} cliente(s)
                    </span>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => handlePromote(tag.label)}
                disabled={!canPromote || saving}
              >
                <Icon icon="mdi:arrow-up-bold-outline" size={14} />
                Promover ao catálogo
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <AlertDialog open={!!confirmRemove} onOpenChange={(open) => !open && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover tag do catálogo?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove && (
                <>
                  A tag <strong>{confirmRemove.label}</strong> deixará de aparecer como sugestão.
                  {(() => {
                    const usage =
                      officialUsage.get(confirmRemove.label.toLocaleLowerCase("pt-BR")) ?? 0;
                    return usage > 0 ? (
                      <span className="mt-2 block text-amber-600 dark:text-amber-400">
                        Atenção: {usage} cliente(s) ainda usam esta tag — ela continuará aplicada
                        mas passará a ser considerada rascunho.
                      </span>
                    ) : null;
                  })()}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRemove && handleRemove(confirmRemove)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
