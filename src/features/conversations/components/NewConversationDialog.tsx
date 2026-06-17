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
import {
  formatBrPhoneDisplay,
  looksLikePhone,
  normalizeBrPhone,
  samePhone,
} from "../engine/phoneBR";
import type { ICustomer, ID, IWhatsAppAccount } from "@/shared/types";
import { OriginChip } from "./OriginChip";
import { instanceAccent } from "../utils/instanceAccent";
import { checkWhatsAppNumber } from "../api/checkWhatsAppNumber";

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
  const [newNumberMode, setNewNumberMode] = useState(false);
  const [newNumberName, setNewNumberName] = useState("");
  const [newNumberPhone, setNewNumberPhone] = useState("");
  const [checkState, setCheckState] = useState<"idle" | "checking" | "no_whatsapp">("idle");

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

  /** Dedupe by phone (the Supabase search now filters — Task 2), else create a
   *  minimal B2C contact (no CPF; name falls back to the number, healed later). */
  async function resolveOrCreateCustomer(phoneFinal: string): Promise<ICustomer> {
    const suffix = phoneFinal.slice(-8);
    const res = await customersProvider.list({ storeId, search: suffix, pageSize: 20 });
    const match = res.data.find((c) => samePhone(c.phone, phoneFinal));
    if (match) return match;
    return customersProvider.create({
      type: "B2C",
      cpf: "",
      fullName: newNumberName.trim() || phoneFinal,
      phone: phoneFinal,
      sellerId,
      storeId,
      status: "ativo",
      tags: [],
    });
  }

  /** Reuse an already-open conversation for this contact on this instance. */
  async function findOpenConversationId(customerId: ID): Promise<ID | null> {
    if (!origin) return null;
    const res = await conversationsProvider.list({
      storeId,
      customerId,
      whatsappAccountId: origin.id,
      status: ["aguardando", "em_andamento", "aguardando_cliente"],
      pageSize: 1,
    });
    return res.data[0]?.id ?? null;
  }

  /** Orchestrates the new-number flow. `forced` skips WhatsApp pre-check. */
  async function startNewNumber(forced: boolean) {
    if (!origin) return;
    const norm = normalizeBrPhone(newNumberPhone);
    if (!norm.ok) {
      toast.error("Informe DDD + número (ex.: 54 99999-8888).");
      return;
    }

    let phoneFinal = norm.digits;
    let markValid = false;

    // Evolution pre-validates; Meta / offline / errors resolve to `skipped`.
    if (!forced) {
      setCheckState("checking");
      const check = await checkWhatsAppNumber(origin.id, norm.digits);
      setCheckState("idle");
      if (check.status === "no_whatsapp") {
        setCheckState("no_whatsapp");
        return; // D6: block, but the UI offers "Iniciar mesmo assim".
      }
      if (check.status === "has_whatsapp") {
        phoneFinal = check.canonicalPhone ?? norm.digits; // jid is canonical (D7).
        markValid = true;
      }
    }

    setCreating(true);
    try {
      const customer = await resolveOrCreateCustomer(phoneFinal);
      // Only ever PROMOTE to valid; never downgrade to invalid here (§7 / RF-052).
      if (markValid && customer.whatsappStatus !== "valid") {
        await customersProvider.update(customer.id, { whatsappStatus: "valid" });
      }
      const openId = await findOpenConversationId(customer.id);
      if (openId) {
        onCreated(openId);
        return;
      }
      const conversation = await conversationsProvider.createOutbound({
        storeId,
        whatsappAccountId: origin.id,
        assignedSellerId: sellerId,
        customerId: customer.id,
      });
      onCreated(conversation.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar a conversa.");
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
                  {query.trim().length >= 2 && results.length === 0 && !newNumberMode && (
                    looksLikePhone(query) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setNewNumberMode(true);
                          setNewNumberPhone(query);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-left text-sm hover:bg-primary/10"
                      >
                        <Icon icon="mdi:plus-circle-outline" size={16} className="text-primary" />
                        <span>
                          Falar com{" "}
                          <span className="font-medium text-foreground">
                            {(() => {
                              const n = normalizeBrPhone(query);
                              return n.ok ? formatBrPhoneDisplay(n.digits) : query;
                            })()}
                          </span>{" "}
                          — número novo
                        </span>
                      </button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Nenhum cliente encontrado. Cadastre o contato em Clientes para iniciar a
                        conversa.
                      </p>
                    )
                  )}

                  {newNumberMode && (
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="new-conv-newname">Nome (opcional)</Label>
                        <Input
                          id="new-conv-newname"
                          value={newNumberName}
                          onChange={(e) => setNewNumberName(e.target.value)}
                          placeholder="Sem nome"
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="new-conv-newphone">Telefone</Label>
                        <Input
                          id="new-conv-newphone"
                          inputMode="tel"
                          value={newNumberPhone}
                          onChange={(e) => {
                            setNewNumberPhone(e.target.value);
                            if (checkState === "no_whatsapp") setCheckState("idle");
                          }}
                          placeholder="(55) 54 99999-8888"
                          autoComplete="off"
                        />
                      </div>
                      {checkState === "checking" && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Icon icon="mdi:loading" size={14} className="animate-spin" />
                          Verificando se o número tem WhatsApp…
                        </p>
                      )}
                      {checkState === "no_whatsapp" && (
                        <div className="space-y-2 rounded-md border border-severity-warning/40 bg-severity-warning/10 p-2 text-xs text-severity-warning">
                          <p className="flex items-center gap-1.5">
                            <Icon icon="mdi:alert-outline" size={14} />
                            Este número não parece ter uma conta de WhatsApp.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={creating}
                            onClick={() => void startNewNumber(true)}
                          >
                            Iniciar mesmo assim
                          </Button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setNewNumberMode(false);
                          setNewNumberName("");
                          setNewNumberPhone("");
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Voltar à busca
                      </button>
                    </div>
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
                <Button
                  onClick={() => void (newNumberMode ? startNewNumber(false) : handleStart())}
                  disabled={
                    !origin ||
                    creating ||
                    checkState === "checking" ||
                    (newNumberMode ? !looksLikePhone(newNumberPhone) : !selected)
                  }
                >
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
