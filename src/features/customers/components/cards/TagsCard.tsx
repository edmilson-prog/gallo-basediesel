import { useMemo, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer, ITagSuggestion } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useSettingsProvider } from "@/providers/data/hooks/useSettingsProvider";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.overview.tags;

export interface ITagsCardProps {
  customer: ICustomer;
}

/**
 * Tags inline editor. Two flavors live side by side:
 *  - **Pre-approved tags** — those present in the active store's
 *    `IPlatformSettings.tagSuggestions` with `promoted: true`; rendered with
 *    brand colors.
 *  - **Free tags** — created by the vendedor on the fly; rendered with a
 *    dashed border + "draft" badge so the gestor can tell them apart.
 *
 * A vendedor that creates a free tag can suggest its promotion to the catalog
 * — the MVP records intent only (placeholder); a real promotion workflow
 * arrives with PRD-019.
 */
export function TagsCard({ customer }: ITagsCardProps) {
  const provider = useCustomersProvider();
  const settingsProvider = useSettingsProvider();
  const canEdit = usePermission("customer", "edit");
  const [draft, setDraft] = useState("");
  const [pendingPromotions, setPendingPromotions] = useState<Set<string>>(new Set());
  const [isBusy, setIsBusy] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["platform-settings", customer.storeId] as const,
    staleTime: 30 * 60 * 1000,
    queryFn: () => settingsProvider.get(customer.storeId).catch(() => null),
  });

  const catalog: ITagSuggestion[] = useMemo(
    () => settingsQuery.data?.tagSuggestions ?? [],
    [settingsQuery.data],
  );

  const officialMap = useMemo(() => {
    const m = new Map<string, ITagSuggestion>();
    for (const t of catalog) if (t.promoted) m.set(t.label.toLowerCase(), t);
    return m;
  }, [catalog]);

  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (q.length === 0) return [];
    return catalog
      .filter((t) => t.label.toLowerCase().includes(q) && !customer.tags.includes(t.label))
      .slice(0, 5);
  }, [draft, customer.tags, catalog]);

  const handleAdd = async (label: string) => {
    if (!label.trim() || customer.tags.includes(label)) return;
    setIsBusy(true);
    try {
      const before = { tags: customer.tags };
      const updated = await provider.update(customer.id, {
        tags: [...customer.tags, label],
      });
      auditLog({
        action: "customer.tag_added",
        resource: "customer",
        resourceId: customer.id,
        before,
        after: { tags: updated.tags },
      });
      toast.success(COPY.addedToast(label));
      setDraft("");
    } catch {
      toast.error("Não foi possível adicionar a tag.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemove = async (label: string) => {
    setIsBusy(true);
    try {
      const before = { tags: customer.tags };
      const updated = await provider.update(customer.id, {
        tags: customer.tags.filter((t) => t !== label),
      });
      auditLog({
        action: "customer.tag_removed",
        resource: "customer",
        resourceId: customer.id,
        before,
        after: { tags: updated.tags },
      });
      toast.success(COPY.removedToast(label));
    } catch {
      toast.error("Não foi possível remover a tag.");
    } finally {
      setIsBusy(false);
    }
  };

  const handlePromote = (label: string) => {
    setPendingPromotions((prev) => {
      const next = new Set(prev);
      next.add(label);
      return next;
    });
    auditLog({
      action: "customer.tag_promotion_suggested",
      resource: "customer",
      resourceId: customer.id,
      after: { tag: label, status: "pending" },
    });
    toast.success(COPY.promoteToast(label));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleAdd(draft.trim());
    }
  };

  return (
    <section className="rounded-lg border border-border bg-background p-3">
      <header className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon icon="mdi:tag-multiple-outline" size={14} />
        {COPY.title}
      </header>

      {customer.tags.length === 0 ? (
        <p className="mb-3 text-xs italic text-muted-foreground">{COPY.empty}</p>
      ) : (
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {customer.tags.map((label) => {
            const official = officialMap.get(label.toLowerCase());
            const isPending = pendingPromotions.has(label);
            return (
              <li
                key={label}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                  official
                    ? "border-border bg-muted text-foreground"
                    : "border-dashed border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                )}
                title={official ? "Tag oficial" : "Tag livre — fora do catálogo oficial"}
              >
                {official && (
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: official.color }}
                    aria-hidden
                  />
                )}
                {!official && <Icon icon="mdi:pencil-outline" size={10} />}
                <span>{label}</span>
                {!official && canEdit && (
                  <button
                    type="button"
                    onClick={() => handlePromote(label)}
                    className="ml-0.5 inline-flex items-center rounded text-amber-700 transition hover:text-amber-900 disabled:opacity-50 dark:text-amber-300"
                    title={isPending ? COPY.promotePending : COPY.promote}
                    disabled={isPending}
                  >
                    <Icon
                      icon={isPending ? "mdi:clock-outline" : "mdi:arrow-up-bold-circle-outline"}
                      size={12}
                    />
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRemove(label)}
                    className="ml-0.5 inline-flex items-center rounded text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                    aria-label={`Remover ${label}`}
                    disabled={isBusy}
                  >
                    <Icon icon="mdi:close" size={11} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div className="relative">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={COPY.placeholder}
            className="h-8 text-xs"
            disabled={isBusy}
          />
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
              <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {COPY.suggestionsLabel}
              </p>
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void handleAdd(s.label)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition hover:bg-accent hover:text-accent-foreground"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden
                  />
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {draft.trim() && suggestions.length === 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 h-7 w-full justify-start gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void handleAdd(draft.trim())}
            >
              <Icon icon="mdi:plus-circle-outline" size={12} />
              {`Criar tag livre "${draft.trim()}"`}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
