import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { toast } from "sonner";
import { useWhatsAppAccountsProvider } from "@/providers/data";
import { resolveAccessRecipients } from "../utils/accessRecipients";
import type { ISeller, IWhatsAppAccount } from "@/shared/types";

type DraftRule = { kind: "seller" | "role" | "store"; targetValue: string };

/**
 * Configura quem acessa (Camada 1, multi-instância) uma instância de WhatsApp.
 * O modelo de dados/RLS suporta OU de seller/role/store; este editor expõe as
 * duas dimensões com contagem exata — "Todos da loja" e atendentes específicos.
 * Papel e departamento ficam para o módulo de Pessoas & Acesso (PRD-211); regras
 * `role`/`department` já carregadas são preservadas no save (replace-all do set).
 */
export function InstanceAccessSheet({
  account,
  storeId,
  sellers,
  onClose,
}: {
  account: IWhatsAppAccount;
  storeId: string;
  sellers: ISeller[];
  onClose: (changed: boolean) => void;
}) {
  const provider = useWhatsAppAccountsProvider();
  const [rules, setRules] = useState<DraftRule[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void provider.getAccessRules(account.id).then((r) => {
      if (!cancelled) setRules(r.map((x) => ({ kind: x.kind, targetValue: x.targetValue })));
    });
    return () => {
      cancelled = true;
    };
  }, [account.id, provider]);

  const current = rules ?? [];
  const storeAll = current.some((r) => r.kind === "store" && r.targetValue === storeId);
  const sellerIds = useMemo(
    () => new Set(current.filter((r) => r.kind === "seller").map((r) => r.targetValue)),
    [current],
  );

  const recipients = useMemo(
    () =>
      resolveAccessRecipients(
        current,
        sellers.map((s) => ({ id: s.id, role: "", storeId: s.storeId })),
      ),
    [current, sellers],
  );

  function toggleStoreAll() {
    setRules((prev) => {
      const list = prev ?? [];
      if (storeAll) return list.filter((r) => !(r.kind === "store" && r.targetValue === storeId));
      return [...list.filter((r) => r.kind !== "store"), { kind: "store", targetValue: storeId }];
    });
  }

  function toggleSeller(id: string) {
    setRules((prev) => {
      const list = prev ?? [];
      if (list.some((r) => r.kind === "seller" && r.targetValue === id)) {
        return list.filter((r) => !(r.kind === "seller" && r.targetValue === id));
      }
      return [...list, { kind: "seller", targetValue: id }];
    });
  }

  async function handleSave() {
    if (!rules) return;
    setSaving(true);
    try {
      await provider.replaceAccessRules(account.id, rules);
      toast.success("Acesso atualizado.");
      onClose(true);
    } catch {
      toast.error("Não foi possível salvar o acesso.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose(false)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Quem acessa “{account.label}”</SheetTitle>
          <SheetDescription>
            Quem enxerga e atende as conversas desta instância. As regras se somam (OU) — cada
            pessoa é contada uma única vez.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          {/* Prévia reativa */}
          <div
            className={`rounded-lg border p-3 ${
              recipients.size === 0
                ? "border-severity-warning/40 bg-severity-warning/10"
                : "border-primary/40 bg-primary/10"
            }`}
          >
            {recipients.size === 0 ? (
              <p className="text-sm font-semibold text-severity-warning">
                <Icon icon="mdi:account-off-outline" size={14} className="mr-1 inline" />
                Ninguém vê as conversas desta instância
              </p>
            ) : (
              <p className="text-sm font-semibold text-primary">
                <Icon icon="mdi:account-group" size={14} className="mr-1 inline" />
                {recipients.size} {recipients.size === 1 ? "pessoa enxerga" : "pessoas enxergam"}{" "}
                esta instância
              </p>
            )}
          </div>

          {/* Todos da loja */}
          <button
            type="button"
            onClick={toggleStoreAll}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left ${
              storeAll ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <span className="flex items-center gap-2 text-sm text-foreground">
              <Icon icon="mdi:store-outline" size={16} />
              Todos da loja
            </span>
            <span className={`text-xs ${storeAll ? "text-primary" : "text-muted-foreground"}`}>
              {storeAll ? "Ativado" : "Desativado"}
            </span>
          </button>

          {/* Atendentes específicos */}
          <div className={storeAll ? "pointer-events-none opacity-50" : ""}>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Atendentes específicos
            </p>
            <div className="space-y-0.5">
              {rules === null ? (
                <p className="text-xs text-muted-foreground">Carregando…</p>
              ) : sellers.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum atendente nesta loja.</p>
              ) : (
                sellers.map((s) => {
                  const checked = storeAll || sellerIds.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={storeAll}
                        onChange={() => toggleSeller(s.id)}
                        className="size-4 accent-primary"
                      />
                      <span className="text-foreground">{s.fullName}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Por papel / Departamento — deferidos (PRD-211) */}
          <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
            <Icon icon="mdi:lock-outline" size={13} className="mr-1 inline" />
            Acesso por papel e por departamento chega com o módulo de Pessoas &amp; Acesso (PRD-211).
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={() => onClose(false)} disabled={saving}>
            Cancelar
          </Button>
          {recipients.size === 0 ? (
            <Button
              variant="destructive"
              onClick={() => void handleSave()}
              disabled={saving || rules === null}
            >
              Salvar sem acesso
            </Button>
          ) : (
            <Button onClick={() => void handleSave()} disabled={saving || rules === null}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
