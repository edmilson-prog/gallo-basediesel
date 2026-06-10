import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { IWhatsAppAccount, IWhatsAppProviderConfig } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { getActiveDataSource, useWhatsAppAccountsProvider } from "@/providers/data";
import { SectionHeader } from "../components/SectionHeader";

const STATUS_VISUAL: Record<
  IWhatsAppAccount["status"],
  { label: string; className: string; icon: string }
> = {
  connected: {
    label: "Conectada",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: "mdi:check-circle-outline",
  },
  disconnected: {
    label: "Desconectada",
    className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    icon: "mdi:close-circle-outline",
  },
  pending: {
    label: "Pendente",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    icon: "mdi:clock-outline",
  },
};

const PROVIDER_LABEL: Record<IWhatsAppAccount["provider"], string> = {
  meta: "Meta Cloud API",
  evolution: "Evolution API",
};

const CAPABILITY_LABELS: Array<{
  key: keyof IWhatsAppAccount["capabilities"];
  label: string;
}> = [
  { key: "supportsTemplatesHsm", label: "Templates HSM" },
  { key: "supportsInteractiveButtons", label: "Botões interativos" },
  { key: "supportsLists", label: "Listas" },
  { key: "supportsReactions", label: "Reações" },
  { key: "supportsProactiveMessaging", label: "Mensagem proativa" },
];

interface IAccountDraft {
  label: string;
  credentialsRef: string;
  phoneNumberId: string;
  businessAccountId: string;
  baseUrl: string;
  instanceName: string;
}

function draftFromAccount(account: IWhatsAppAccount): IAccountDraft {
  return {
    label: account.label,
    credentialsRef: account.credentialsRef,
    phoneNumberId: account.providerConfig?.phoneNumberId ?? "",
    businessAccountId: account.providerConfig?.businessAccountId ?? "",
    baseUrl: account.providerConfig?.baseUrl ?? "",
    instanceName: account.providerConfig?.instanceName ?? "",
  };
}

/**
 * Builds the providerConfig patch from the draft, honoring the DB shape guard
 * (PRD-111 RF-032): the engine's minimum keys must BOTH be present — partial
 * configs are rejected before hitting the network; both fields empty = clear.
 */
function configFromDraft(
  provider: IWhatsAppAccount["provider"],
  draft: IAccountDraft,
): { ok: true; config: IWhatsAppProviderConfig | null } | { ok: false } {
  const a = (provider === "meta" ? draft.phoneNumberId : draft.baseUrl).trim();
  const b = (provider === "meta" ? draft.businessAccountId : draft.instanceName).trim();
  if (!a && !b) return { ok: true, config: null };
  if (!a || !b) return { ok: false };
  return {
    ok: true,
    config:
      provider === "meta"
        ? { phoneNumberId: a, businessAccountId: b }
        : { baseUrl: a, instanceName: b },
  };
}

/**
 * Admin → Integrações → WhatsApp (PRD-119) — the accounts config screen, out
 * of the Fase-1 placeholder. Owner-only at the route; writes are also
 * staff-only at the RLS layer. Secrets NEVER appear here: `credentialsRef` is
 * only the NAME PREFIX of the Edge Function secrets that complete the account
 * (see docs/dev/whatsapp-providers.md).
 */
