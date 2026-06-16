import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import { toast } from "sonner";
import { useConversationsProvider, useCustomersProvider } from "@/providers/data";
import { formatPhone } from "@/shared/utils/format";
import type { ICustomer, ID, IWhatsAppAccount } from "@/shared/types";
import { OriginChip } from "./OriginChip";
import { instanceAccent } from "../utils/instanceAccent";

function customerName(c: ICustomer): string {
  return c.type === "B2B" ? c.nomeFantasia : c.fullName;
}

/**
 * "Nova conversa" (multi-instância): o vendedor inicia uma conversa de saída
 * escolhendo a INSTÂNCIA de origem e o cliente. A conversa nasce atribuída a ele
 * (sem distribuição) e abre no composer — que já é provider-aware (Evolution =
 * texto livre, Meta = template). Só instâncias conectadas e acessíveis chegam
 * aqui (a RLS já filtra o `list`).
 */
export function NewConversationDialog({
  storeId,
  sellerId,
  accounts,
  onClose,
  onCreated,
}: {
  storeId: ID;
  /** Seller atual — vira o responsável (RLS exige assigned = self). */
  sellerId: ID;
  accounts: IWhatsAppAccount[];
  onClose: () => void;
  onCreated: (conversationId: ID) => void;
}) {
  const conversationsProvider = useConversationsProvider();
  const customersProvider = useCustomersProvider();
  const [origin, setOrigin] = useState<IWhatsAppAccount | null>(accounts[0] ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ICustomer[]>([]);
  const [selected, setSelected] = useState<ICustomer | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    void customersProvider
      .list({ search: q, storeId, pageSize: 8 })
      .then((res) => {
        if (!cancelled) setResults(res.data);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query, customersProvider, storeId]);

  const isEvolution = origin?.provider === "evolution";

  async function handleStart() {
    if (!origin || !selected) return;
    setCreating(true);
    try {
      const conversation = await conversationsProvider.createOutbound({
        storeId,
        whatsappAccountId: origin.id,
        assignedSellerId: sellerId,
        customerId: selected.id,
      });
      onCreated(conversation.id);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível iniciar a conversa.",
      );
      setCreating(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
          <DialogDescription>
            Escolha por qual número falar e com quem. Você fica como responsável pela conversa.
          </DialogDescription>
        </DialogHeader>

        {accounts.length === 0 ? (
          <div className="rounded-lg border border-severity-warning/40 bg-severity-warning/10 p-4 text-sm text-severity-warning">
            Nenhuma instância conectada disponível para você iniciar conversas.
          </div>
        ) : (
          <div className="space-y-4">
            {/* 1 · Origem */}
            <div className="space-y-1.5">
              <Label>Falar pelo número</Label>
              <div className="space-y-1">
                {accounts.map((a) => {
                  const active = origin?.id === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setOrigin(a)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                        active ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-block size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: instanceAccent(a.id) }}
                        />
                        <span className="text-foreground">{a.label}</span>
                        {a.phoneNumber && (
                          <span className="text-xs text-muted-foreground">
                            {formatPhone(a.phoneNumber)}
                          </span>
                        )}
                      </span>
                      {active && <Icon icon="mdi:check" size={16} className="text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2 · Destino (cliente) */}
            <div className="space-y-1.5">
              <Label htmlFor="new-conv-customer">Cliente</Label>
              {selected ? (
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span>
                    <span className="text-foreground">{customerName(selected)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatPhone(selected.phone)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(null);
                      setQuery("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    id="new-conv-customer"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por nome ou telefone…"
                    autoComplete="off"
                  />
                  {results.length > 0 && (
                    <ul className="max-h-44 overflow-y-auto rounded-lg border border-border">
                      {results.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setSelected(c)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50"
                          >
                            <span className="text-foreground">{customerName(c)}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatPhone(c.phone)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {query.trim().length >= 2 && results.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhum cliente encontrado. Cadastre o contato em Clientes para iniciar a
                      conversa.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* 3 · Dica provider-aware (a mensagem é escrita no composer) */}
            {origin && (
              <div
                className={`rounded-md border p-2 text-xs ${
                  isEvolution
                    ? "border-severity-warning/40 bg-severity-warning/10 text-severity-warning"
                    : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                {isEvolution ? (
                  <>
                    <Icon icon="mdi:alert-outline" size={13} className="mr-1 inline" />
                    Primeira mensagem para um número novo: evite conteúdo promocional (anti-ban).
                  </>
                ) : (
                  <>
                    <Icon icon="mdi:information-outline" size={13} className="mr-1 inline" />
                    Origem Meta: fora da janela de 24h, a primeira mensagem precisa de um template
                    HSM aprovado (o composer oferece).
                  </>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                <Icon icon="mdi:account-check-outline" size={13} className="mr-1 inline" />
                Você será o responsável.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={creating}>
                  Cancelar
                </Button>
                <Button onClick={() => void handleStart()} disabled={!origin || !selected || creating}>
                  {creating ? "Iniciando…" : "Iniciar conversa"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
