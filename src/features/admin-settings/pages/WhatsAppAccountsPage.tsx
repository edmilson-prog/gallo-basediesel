import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ISeller,
  IWhatsAppAccount,
  IWhatsAppAccountAccessRule,
  IWhatsAppProviderConfig,
  WhatsAppAccountPurpose,
  WhatsAppFailoverPolicy,
} from "@/shared/types";
import { isEvolutionFamily } from "@/shared/utils/whatsappProvider";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import {
  getActiveDataSource,
  recordAuditLogSync,
  useSellersProvider,
  useWhatsAppAccountsProvider,
  type IWhatsAppAccountMetrics,
} from "@/providers/data";
import { SectionHeader } from "../components/SectionHeader";
import { INVALID_CREDENTIALS_REF_MESSAGE, isValidCredentialsRef } from "../api/whatsappConnect";
import { configFromDraft, draftFromAccount, type IAccountDraft } from "../utils/accountDraft";
import { useEvolutionStatusSync } from "../hooks/useEvolutionStatusSync";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConnectWhatsAppDialog, type ConnectDialogStep } from "../components/ConnectWhatsAppDialog";
import { DeleteInstanceDialog } from "../components/DeleteInstanceDialog";
import { ImportContactsDialog } from "../components/ImportContactsDialog";
import { ImportHistoryDialog, type HistoryDialogMode } from "../components/ImportHistoryDialog";
import { ImportConversationsDialog } from "../components/ImportConversationsDialog";
import { SyncAvatarsDialog } from "../components/SyncAvatarsDialog";
import { TestMessageDialog } from "../components/TestMessageDialog";
import { InstanceAccessSheet } from "../components/InstanceAccessSheet";
import { ParticipantCrossInstanceCard } from "../components/ParticipantCrossInstanceCard";
import { AddInstanceWizard } from "../components/AddInstanceWizard";
import { resolveAccessRecipients } from "../utils/accessRecipients";
import { INSTANCE_PALETTE } from "@/features/conversations/utils/instanceAccent";

const STATUS_VISUAL: Record<
  IWhatsAppAccount["status"],
  { label: string; className: string; icon: string }
> = {
  connected: {
    label: "Conectada",
    className: "border-severity-success/40 bg-severity-success/10 text-severity-success",
    icon: "mdi:check-circle-outline",
  },
  disconnected: {
    label: "Desconectada",
    className: "border-severity-critical/40 bg-severity-critical/10 text-severity-critical",
    icon: "mdi:close-circle-outline",
  },
  pending: {
    label: "Pendente",
    className: "border-severity-warning/40 bg-severity-warning/10 text-severity-warning",
    icon: "mdi:clock-outline",
  },
};

const PROVIDER_LABEL: Record<IWhatsAppAccount["provider"], string> = {
  meta: "Meta Cloud API",
  evolution: "Evolution API",
  "evolution-go": "Evolution Go",
  openwa: "OpenWA",
};

const PURPOSE_LABEL: Record<WhatsAppAccountPurpose, string> = {
  atendimento: "Atendimento",
  campanha: "Campanha",
  ambos: "Atendimento + Campanha",
};

/** Health state visuals (PRD-120) — mirrors the dashboard badges. */
const HEALTH_VISUAL: Record<
  IWhatsAppAccount["currentState"],
  { label: string; className: string; icon: string }
> = {
  healthy: {
    label: "Saudável",
    className: "border-severity-success/40 bg-severity-success/10 text-severity-success",
    icon: "mdi:heart-pulse",
  },
  degraded: {
    label: "Degradada",
    className: "border-severity-warning/40 bg-severity-warning/10 text-severity-warning",
    icon: "mdi:alert-outline",
  },
  down: {
    label: "Indisponível",
    className: "border-severity-critical/40 bg-severity-critical/10 text-severity-critical",
    icon: "mdi:close-circle-outline",
  },
  paused: {
    label: "Pausada",
    className: "border-border bg-muted text-muted-foreground",
    icon: "mdi:pause-circle-outline",
  },
};