export function WhatsAppAccountsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const provider = useWhatsAppAccountsProvider();
  const [accounts, setAccounts] = useState<IWhatsAppAccount[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<IAccountDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const list = await provider.list({ storeId });
    setAccounts(list);
  }, [provider, storeId]);

  useEffect(() => {
    let cancelled = false;
    provider
      .list({ storeId })
      .then((list) => {
        if (!cancelled) setAccounts(list);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, storeId]);

  const isMock = useMemo(() => getActiveDataSource() === "mock", []);

  const startEdit = (account: IWhatsAppAccount) => {
    setEditingId(account.id);
    setDraft(draftFromAccount(account));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const handleSave = async (account: IWhatsAppAccount) => {
    if (!draft) return;
    if (!draft.label.trim()) {
      toast.error("Informe um nome para a conta.");
      return;
    }
    const config = configFromDraft(account.provider, draft);
    if (!config.ok) {
      toast.error(
        account.provider === "meta"
          ? "Preencha Phone Number ID e Business Account ID (ou deixe ambos vazios)."
          : "Preencha URL base e nome da instância (ou deixe ambos vazios).",
      );
      return;
    }
    setSaving(true);
    try {
      await provider.update(account.id, {
        label: draft.label.trim(),
        credentialsRef: draft.credentialsRef.trim(),
        providerConfig: config.config,
      });
      toast.success("Conta atualizada.");
      cancelEdit();
      await refresh();
    } catch {
      toast.error("Não foi possível salvar a conta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="WhatsApp"
        description="Contas conectadas à Central de Atendimento. O envio e a recepção reais usam estas configurações (PRDs 111–118)."
      />

      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <Icon icon="mdi:shield-key-outline" size={16} className="mt-0.5 shrink-0" />
          <p>
            Os segredos (tokens e chaves) <strong>nunca</strong> são cadastrados por aqui: eles
            vivem como secrets de servidor, nomeados pelo prefixo de credenciais da conta. Esta tela
            edita apenas o nome da conta, o prefixo e a configuração não-secreta de cada provedor.
          </p>
        </div>
        {isMock && (
          <p className="mt-2 pl-6 text-xs italic">
            Modo demonstração: as contas abaixo são fictícias e as alterações não afetam nenhum
            serviço externo.
          </p>
        )}
      </div>

      {!accounts ? (
        <Skeleton className="h-48 w-full" />
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          Nenhuma conta de WhatsApp cadastrada para esta loja.
        </div>
      ) : (
        <ul className="space-y-4">
          {accounts.map((account) => {
            const status = STATUS_VISUAL[account.status];
            const isEditing = editingId === account.id;
            return (
              <li key={account.id} className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                      <Icon icon="mdi:whatsapp" size={20} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{account.label}</p>
                      <p className="text-xs text-muted-foreground">{account.phoneNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{PROVIDER_LABEL[account.provider]}</Badge>
                    <Badge variant="outline" className={status.className}>
                      <Icon icon={status.icon} size={12} className="mr-1" />
                      {status.label}
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {CAPABILITY_LABELS.filter(({ key }) => account.capabilities[key]).map(
                    ({ key, label }) => (
                      <span
                        key={key}
                        className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {label}
                      </span>
                    ),
                  )}
                </div>

                {!isEditing ? (
                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
                    <dl className="grid gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">Prefixo de credenciais</dt>
                        <dd className="font-mono text-foreground">{account.credentialsRef}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          {account.provider === "meta"
                            ? "Phone Number ID / WABA ID"
                            : "Instância Evolution"}
                        </dt>
                        <dd className="font-mono text-foreground">
                          {account.provider === "meta"
                            ? account.providerConfig?.phoneNumberId
                              ? `${account.providerConfig.phoneNumberId} / ${account.providerConfig.businessAccountId ?? "—"}`
                              : "Não configurado"
                            : account.providerConfig?.instanceName
                              ? `${account.providerConfig.instanceName} @ ${account.providerConfig.baseUrl ?? "—"}`
                              : "Não configurado"}
                        </dd>
                      </div>
                    </dl>
                    <Button variant="outline" size="sm" onClick={() => startEdit(account)}>
                      <Icon icon="mdi:pencil-outline" size={14} className="mr-1.5" />
                      Editar
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4 border-t border-border pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`label-${account.id}`}>Nome da conta</Label>
                        <Input
                          id={`label-${account.id}`}
                          value={draft?.label ?? ""}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, label: e.target.value } : d))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`ref-${account.id}`}>Prefixo de credenciais</Label>
                        <Input
                          id={`ref-${account.id}`}
                          className="font-mono"
                          value={draft?.credentialsRef ?? ""}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, credentialsRef: e.target.value } : d))
                          }
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Nomeia os secrets de servidor da conta (ex.:{" "}
                          <code className="font-mono">{"<prefixo>"}_ACCESS_TOKEN</code>).
                        </p>
                      </div>
                      {account.provider === "meta" ? (
                        <>
                          <div className="space-y-1.5">
                            <Label htmlFor={`pnid-${account.id}`}>Phone Number ID</Label>
                            <Input
                              id={`pnid-${account.id}`}
                              className="font-mono"
                              value={draft?.phoneNumberId ?? ""}
                              onChange={(e) =>
                                setDraft((d) => (d ? { ...d, phoneNumberId: e.target.value } : d))
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`waba-${account.id}`}>Business Account ID (WABA)</Label>
                            <Input
                              id={`waba-${account.id}`}
                              className="font-mono"
                              value={draft?.businessAccountId ?? ""}
                              onChange={(e) =>
                                setDraft((d) =>
                                  d ? { ...d, businessAccountId: e.target.value } : d,
                                )
                              }
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-1.5">
                            <Label htmlFor={`url-${account.id}`}>URL base da instância</Label>
                            <Input
                              id={`url-${account.id}`}
                              className="font-mono"
                              placeholder="https://evolution.exemplo.com.br"
                              value={draft?.baseUrl ?? ""}
                              onChange={(e) =>
                                setDraft((d) => (d ? { ...d, baseUrl: e.target.value } : d))
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`inst-${account.id}`}>Nome da instância</Label>
                            <Input
                              id={`inst-${account.id}`}
                              className="font-mono"
                              value={draft?.instanceName ?? ""}
                              onChange={(e) =>
                                setDraft((d) => (d ? { ...d, instanceName: e.target.value } : d))
                              }
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={() => void handleSave(account)} disabled={saving}>
                        {saving ? "Salvando…" : "Salvar"}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-md border border-border bg-card p-4 text-xs text-muted-foreground">
        <p className="font-semibold uppercase tracking-wider">Conectar uma conta nova</p>
        <p className="mt-1.5">
          O cadastro de novas contas é um processo operacional assistido (criação do registro,
          secrets de servidor e webhook no provedor) — siga os guias{" "}
          <code className="font-mono">docs/dev/whatsapp-meta-provider.md</code> e{" "}
          <code className="font-mono">docs/dev/whatsapp-evolution-provider.md</code>. O
          monitoramento de saúde e quota chega com o PRD-120.
        </p>
      </div>
    </div>
  );
}