const FAILOVER_POLICY_LABEL: Record<WhatsAppFailoverPolicy, string> = {
  disabled: "Desativado",
  manual: "Manual (Owner ativa)",
  automatic: "Automático (quando a conta cair)",
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

function formatLastOutbound(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const sellersProvider = useSellersProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [accounts, setAccounts] = useState<IWhatsAppAccount[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<IAccountDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [connectTarget, setConnectTarget] = useState<{
    account: IWhatsAppAccount;
    step: ConnectDialogStep;
  } | null>(null);
  const [metrics, setMetrics] = useState<Record<string, IWhatsAppAccountMetrics>>({});
  const [testTarget, setTestTarget] = useState<IWhatsAppAccount | null>(null);
  const [importTarget, setImportTarget] = useState<IWhatsAppAccount | null>(null);
  const [importContactsTarget, setImportContactsTarget] = useState<IWhatsAppAccount | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{
    account: IWhatsAppAccount;
    mode: HistoryDialogMode;
  } | null>(null);
  const [syncAvatarsTarget, setSyncAvatarsTarget] = useState<IWhatsAppAccount | null>(null);
  const [checking, setChecking] = useState(false);
  const [sellers, setSellers] = useState<ISeller[]>([]);
  const [accessRules, setAccessRules] = useState<Record<string, IWhatsAppAccountAccessRule[]>>({});
  const [accessAccount, setAccessAccount] = useState<IWhatsAppAccount | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IWhatsAppAccount | null>(null);
  // Focus lands here after a delete removes the card the kebab lived in.
  const pageRef = useRef<HTMLDivElement>(null);

  const loadMetrics = useCallback(
    async (list: IWhatsAppAccount[]) => {
      const entries = await Promise.all(
        list.map(async (account) => {
          try {
            return [account.id, await provider.getMetrics(account.id)] as const;
          } catch {
            return null; // metrics are decorative — never block the screen
          }
        }),
      );
      const loaded: Record<string, IWhatsAppAccountMetrics> = {};
      for (const entry of entries) if (entry) loaded[entry[0]] = entry[1];
      setMetrics(loaded);
    },
    [provider],
  );

  const loadAccessRules = useCallback(
    async (list: IWhatsAppAccount[]) => {
      const entries = await Promise.all(
        list.map(async (account) => {
          try {
            return [account.id, await provider.getAccessRules(account.id)] as const;
          } catch {
            return null; // access summary is decorative — never block the screen
          }
        }),
      );
      const loaded: Record<string, IWhatsAppAccountAccessRule[]> = {};
      for (const entry of entries) if (entry) loaded[entry[0]] = entry[1];
      setAccessRules(loaded);
    },
    [provider],
  );

  const refresh = useCallback(async () => {
    const list = await provider.list({ storeId });
    setAccounts(list);
    void loadMetrics(list);
    void loadAccessRules(list);
  }, [provider, storeId, loadMetrics, loadAccessRules]);

  useEffect(() => {
    let cancelled = false;
    provider
      .list({ storeId })
      .then((list) => {
        if (cancelled) return;
        setAccounts(list);
        void loadMetrics(list);
        void loadAccessRules(list);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, storeId, loadMetrics, loadAccessRules]);

  useEffect(() => {
    let cancelled = false;
    void sellersProvider
      .list({ storeId, active: true })
      .then((list) => {
        if (!cancelled) setSellers(list);
      })
      .catch(() => {
        /* sellers feed the access summary only — never block the screen */
      });
    return () => {
      cancelled = true;
    };
  }, [sellersProvider, storeId]);

  const isMock = useMemo(() => getActiveDataSource() === "mock", []);

  // SIGPRO-style live status: 30s polling (visible tab) + focus + manual.
  const { checkNow } = useEvolutionStatusSync(accounts, () => void refresh(), !isMock);

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      await checkNow();
      await refresh();
    } finally {
      setChecking(false);
    }
  };

  const startEdit = (account: IWhatsAppAccount) => {
    setEditingId(account.id);
    setDraft(draftFromAccount(account));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  /** Opens the connect dialog — straight to QR when the config is complete. */
  const openConnect = (account: IWhatsAppAccount) => {
    // Evolution Go is registry-based: the server (base URL + global key) lives on
    // whatsapp_go_servers, NOT in provider_config, so there is no per-account form
    // to fill. The backend `qr` action resolves the server from the registry and
    // creates/connects the instance — go straight to QR pairing. (Routing Go to
    // the "form" step on an empty provider_config.baseUrl blocked re-pairing.)
    if (account.provider === "evolution-go") {
      setConnectTarget({ account, step: "qr" });
      return;
    }
    const configured = Boolean(
      account.providerConfig?.baseUrl && account.providerConfig?.instanceName,
    );
    setConnectTarget({ account, step: configured ? "qr" : "form" });
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
          : account.provider === "evolution-go"
            ? "Informe a URL do servidor Evolution Go."
            : "Preencha URL base e nome da instância (ou deixe ambos vazios).",
      );
      return;
    }
    // RF-003: a non-disabled policy requires a backup account (DB CHECK).
    if (draft.failoverPolicy !== "disabled" && !draft.failoverAccountId) {
      toast.error("Selecione a conta reserva para usar failover.");
      return;
    }
    // The prefix names the server-side secrets ({prefix}_API_KEY etc.) — in
    // real mode it must be env-style; legacy seed refs ("vault://...") break
    // both the vault write and the send pipeline's secret resolution.
    if (!isMock && !isValidCredentialsRef(draft.credentialsRef.trim())) {
      toast.error(INVALID_CREDENTIALS_REF_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      const failoverChanged =
        draft.failoverPolicy !== account.failoverPolicy ||
        (draft.failoverAccountId || null) !== (account.failoverAccountId ?? null);
      await provider.update(account.id, {
        label: draft.label.trim(),
        credentialsRef: draft.credentialsRef.trim(),
        providerConfig:
          config.config && account.providerConfig?.accentColor
            ? { ...config.config, accentColor: account.providerConfig.accentColor }
            : config.config,
        failoverPolicy: draft.failoverPolicy,
        failoverAccountId: draft.failoverAccountId || null,
        // Disabling the policy also clears an active failover.
        ...(draft.failoverPolicy === "disabled" && account.isFailoverActive
          ? { isFailoverActive: false }
          : {}),
      });
      if (failoverChanged && currentUser?.sellerId) {
        recordAuditLogSync({
          storeId,
          actorId: currentUser.sellerId,
          action: "failover_policy_changed",
          resource: "whatsapp_account",
          resourceId: account.id,
          before: { policy: account.failoverPolicy, backup: account.failoverAccountId ?? null },
          after: { policy: draft.failoverPolicy, backup: draft.failoverAccountId || null },
        });
      }
      toast.success("Conta atualizada.");
      cancelEdit();
      await refresh();
    } catch {
      toast.error("Não foi possível salvar a conta.");
    } finally {
      setSaving(false);
    }
  };

  // Per-instance identity color (multi-instância): persisted in provider_config
  // (jsonb) so it survives without a schema change. Spreads the existing config
  // so baseUrl/instanceName/profileName are preserved; null clears (→ auto/hash).
  const setAccentColor = async (account: IWhatsAppAccount, hex: string | null) => {
    const nextConfig: IWhatsAppProviderConfig = { ...(account.providerConfig ?? {}) };
    if (hex) nextConfig.accentColor = hex;
    else delete nextConfig.accentColor;
    try {
      await provider.update(account.id, { providerConfig: nextConfig });
      await refresh();
    } catch {
      toast.error("Não foi possível salvar a cor da instância.");
    }
  };

  // RF-050: manual failover toggle (Owner override) — audited.
  const handleFailoverToggle = async (account: IWhatsAppAccount, next: boolean) => {
    setSaving(true);
    try {
      await provider.update(account.id, { isFailoverActive: next });
      if (currentUser?.sellerId) {
        recordAuditLogSync({
          storeId,
          actorId: currentUser.sellerId,
          action: "manual_failover_toggle",
          resource: "whatsapp_account",
          resourceId: account.id,
          after: { isFailoverActive: next, backup: account.failoverAccountId ?? null },
        });
      }
      toast.success(
        next
          ? "Failover ativado — novos envios usam a conta reserva."
          : "Failover desativado — envios voltam à conta principal.",
      );
      await refresh();
    } catch {
      toast.error("Não foi possível alterar o failover.");
    } finally {
      setSaving(false);
    }
  };

  // Owner shelves an intentionally offline instance: silence its disconnection
  // alerts (card + global banner, TopBar indicator AND the in-app notifications
  // emitted by the connection trigger / health tick). Audited, reversible.
  const handleToggleAlertsMuted = async (account: IWhatsAppAccount) => {
    const next = !account.alertsMuted;
    setSaving(true);
    try {
      await provider.update(account.id, { alertsMuted: next });
      if (currentUser?.sellerId) {
        recordAuditLogSync({
          storeId,
          actorId: currentUser.sellerId,
          action: "whatsapp_alerts_muted_toggle",
          resource: "whatsapp_account",
          resourceId: account.id,
          after: { alertsMuted: next },
        });
      }
      toast.success(
        next
          ? "Alertas de desconexão silenciados para esta conta."
          : "Alertas de desconexão reativados para esta conta.",
      );
      await refresh();
      // The shell banner/TopBar read a separate 60s query — nudge it so the
      // change reflects immediately instead of waiting for the next poll/focus.
      void queryClient.invalidateQueries({ queryKey: ["shell", "whatsapp-connection-status"] });
    } catch {
      toast.error("Não foi possível alterar os alertas da conta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={pageRef} tabIndex={-1} className="space-y-6 outline-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          title="WhatsApp"
          description="Contas conectadas à Central de Atendimento. O envio e a recepção reais usam estas configurações (PRDs 111–118)."
        />
        <Button onClick={() => setWizardOpen(true)} title="Adiciona um novo número de WhatsApp">
          <Icon icon="lucide:plus" size={14} className="mr-1.5" />
          Adicionar número
        </Button>
      </div>

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

      <ParticipantCrossInstanceCard storeId={storeId} />

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
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{account.label}</p>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                          {PURPOSE_LABEL[account.purpose]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{account.phoneNumber}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{PROVIDER_LABEL[account.provider]}</Badge>
                    <Badge variant="outline" className={status.className}>
                      <Icon icon={status.icon} size={12} className="mr-1" />
                      {status.label}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={HEALTH_VISUAL[account.currentState].className}
                      title={
                        account.stateChangedAt
                          ? `Desde ${new Date(account.stateChangedAt).toLocaleString("pt-BR")}`
                          : undefined
                      }
                    >
                      <Icon
                        icon={HEALTH_VISUAL[account.currentState].icon}
                        size={12}
                        className="mr-1"
                      />
                      {HEALTH_VISUAL[account.currentState].label}
                    </Badge>
                    {account.isFailoverActive && (
                      <Badge
                        variant="outline"
                        className="border-severity-critical/40 bg-severity-critical/10 text-severity-critical"
                      >
                        <Icon icon="mdi:swap-horizontal" size={12} className="mr-1" />
                        Failover ativo
                      </Badge>
                    )}
                    {account.alertsMuted && (
                      <Badge
                        variant="outline"
                        className="border-border bg-muted text-muted-foreground"
                        title="Alertas de desconexão silenciados para esta conta"
                      >
                        <Icon icon="mdi:bell-off-outline" size={12} className="mr-1" />
                        Alertas silenciados
                      </Badge>
                    )}
                    {!isMock && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Mais ações"
                            title="Mais ações"
                          >
                            <Icon icon="mdi:dots-vertical" size={18} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => void handleToggleAlertsMuted(account)}>
                            <Icon
                              icon={
                                account.alertsMuted
                                  ? "mdi:bell-ring-outline"
                                  : "mdi:bell-off-outline"
                              }
                              size={15}
                              className="mr-2"
                            />
                            {account.alertsMuted
                              ? "Reativar alertas de desconexão"
                              : "Silenciar alertas de desconexão"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setDeleteTarget(account)}
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          >
                            <Icon icon="mdi:trash-can-outline" size={15} className="mr-2" />
                            Excluir instância
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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

                <div className="mt-3">
                  {(() => {
                    const recipients = resolveAccessRecipients(
                      accessRules[account.id] ?? [],
                      sellers.map((s) => ({ id: s.id, role: "", storeId: s.storeId })),
                    );
                    const none = recipients.size === 0;
                    return (
                      <button
                        type="button"
                        onClick={() => setAccessAccount(account)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          none
                            ? "border-severity-warning/40 bg-severity-warning/10 text-severity-warning"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                        title="Configurar quem acessa esta instância"
                      >
                        <Icon icon="mdi:account-group-outline" size={13} />
                        {none
                          ? "Ninguém vê — configurar acesso"
                          : `${recipients.size} ${recipients.size === 1 ? "pessoa" : "pessoas"} • configurar acesso`}
                      </button>
                    );
                  })()}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Cor da instância</span>
                  <div className="flex items-center gap-1.5">
                    {INSTANCE_PALETTE.map((hex) => {
                      const active = account.providerConfig?.accentColor === hex;
                      return (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => void setAccentColor(account, hex)}
                          aria-label={`Usar a cor ${hex}`}
                          aria-pressed={active}
                          className={`size-5 cursor-pointer rounded-full transition-transform hover:scale-110 ${
                            active ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : ""
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => void setAccentColor(account, null)}
                      aria-label="Cor automática"
                      aria-pressed={!account.providerConfig?.accentColor}
                      title="Automático (cor pelo identificador)"
                      className={`flex size-5 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground ${
                        !account.providerConfig?.accentColor
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                          : ""
                      }`}
                    >
                      <Icon icon="mdi:auto-fix" size={12} />
                    </button>
                  </div>
                </div>

                {!isEditing ? (
                  <>
                    <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
                      <dl className="grid gap-x-8 gap-y-1 text-xs sm:grid-cols-3">
                        <div>
                          <dt className="text-muted-foreground">Prefixo de credenciais</dt>
                          <dd className="font-mono text-foreground">{account.credentialsRef}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            {account.provider === "meta"
                              ? "Phone Number ID / WABA ID"
                              : account.provider === "evolution-go"
                                ? "Instância Evolution Go"
                                : "Instância Evolution"}
                          </dt>
                          <dd className="font-mono text-foreground">
                            {account.provider === "meta"
                              ? account.providerConfig?.phoneNumberId
                                ? `${account.providerConfig.phoneNumberId} / ${account.providerConfig.businessAccountId ?? "—"}`
                                : "Não configurado"
                              : account.provider === "evolution-go"
                                ? account.providerConfig?.instanceId
                                  ? `${account.providerConfig.instanceId} @ ${account.providerConfig.baseUrl ?? "—"}`
                                  : `Não pareado @ ${account.providerConfig?.baseUrl ?? "—"}`
                                : account.providerConfig?.instanceName
                                  ? `${account.providerConfig.instanceName} @ ${account.providerConfig.baseUrl ?? "—"}`
                                  : "Não configurado"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Failover</dt>
                          <dd className="text-foreground">
                            {account.failoverPolicy === "disabled"
                              ? "Desativado"
                              : `${FAILOVER_POLICY_LABEL[account.failoverPolicy]} → ${
                                  accounts?.find((a) => a.id === account.failoverAccountId)
                                    ?.label ?? "conta reserva"
                                }`}
                          </dd>
                        </div>
                      </dl>
                      <div className="flex flex-wrap gap-2">
                        {account.failoverPolicy !== "disabled" && account.failoverAccountId && (
                          <Button
                            variant={account.isFailoverActive ? "destructive" : "outline"}
                            size="sm"
                            disabled={saving}
                            onClick={() =>
                              void handleFailoverToggle(account, !account.isFailoverActive)
                            }
                          >
                            <Icon icon="mdi:swap-horizontal" size={14} className="mr-1.5" />
                            {account.isFailoverActive
                              ? "Desativar failover"
                              : "Ativar failover agora"}
                          </Button>
                        )}
                        {isEvolutionFamily(account.provider) && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={checking}
                              onClick={() => void handleCheckNow()}
                              title="Consulta o estado real da sessão no servidor Evolution"
                            >
                              <Icon
                                icon="mdi:refresh"
                                size={14}
                                className={`mr-1.5 ${checking ? "animate-spin" : ""}`}
                              />
                              Verificar agora
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={account.status !== "connected"}
                              onClick={() => setTestTarget(account)}
                              title={
                                account.status === "connected"
                                  ? "Envia um texto padrão para validar a conexão"
                                  : "Disponível com a conta conectada"
                              }
                            >
                              <Icon icon="mdi:message-check-outline" size={14} className="mr-1.5" />
                              Mensagem de teste
                            </Button>
                            {!isMock && account.provider === "evolution" && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={account.status !== "connected"}
                                onClick={() => setImportTarget(account)}
                                title={
                                  account.status === "connected"
                                    ? "Importa o histórico de conversas que o servidor Evolution tem desta conta"
                                    : "Disponível com a conta conectada"
                                }
                              >
                                <Icon icon="mdi:download-multiple" size={14} className="mr-1.5" />
                                Importar conversas
                              </Button>
                            )}
                            {!isMock && account.provider === "evolution-go" && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={account.status !== "connected"}
                                onClick={() => setImportContactsTarget(account)}
                                title={
                                  account.status === "connected"
                                    ? "Traz a lista de contatos do WhatsApp desta conta para a base de Clientes"
                                    : "Disponível com a conta conectada"
                                }
                              >
                                <Icon
                                  icon="mdi:account-multiple-plus-outline"
                                  size={14}
                                  className="mr-1.5"
                                />
                                Importar contatos
                              </Button>
                            )}
                            {!isMock && account.provider === "evolution-go" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setHistoryTarget({ account, mode: "import" })}
                                title="Traz as conversas do histórico capturado no pareamento para o Inbox (resgata @lid)"
                              >
                                <Icon icon="mdi:history" size={14} className="mr-1.5" />
                                Importar histórico
                              </Button>
                            )}
                            {!isMock && account.provider === "evolution-go" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setHistoryTarget({ account, mode: "undo" })}
                                title="Remove o que a importação de histórico criou para esta conta"
                              >
                                <Icon icon="mdi:undo-variant" size={14} className="mr-1.5" />
                                Desfazer
                              </Button>
                            )}
                            {!isMock && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={account.status !== "connected"}
                                onClick={() => setSyncAvatarsTarget(account)}
                                title={
                                  account.status === "connected"
                                    ? "Busca no WhatsApp a foto de perfil dos contatos e exibe nas Conversas"
                                    : "Disponível com a conta conectada"
                                }
                              >
                                <Icon icon="mdi:image-sync-outline" size={14} className="mr-1.5" />
                                Sincronizar fotos
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openConnect(account)}
                            >
                              <Icon icon="mdi:qrcode-scan" size={14} className="mr-1.5" />
                              {account.status === "connected" ? "Conexão" : "Conectar"}
                            </Button>
                          </>
                        )}
                        <Button variant="outline" size="sm" onClick={() => startEdit(account)}>
                          <Icon icon="mdi:pencil-outline" size={14} className="mr-1.5" />
                          Editar
                        </Button>
                      </div>
                    </div>

                    {/* Delivery metrics (staff-only data; absent → still loading or no access) */}
                    {metrics[account.id] && (
                      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-4">
                        <div className="text-center">
                          <p className="text-lg font-bold text-severity-success">
                            {metrics[account.id]?.sent ?? 0}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Enviadas (30d)</p>
                        </div>
                        <div className="text-center">
                          <p
                            className={`text-lg font-bold ${
                              (metrics[account.id]?.failed ?? 0) > 0
                                ? "text-severity-critical"
                                : "text-muted-foreground"
                            }`}
                          >
                            {metrics[account.id]?.failed ?? 0}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Falhas (30d)</p>
                        </div>
                        <div className="text-center">
                          <p
                            className={`text-lg font-bold ${
                              (metrics[account.id]?.failureRate ?? 0) > 0.05
                                ? "text-severity-critical"
                                : "text-foreground"
                            }`}
                          >
                            {((metrics[account.id]?.failureRate ?? 0) * 100).toFixed(1)}%
                          </p>
                          <p className="text-[11px] text-muted-foreground">Taxa de falha</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium leading-7 text-foreground">
                            {formatLastOutbound(metrics[account.id]?.lastOutboundAt)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Último envio</p>
                        </div>
                      </div>
                    )}

                    {/* Lost connection: inline call to action (SIGPRO-style).
                        Hidden when the Owner has muted this account's alerts. */}
                    {isEvolutionFamily(account.provider) &&
                      account.status === "disconnected" &&
                      !account.alertsMuted && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-severity-critical/40 bg-severity-critical/10 px-3 py-2">
                          <Icon
                            icon="mdi:alert-circle-outline"
                            size={16}
                            className="shrink-0 text-severity-critical"
                          />
                          <p className="text-sm text-foreground">
                            Conexão perdida — mensagens não saem nem chegam por esta conta.
                          </p>
                          <Button
                            size="sm"
                            className="ml-auto"
                            onClick={() => openConnect(account)}
                          >
                            Reconectar
                          </Button>
                        </div>
                      )}
                  </>
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
                      ) : account.provider === "evolution-go" ? (
                        <>
                          <div className="space-y-1.5">
                            <Label htmlFor={`url-${account.id}`}>
                              URL do servidor Evolution Go
                            </Label>
                            <Input
                              id={`url-${account.id}`}
                              className="font-mono"
                              placeholder="https://evogo.ailainteligente.com.br"
                              value={draft?.baseUrl ?? ""}
                              onChange={(e) =>
                                setDraft((d) => (d ? { ...d, baseUrl: e.target.value } : d))
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`iid-${account.id}`}>ID da instância (servidor)</Label>
                            <Input
                              id={`iid-${account.id}`}
                              className="font-mono"
                              value={draft?.instanceId || "—"}
                              readOnly
                              disabled
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Gerado pelo servidor ao parear. Não editável.
                            </p>
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
                      <div className="space-y-1.5">
                        <Label htmlFor={`fpolicy-${account.id}`}>Política de failover</Label>
                        <Select
                          value={draft?.failoverPolicy ?? "disabled"}
                          onValueChange={(v) =>
                            setDraft((d) =>
                              d ? { ...d, failoverPolicy: v as WhatsAppFailoverPolicy } : d,
                            )
                          }
                        >
                          <SelectTrigger id={`fpolicy-${account.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(FAILOVER_POLICY_LABEL) as WhatsAppFailoverPolicy[]).map(
                              (p) => (
                                <SelectItem key={p} value={p}>
                                  {FAILOVER_POLICY_LABEL[p]}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`fbackup-${account.id}`}>Conta reserva</Label>
                        <Select
                          value={draft?.failoverAccountId || "none"}
                          onValueChange={(v) =>
                            setDraft((d) =>
                              d ? { ...d, failoverAccountId: v === "none" ? "" : v } : d,
                            )
                          }
                        >
                          <SelectTrigger id={`fbackup-${account.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhuma</SelectItem>
                            {(accounts ?? [])
                              .filter((a) => a.id !== account.id)
                              .map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.label} ({PROVIDER_LABEL[a.provider]})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          Templates HSM não saem por reserva Evolution — esses envios são bloqueados
                          com aviso enquanto o failover estiver ativo.
                        </p>
                      </div>
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

      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            <p className="font-semibold uppercase tracking-wider text-foreground">
              Conectar uma conta
            </p>
            <p className="mt-1.5">
              Contas Evolution conectam por QR code direto daqui. Contas Meta Cloud API seguem o
              processo assistido (
              <code className="font-mono">docs/dev/whatsapp-meta-provider.md</code>).
            </p>
          </div>
          {(() => {
            const evolutionAccounts = (accounts ?? []).filter((a) => isEvolutionFamily(a.provider));
            const evolution =
              evolutionAccounts.find((a) => a.status !== "connected") ?? evolutionAccounts[0];
            return evolution ? (
              <Button size="sm" onClick={() => openConnect(evolution)}>
                <Icon icon="mdi:qrcode-scan" size={14} className="mr-1.5" />
                Conectar conta
              </Button>
            ) : null;
          })()}
        </div>
      </div>
      <ConnectWhatsAppDialog
        account={connectTarget?.account ?? null}
        initialStep={connectTarget?.step ?? "form"}
        onClose={() => setConnectTarget(null)}
        onMutated={() => void refresh()}
      />
      <TestMessageDialog account={testTarget} onClose={() => setTestTarget(null)} />
      <ImportConversationsDialog account={importTarget} onClose={() => setImportTarget(null)} />
      <ImportContactsDialog
        account={importContactsTarget}
        onClose={() => setImportContactsTarget(null)}
      />
      <ImportHistoryDialog
        account={historyTarget?.account ?? null}
        mode={historyTarget?.mode ?? "import"}
        onClose={() => setHistoryTarget(null)}
      />
      <SyncAvatarsDialog account={syncAvatarsTarget} onClose={() => setSyncAvatarsTarget(null)} />
      <DeleteInstanceDialog
        account={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => void refresh()}
        onDisconnect={(account) => openConnect(account)}
        restoreFocusRef={pageRef}
      />
      {accessAccount && (
        <InstanceAccessSheet
          account={accessAccount}
          storeId={storeId}
          sellers={sellers}
          onClose={(changed) => {
            setAccessAccount(null);
            if (changed) void refresh();
          }}
        />
      )}
      {wizardOpen && (
        <AddInstanceWizard
          storeId={storeId}
          accounts={accounts ?? []}
          onClose={() => {
            setWizardOpen(false);
            void refresh();
          }}
          onCreated={(newId) => {
            setWizardOpen(false);
            void (async () => {
              await refresh();
              try {
                setAccessAccount(await provider.get(newId));
              } catch {
                /* the new card still shows "configurar acesso" */
              }
            })();
          }}
        />
      )}
    </div>
  );
}
