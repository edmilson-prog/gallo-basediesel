import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type {
  ISeller,
  IWahaServer,
  IWahaSessionConfig,
  IWhatsAppAccount,
  IWhatsAppAccountAccessRule,
  IWhatsAppProviderConfig,
  WhatsAppAccountPurpose,
} from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import {
  getActiveDataSource,
  recordAuditLogSync,
  useSellersProvider,
  useWahaServersProvider,
  useWhatsAppAccountsProvider,
  type IWhatsAppAccountMetrics,
} from "@/providers/data";
import { InstanceAccessSheet } from "./InstanceAccessSheet";
import { resolveAccessRecipients } from "../utils/accessRecipients";
import { INSTANCE_PALETTE } from "@/features/conversations/utils/instanceAccent";
import { invokeWaha, WahaConnectError } from "../api/wahaConnect";

/**
 * Dedicated WAHA tab (Configurações → WhatsApp). Fully isolated from the
 * Meta/Evolution/Evolution Go "Contas" tab — WAHA sessions ARE full
 * `whatsapp_accounts` rows (`provider='waha'`), read here via the additive
 * `whatsappAccounts.listWaha` (the generic `list()` excludes WAHA on purpose)
 * and managed exclusively through the `waha-connect` Edge Function, mirroring
 * the edge's own isolation (see `supabase/functions/waha-connect/index.ts`).
 *
 * The card mirrors the Meta/Evolution rich card (access pill, color, metrics)
 * minus what does not apply to WAHA — no failover, no HSM/capability chips, no
 * Evolution-family import/test actions.
 */

const PURPOSE_LABEL: Record<WhatsAppAccountPurpose, string> = {
  atendimento: "Atendimento",
  campanha: "Campanha",
  ambos: "Atendimento + Campanha",
};

const PURPOSE_OPTIONS: Array<{ value: WhatsAppAccountPurpose; label: string }> = [
  { value: "atendimento", label: "Atendimento" },
  { value: "campanha", label: "Campanha" },
  { value: "ambos", label: "Atendimento + Campanha" },
];

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

/**
 * Health is DERIVED from `status` — WAHA has no meaningful failover
 * `currentState` machinery (unlike the PRD-120 Meta/Evolution health tick).
 */
function deriveHealth(status: IWhatsAppAccount["status"]): {
  label: string;
  className: string;
  icon: string;
} {
  if (status === "connected") {
    return {
      label: "Saudável",
      className: "border-severity-success/40 bg-severity-success/10 text-severity-success",
      icon: "mdi:heart-pulse",
    };
  }
  if (status === "disconnected") {
    return {
      label: "Indisponível",
      className: "border-severity-critical/40 bg-severity-critical/10 text-severity-critical",
      icon: "mdi:close-circle-outline",
    };
  }
  return {
    label: "Conectando",
    className: "border-border bg-muted text-muted-foreground",
    icon: "mdi:progress-clock",
  };
}

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
 * All "process this chat type" filters OFF by default — a fresh WAHA session
 * only processes ordinary 1:1 commercial conversations until someone opts in.
 */
const DEFAULT_WAHA_CONFIG: IWahaSessionConfig = {
  chatFilters: { groups: false, status: false, channels: false, broadcast: false },
  debug: false,
};

const CHAT_FILTER_OPTIONS: Array<{
  key: keyof IWahaSessionConfig["chatFilters"];
  label: string;
  hint: string;
}> = [
  { key: "groups", label: "Grupos", hint: "Processa mensagens recebidas em grupos do WhatsApp." },
  { key: "status", label: "Status", hint: "Processa atualizações de Status (stories)." },
  { key: "channels", label: "Canais", hint: "Processa mensagens de Canais do WhatsApp." },
  { key: "broadcast", label: "Broadcast", hint: "Processa mensagens de listas de transmissão." },
];

/** Derives the platform's WAHA webhook URL from the same env var the Supabase client reads. */
function wahaWebhookUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL;
  return base ? `${base}/functions/v1/waha-webhook` : "/functions/v1/waha-webhook";
}

/**
 * Controlled form for {@link IWahaSessionConfig}, shared by the creation
 * wizard's "Avançado" disclosure and the standalone {@link WahaParamsDialog}.
 * `device` is always rendered disabled — v1 does not detect the underlying
 * WAHA engine, and GOWS (the only engine in prod) ignores this per-session
 * anyway (it is set via server env vars). Metadata/engine-store settings are
 * intentionally not exposed here.
 */
function WahaParamsForm({
  value,
  onChange,
}: {
  value: IWahaSessionConfig;
  onChange: (next: IWahaSessionConfig) => void;
}) {
  const setChatFilter = (key: keyof IWahaSessionConfig["chatFilters"], checked: boolean) => {
    onChange({ ...value, chatFilters: { ...value.chatFilters, [key]: checked } });
  };

  const setProxyField = (field: "server" | "username" | "password", next: string) => {
    if (field === "server" && !next.trim()) {
      // Clearing the server drops the whole proxy — keeps provider_config clean.
      const { proxy: _drop, ...rest } = value;
      onChange(rest);
      return;
    }
    onChange({
      ...value,
      proxy: {
        server: value.proxy?.server ?? "",
        username: value.proxy?.username,
        password: value.proxy?.password,
        [field]: next,
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Tipos de conversa ------------------------------------------------ */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tipos de conversa
        </p>
        <div className="space-y-3 rounded-md border border-border p-3">
          {CHAT_FILTER_OPTIONS.map((opt) => (
            <div key={opt.key} className="flex items-center justify-between gap-3">
              <div>
                <Label
                  htmlFor={`waha-filter-${opt.key}`}
                  className="text-sm font-normal text-foreground"
                >
                  {opt.label}
                </Label>
                <p className="text-xs text-muted-foreground">{opt.hint}</p>
              </div>
              <Switch
                id={`waha-filter-${opt.key}`}
                checked={value.chatFilters[opt.key]}
                onCheckedChange={(checked) => setChatFilter(opt.key, checked)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Depuração --------------------------------------------------------- */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Depuração
        </p>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <div>
            <Label htmlFor="waha-debug" className="text-sm font-normal text-foreground">
              Modo depuração
            </Label>
            <p className="text-xs text-muted-foreground">
              Registra eventos detalhados da sessão para diagnóstico.
            </p>
          </div>
          <Switch
            id="waha-debug"
            checked={value.debug}
            onCheckedChange={(checked) => onChange({ ...value, debug: checked })}
          />
        </div>
      </div>

      {/* Proxy -------------------------------------------------------------- */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proxy</p>
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="waha-proxy-server" className="text-xs">
              Servidor (opcional)
            </Label>
            <Input
              id="waha-proxy-server"
              value={value.proxy?.server ?? ""}
              onChange={(e) => setProxyField("server", e.target.value)}
              placeholder="http://host:porta"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="waha-proxy-username" className="text-xs">
                Usuário (opcional)
              </Label>
              <Input
                id="waha-proxy-username"
                value={value.proxy?.username ?? ""}
                onChange={(e) => setProxyField("username", e.target.value)}
                disabled={!value.proxy?.server}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="waha-proxy-password" className="text-xs">
                Senha (opcional)
              </Label>
              <Input
                id="waha-proxy-password"
                type="password"
                value={value.proxy?.password ?? ""}
                onChange={(e) => setProxyField("password", e.target.value)}
                disabled={!value.proxy?.server}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dispositivo --------------------------------------------------------- */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Dispositivo
        </p>
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="waha-device-name" className="text-xs">
                Nome
              </Label>
              <Input
                id="waha-device-name"
                value={value.device?.name ?? ""}
                disabled
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="waha-device-browser" className="text-xs">
                Navegador
              </Label>
              <Input
                id="waha-device-browser"
                value={value.device?.browser ?? ""}
                disabled
                placeholder="—"
              />
            </div>
          </div>
          <p className="flex items-start gap-1.5 rounded-md border border-severity-warning/40 bg-severity-warning/10 px-2.5 py-2 text-xs text-severity-warning">
            <Icon icon="mdi:alert-outline" size={14} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              O engine GOWS aplica isto por variáveis de ambiente do servidor, não por sessão.
            </span>
          </p>
        </div>
      </div>

      {/* Webhooks (read-only) -------------------------------------------- */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Webhooks
        </p>
        <div className="space-y-1.5 rounded-md border border-border p-3">
          <Label htmlFor="waha-webhook-url" className="text-xs">
            URL de recebimento
          </Label>
          <Input
            id="waha-webhook-url"
            value={wahaWebhookUrl()}
            disabled
            readOnly
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">Gerenciado pela plataforma.</p>
        </div>
      </div>
    </div>
  );
}

export function WahaSection({ storeId }: { storeId: string }) {
  const provider = useWhatsAppAccountsProvider();
  const sellersProvider = useSellersProvider();
  const wahaServersProvider = useWahaServersProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();

  const [accounts, setAccounts] = useState<IWhatsAppAccount[] | null>(null);
  const [metrics, setMetrics] = useState<Record<string, IWhatsAppAccountMetrics>>({});
  const [accessRules, setAccessRules] = useState<Record<string, IWhatsAppAccountAccessRule[]>>({});
  const [rawStates, setRawStates] = useState<Record<string, string>>({});
  const [sellers, setSellers] = useState<ISeller[]>([]);
  const [servers, setServers] = useState<IWahaServer[]>([]);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IWhatsAppAccount | null>(null);
  const [pairingTarget, setPairingTarget] = useState<IWhatsAppAccount | null>(null);
  const [accessAccount, setAccessAccount] = useState<IWhatsAppAccount | null>(null);
  const [paramsTarget, setParamsTarget] = useState<IWhatsAppAccount | null>(null);
  const [linkedBlockedId, setLinkedBlockedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Inline "Editar" (rename label only — `update` does not patch purpose).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

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

  // Raw session state (SCAN_QR_CODE vs STARTING) — only meaningful against a
  // real WAHA server, so skip in demo mode. Decorative: never blocks render.
  const loadRawStates = useCallback(async (list: IWhatsAppAccount[]) => {
    if (getActiveDataSource() === "mock") return;
    const entries = await Promise.all(
      list.map(async (account) => {
        try {
          const res = await invokeWaha<{ state: string; rawState: string }>({
            accountId: account.id,
            action: "state",
          });
          return [account.id, res.rawState] as const;
        } catch {
          return null; // a stopped/unreachable session just has no raw state
        }
      }),
    );
    const loaded: Record<string, string> = {};
    for (const entry of entries) if (entry) loaded[entry[0]] = entry[1];
    setRawStates(loaded);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await provider.listWaha({ storeId });
      setAccounts(list);
      void loadMetrics(list);
      void loadAccessRules(list);
      void loadRawStates(list);
    } catch {
      setAccounts([]);
    }
  }, [provider, storeId, loadMetrics, loadAccessRules, loadRawStates]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  useEffect(() => {
    let cancelled = false;
    void wahaServersProvider
      .list()
      .then((list) => {
        if (!cancelled) setServers(list);
      })
      .catch(() => {
        /* server name resolution is decorative — falls back to "—" */
      });
    return () => {
      cancelled = true;
    };
  }, [wahaServersProvider]);

  const handleRestart = async (row: IWhatsAppAccount) => {
    setBusyId(row.id);
    try {
      await invokeWaha({ accountId: row.id, action: "restart" });
      toast.success(`Sessão "${row.label}" reiniciada.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível reiniciar a sessão.");
    } finally {
      setBusyId(null);
    }
  };

  const handleLogout = async (row: IWhatsAppAccount) => {
    setBusyId(row.id);
    try {
      await invokeWaha({ accountId: row.id, action: "logout" });
      toast.success(`Sessão "${row.label}" desconectada.`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível desconectar a sessão.");
    } finally {
      setBusyId(null);
    }
  };

  /**
   * A logged-out/disconnected session has no UI path back to a QR code
   * otherwise — "Reiniciar" alone restarts the WAHA session but nothing in
   * this screen ever displays the fresh QR it produces. Restart first to nudge
   * the session back towards SCAN_QR_CODE, then reopen the same QR pairing view
   * the creation wizard uses, scoped to this existing account.
   */
  const handleRepair = async (row: IWhatsAppAccount) => {
    setBusyId(row.id);
    try {
      await invokeWaha({ accountId: row.id, action: "restart" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível reiniciar a sessão.");
      setBusyId(null);
      return;
    }
    setBusyId(null);
    setPairingTarget(row);
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleting(true);
    try {
      await invokeWaha({ accountId: target.id, action: "delete" });
      toast.success(`Sessão "${target.label}" excluída.`);
      setLinkedBlockedId((prev) => (prev === target.id ? null : prev));
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      const code = err instanceof WahaConnectError ? err.code : undefined;
      if (code === "HAS_LINKED_DATA") {
        toast.error("Esta sessão tem conversas vinculadas e não pode ser excluída.");
        setLinkedBlockedId(target.id);
        setDeleteTarget(null); // close the dialog so the inline note is visible
      } else {
        toast.error(err instanceof Error ? err.message : "Não foi possível excluir a sessão.");
      }
    } finally {
      setDeleting(false);
    }
  };

  // Per-instance identity color: persisted in provider_config (jsonb). Spreads
  // the existing config so sessionName/waha settings survive; null → auto/hash.
  const setAccentColor = async (row: IWhatsAppAccount, hex: string | null) => {
    const nextConfig: IWhatsAppProviderConfig = { ...(row.providerConfig ?? {}) };
    if (hex) nextConfig.accentColor = hex;
    else delete nextConfig.accentColor;
    try {
      await provider.update(row.id, { providerConfig: nextConfig });
      await refresh();
    } catch {
      toast.error("Não foi possível salvar a cor da sessão.");
    }
  };

  // Owner shelves an intentionally offline session: silence its disconnection
  // alerts (card banner + global banner/TopBar). Audited, reversible.
  const handleToggleAlertsMuted = async (row: IWhatsAppAccount) => {
    const next = !row.alertsMuted;
    setBusyId(row.id);
    try {
      await provider.update(row.id, { alertsMuted: next });
      if (currentUser?.sellerId) {
        recordAuditLogSync({
          storeId,
          actorId: currentUser.sellerId,
          action: "whatsapp_alerts_muted_toggle",
          resource: "whatsapp_account",
          resourceId: row.id,
          after: { alertsMuted: next },
        });
      }
      toast.success(
        next
          ? "Alertas de desconexão silenciados para esta sessão."
          : "Alertas de desconexão reativados para esta sessão.",
      );
      await refresh();
      // The shell banner/TopBar read a separate query — nudge it so the change
      // reflects immediately instead of waiting for the next poll/focus.
      void queryClient.invalidateQueries({ queryKey: ["shell", "whatsapp-connection-status"] });
    } catch {
      toast.error("Não foi possível alterar os alertas da sessão.");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (row: IWhatsAppAccount) => {
    setEditingId(row.id);
    setDraftLabel(row.label);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftLabel("");
  };

  const handleSaveLabel = async (row: IWhatsAppAccount) => {
    const label = draftLabel.trim();
    if (!label) {
      toast.error("Informe um nome para a sessão.");
      return;
    }
    setSavingEdit(true);
    try {
      await provider.update(row.id, { label });
      toast.success("Sessão atualizada.");
      cancelEdit();
      await refresh();
    } catch {
      toast.error("Não foi possível salvar a sessão.");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <Icon icon="mdi:server-network" size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            Sessões WAHA conectam a um servidor cadastrado em{" "}
            <strong>Configurações → Integrações &amp; Chaves</strong>. Esta aba não interfere nas
            contas Meta/Evolution acima.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end">
        <Button onClick={() => setWizardOpen(true)} title="Cria uma nova sessão WAHA">
          <Icon icon="lucide:plus" size={14} className="mr-1.5" aria-hidden />
          Nova sessão WAHA
        </Button>
      </div>

      {!accounts ? (
        <Skeleton className="h-32 w-full" />
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          <p>Nenhuma sessão WAHA cadastrada para esta loja.</p>
          <Button className="mt-4" onClick={() => setWizardOpen(true)}>
            <Icon icon="lucide:plus" size={14} className="mr-1.5" aria-hidden />
            Nova sessão WAHA
          </Button>
        </div>
      ) : (
        <ul className="space-y-4">
          {accounts.map((row) => {
            const status = STATUS_VISUAL[row.status];
            const health = deriveHealth(row.status);
            const sessionName = row.providerConfig?.sessionName ?? "—";
            const serverName = servers.find((s) => s.id === row.wahaServerId)?.name ?? "—";
            const busy = busyId === row.id;
            const isEditing = editingId === row.id;
            const rowMetrics = metrics[row.id];
            return (
              <li key={row.id} className="rounded-lg border border-border bg-card p-5">
                {/* Header ------------------------------------------------- */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-severity-success/10"
                    >
                      <Icon icon="mdi:whatsapp" size={20} className="text-severity-success" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{row.label}</p>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                          {PURPOSE_LABEL[row.purpose]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {row.phoneNumber || "Sem número ainda"} ·{" "}
                        <span className="font-mono">{sessionName}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">WAHA</Badge>
                    <Badge
                      variant="outline"
                      className={status.className}
                      aria-label={`Status: ${status.label}`}
                    >
                      <Icon icon={status.icon} size={12} className="mr-1" aria-hidden />
                      {status.label}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={health.className}
                      aria-label={`Saúde: ${health.label}`}
                    >
                      <Icon icon={health.icon} size={12} className="mr-1" aria-hidden />
                      {health.label}
                    </Badge>
                    {row.alertsMuted && (
                      <Badge
                        variant="outline"
                        className="border-border bg-muted text-muted-foreground"
                        title="Alertas de desconexão silenciados para esta sessão"
                      >
                        <Icon icon="mdi:bell-off-outline" size={12} className="mr-1" aria-hidden />
                        Alertas silenciados
                      </Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={busy}
                          aria-label="Mais ações"
                          title="Mais ações"
                        >
                          <Icon icon="mdi:dots-vertical" size={18} aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {row.status !== "connected" && (
                          <DropdownMenuItem disabled={busy} onSelect={() => void handleRepair(row)}>
                            <Icon icon="mdi:qrcode" size={15} className="mr-2" aria-hidden />
                            Parear novamente
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          disabled={busy}
                          onSelect={() => void handleToggleAlertsMuted(row)}
                        >
                          <Icon
                            icon={
                              row.alertsMuted ? "mdi:bell-ring-outline" : "mdi:bell-off-outline"
                            }
                            size={15}
                            className="mr-2"
                            aria-hidden
                          />
                          {row.alertsMuted
                            ? "Reativar alertas de desconexão"
                            : "Silenciar alertas de desconexão"}
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={busy} onSelect={() => void handleLogout(row)}>
                          <Icon icon="mdi:logout-variant" size={15} className="mr-2" aria-hidden />
                          Logout
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={busy}
                          onSelect={() => setDeleteTarget(row)}
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        >
                          <Icon
                            icon="mdi:trash-can-outline"
                            size={15}
                            className="mr-2"
                            aria-hidden
                          />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Access pill ------------------------------------------- */}
                <div className="mt-3">
                  {(() => {
                    const recipients = resolveAccessRecipients(
                      accessRules[row.id] ?? [],
                      sellers.map((s) => ({ id: s.id, role: "", storeId: s.storeId })),
                    );
                    const none = recipients.size === 0;
                    return (
                      <button
                        type="button"
                        onClick={() => setAccessAccount(row)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          none
                            ? "border-severity-warning/40 bg-severity-warning/10 text-severity-warning"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                        title="Configurar quem acessa esta sessão"
                      >
                        <Icon icon="mdi:account-group-outline" size={13} aria-hidden />
                        {none
                          ? "Ninguém vê — configurar acesso"
                          : `${recipients.size} ${recipients.size === 1 ? "pessoa" : "pessoas"} • configurar acesso`}
                      </button>
                    );
                  })()}
                </div>

                {/* Color picker ------------------------------------------ */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Cor da sessão</span>
                  <div className="flex items-center gap-1.5">
                    {INSTANCE_PALETTE.map((hex) => {
                      const active = row.providerConfig?.accentColor === hex;
                      return (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => void setAccentColor(row, hex)}
                          aria-label={`Usar a cor ${hex}`}
                          aria-pressed={active}
                          className={`size-5 cursor-pointer rounded-full transition-transform motion-safe:hover:scale-110 motion-reduce:transition-none ${
                            active ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : ""
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => void setAccentColor(row, null)}
                      aria-label="Cor automática"
                      aria-pressed={!row.providerConfig?.accentColor}
                      title="Automático (cor pelo identificador)"
                      className={`flex size-5 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground ${
                        !row.providerConfig?.accentColor
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                          : ""
                      }`}
                    >
                      <Icon icon="mdi:auto-fix" size={12} aria-hidden />
                    </button>
                  </div>
                </div>

                {!isEditing ? (
                  <>
                    {/* Details + actions --------------------------------- */}
                    <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
                      <dl className="grid gap-x-8 gap-y-1 text-xs sm:grid-cols-3">
                        <div>
                          <dt className="text-muted-foreground">Servidor WAHA</dt>
                          <dd className="text-foreground">{serverName}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Sessão</dt>
                          <dd className="font-mono text-foreground">{sessionName}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Número</dt>
                          <dd className="text-foreground">{row.phoneNumber || "—"}</dd>
                        </div>
                      </dl>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleRestart(row)}
                        >
                          <Icon icon="mdi:restart" size={14} className="mr-1.5" aria-hidden />
                          Reiniciar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => setParamsTarget(row)}
                        >
                          <Icon icon="mdi:tune-variant" size={14} className="mr-1.5" aria-hidden />
                          Parâmetros
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => startEdit(row)}>
                          <Icon
                            icon="mdi:pencil-outline"
                            size={14}
                            className="mr-1.5"
                            aria-hidden
                          />
                          Editar
                        </Button>
                      </div>
                    </div>

                    {/* Delivery metrics (staff-only data; absent → loading/no access) */}
                    {rowMetrics && (
                      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-4">
                        <div className="text-center">
                          <p className="text-lg font-bold text-severity-success">
                            {rowMetrics.sent}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Enviadas (30d)</p>
                        </div>
                        <div className="text-center">
                          <p
                            className={`text-lg font-bold ${
                              rowMetrics.failed > 0
                                ? "text-severity-critical"
                                : "text-muted-foreground"
                            }`}
                          >
                            {rowMetrics.failed}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Falhas (30d)</p>
                        </div>
                        <div className="text-center">
                          <p
                            className={`text-lg font-bold ${
                              rowMetrics.failureRate > 0.05
                                ? "text-severity-critical"
                                : "text-foreground"
                            }`}
                          >
                            {(rowMetrics.failureRate * 100).toFixed(1)}%
                          </p>
                          <p className="text-[11px] text-muted-foreground">Taxa de falha</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium leading-7 text-foreground">
                            {formatLastOutbound(rowMetrics.lastOutboundAt)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Último envio</p>
                        </div>
                      </div>
                    )}

                    {/* Lost connection: hero call to action. Hidden when muted. */}
                    {row.status === "disconnected" && !row.alertsMuted && (
                      <div
                        role="alert"
                        className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-severity-critical/40 bg-severity-critical/10 px-3 py-2"
                      >
                        <Icon
                          icon="mdi:alert-circle-outline"
                          size={16}
                          className="shrink-0 text-severity-critical"
                          aria-hidden
                        />
                        <p className="text-sm text-foreground">
                          Conexão perdida — mensagens não saem nem chegam.
                        </p>
                        <Button
                          size="sm"
                          className="ml-auto"
                          disabled={busy}
                          onClick={() => void handleRepair(row)}
                        >
                          Reconectar
                        </Button>
                      </div>
                    )}

                    {/* Awaiting QR scan (raw SCAN_QR_CODE): actionable pairing. */}
                    {rawStates[row.id] === "SCAN_QR_CODE" && (
                      <div
                        role="alert"
                        className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-severity-warning/40 bg-severity-warning/10 px-3 py-2"
                      >
                        <Icon
                          icon="mdi:qrcode-scan"
                          size={16}
                          className="shrink-0 text-severity-warning"
                          aria-hidden
                        />
                        <p className="text-sm text-foreground">Aguardando leitura do QR.</p>
                        <Button
                          size="sm"
                          className="ml-auto"
                          disabled={busy}
                          onClick={() => setPairingTarget(row)}
                        >
                          Parear
                        </Button>
                      </div>
                    )}

                    {/* Delete blocked by linked conversations. */}
                    {linkedBlockedId === row.id && (
                      <div className="mt-3 flex items-center gap-2 rounded-md border border-severity-warning/40 bg-severity-warning/10 px-3 py-2">
                        <Icon
                          icon="mdi:link-variant-off"
                          size={16}
                          className="shrink-0 text-severity-warning"
                          aria-hidden
                        />
                        <p className="text-sm text-foreground">
                          Conversas vinculadas impedem a exclusão.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-4 space-y-4 border-t border-border pt-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`waha-label-${row.id}`}>Nome da sessão</Label>
                      <Input
                        id={`waha-label-${row.id}`}
                        value={draftLabel}
                        onChange={(e) => setDraftLabel(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveLabel(row)}
                        disabled={savingEdit || !draftLabel.trim()}
                      >
                        {savingEdit ? "Salvando…" : "Salvar"}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a sessão "{deleteTarget?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A sessão no servidor WAHA será desconectada e apagada, junto com o cadastro desta
              conta. Esta ação é permanente e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault(); // keep the dialog open while deleting / on error
                void handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Icon
                icon={deleting ? "mdi:loading" : "mdi:trash-can-outline"}
                size={15}
                className={`mr-1.5 ${deleting ? "animate-spin" : ""}`}
                aria-hidden
              />
              {deleting ? "Excluindo…" : "Excluir sessão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {wizardOpen && (
        <WahaWizard
          storeId={storeId}
          onClose={() => setWizardOpen(false)}
          onCreated={() => {
            setWizardOpen(false);
            void refresh();
          }}
        />
      )}

      {pairingTarget && (
        <WahaPairingDialog
          accountId={pairingTarget.id}
          label={pairingTarget.label}
          onClose={() => setPairingTarget(null)}
          onConnected={(phoneNumber) => {
            toast.success(`Sessão reconectada${phoneNumber ? ` · ${phoneNumber}` : ""}.`);
            setPairingTarget(null);
            void refresh();
          }}
        />
      )}

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

      {paramsTarget && (
        <WahaParamsDialog
          account={paramsTarget}
          onClose={() => setParamsTarget(null)}
          onSaved={() => {
            setParamsTarget(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

type WizardPhase = "form" | "creating" | "pairing";

function WahaWizard({
  storeId,
  onClose,
  onCreated,
}: {
  storeId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const wahaServersProvider = useWahaServersProvider();
  const [servers, setServers] = useState<IWahaServer[]>([]);
  const [serversLoaded, setServersLoaded] = useState(false);
  const [serverId, setServerId] = useState("");
  const [label, setLabel] = useState("");
  const [purpose, setPurpose] = useState<WhatsAppAccountPurpose>("atendimento");
  const [phase, setPhase] = useState<WizardPhase>("form");
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [config, setConfig] = useState<IWahaSessionConfig>(DEFAULT_WAHA_CONFIG);

  useEffect(() => {
    let cancelled = false;
    wahaServersProvider
      .list()
      .then((list) => {
        if (cancelled) return;
        setServers(list);
        if (list.length === 1) setServerId(list[0]!.id); // auto-select the only one
        setServersLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setServersLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [wahaServersProvider]);

  const canCreate = useMemo(
    () => Boolean(label.trim()) && servers.length > 0 && Boolean(serverId),
    [label, servers, serverId],
  );

  async function handleCreate() {
    setError(null);
    if (!label.trim()) {
      setError("Informe um nome para a sessão.");
      return;
    }
    if (servers.length === 0 || !serverId) {
      setError("Selecione o servidor WAHA.");
      return;
    }
    setPhase("creating");
    try {
      const created = await invokeWaha<{ id: string; sessionName: string }>({
        action: "create",
        storeId,
        label: label.trim(),
        purpose,
        wahaServerId: serverId,
        sessionConfig: config,
      });
      setAccountId(created.id);
      setPhase("pairing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar a sessão WAHA.");
      setPhase("form");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova sessão WAHA</DialogTitle>
          <DialogDescription>
            Cria uma sessão no servidor WAHA cadastrado e conecta por QR code.
          </DialogDescription>
        </DialogHeader>

        {phase === "form" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="waha-wizard-label">Nome da sessão</Label>
              <Input
                id="waha-wizard-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex.: Comercial Volvo"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="waha-wizard-purpose">Finalidade</Label>
              <Select
                value={purpose}
                onValueChange={(v) => setPurpose(v as WhatsAppAccountPurpose)}
              >
                <SelectTrigger id="waha-wizard-purpose">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PURPOSE_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="waha-wizard-server">Servidor WAHA</Label>
              {!serversLoaded ? (
                <Skeleton className="h-9 w-full" />
              ) : servers.length === 0 ? (
                <div className="rounded-lg border border-severity-warning/40 bg-severity-warning/10 px-3 py-2 text-xs text-severity-warning">
                  Nenhum servidor WAHA cadastrado.{" "}
                  <Link
                    to="/app/configuracoes/chaves"
                    className="font-medium underline underline-offset-2"
                  >
                    Cadastre um servidor WAHA em Configurações → Chaves
                  </Link>{" "}
                  antes de criar uma sessão.
                </div>
              ) : (
                <Select value={serverId} onValueChange={setServerId}>
                  <SelectTrigger id="waha-wizard-server">
                    <SelectValue placeholder="Selecione o servidor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
                >
                  <span className="flex items-center gap-1.5">
                    <Icon icon="mdi:tune-variant" size={15} aria-hidden />
                    Avançado
                  </span>
                  <Icon
                    icon={advancedOpen ? "mdi:chevron-up" : "mdi:chevron-down"}
                    size={16}
                    aria-hidden
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="max-h-72 overflow-y-auto pr-1">
                  <WahaParamsForm value={config} onChange={setConfig} />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {error && <p className="text-xs text-severity-critical">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={!canCreate} onClick={() => void handleCreate()}>
                Criar e conectar
              </Button>
            </div>
          </div>
        ) : phase === "creating" ? (
          <p className="py-10 text-center text-sm text-primary">
            <Icon icon="mdi:loading" className="mr-1.5 inline animate-spin" size={16} />
            Criando a sessão no servidor WAHA…
          </p>
        ) : (
          <div className="space-y-3 py-2">
            {accountId && (
              <WahaQrPairingPane
                accountId={accountId}
                onConnected={(phoneNumber) => {
                  toast.success(`Sessão conectada${phoneNumber ? ` · ${phoneNumber}` : ""}.`);
                  onCreated();
                }}
              />
            )}
            <div className="flex justify-center">
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Standalone dialog to edit an existing session's {@link IWahaSessionConfig}.
 * Saving always restarts the WAHA session server-side (a brief disconnection,
 * pairing preserved) — never reopens the QR pairing view; the account's own
 * status/QR banners on the card reconcile via the next poll if needed.
 */
function WahaParamsDialog({
  account,
  onClose,
  onSaved,
}: {
  account: IWhatsAppAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState<IWahaSessionConfig>(
    account.providerConfig?.waha ?? DEFAULT_WAHA_CONFIG,
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invokeWaha({ accountId: account.id, action: "updateConfig", sessionConfig: config });
      toast.success("Parâmetros salvos — reiniciando a sessão…");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar os parâmetros.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Parâmetros de "{account.label}"</DialogTitle>
          <DialogDescription>
            Ajusta os filtros de conversa, depuração e proxy desta sessão WAHA.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <WahaParamsForm value={config} onChange={setConfig} />
        </div>

        <p className="flex items-start gap-1.5 rounded-md border border-severity-info/40 bg-severity-info/10 px-3 py-2 text-xs text-severity-info">
          <Icon icon="mdi:information-outline" size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Alterar parâmetros exige reiniciar a sessão — há uma breve desconexão, mas o pareamento
            é preservado (não será preciso ler o QR de novo).
          </span>
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            <Icon
              icon={saving ? "mdi:loading" : "mdi:content-save-outline"}
              size={15}
              className={`mr-1.5 ${saving ? "animate-spin" : ""}`}
              aria-hidden
            />
            {saving ? "Salvando…" : "Salvar e reiniciar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * QR + connection-state polling, shared by the creation wizard's "pairing"
 * phase and the standalone re-pair dialog (`WahaPairingDialog`) opened for
 * an existing, already-created account. No Dialog chrome of its own — the
 * caller wraps it.
 */
function WahaQrPairingPane({
  accountId,
  onConnected,
}: {
  accountId: string;
  onConnected: (phoneNumber?: string) => void;
}) {
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(true);
  const [pairingError, setPairingError] = useState<string | null>(null);

  // QR polling — refreshes the code every ~3s while this pane is on screen.
  useEffect(() => {
    let cancelled = false;
    const fetchQr = async () => {
      try {
        const data = await invokeWaha<{ state: string; qrBase64?: string }>({
          accountId,
          action: "qr",
        });
        if (cancelled) return;
        setQrLoading(false);
        if (data.qrBase64) setQrBase64(data.qrBase64);
        setPairingError(null);
      } catch (err) {
        if (!cancelled) {
          setQrLoading(false);
          setPairingError(err instanceof Error ? err.message : "Não foi possível gerar o QR code.");
        }
      }
    };
    void fetchQr();
    const timer = setInterval(() => void fetchQr(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [accountId]);

  // State polling — reports back once the session reaches "connected".
  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(() => {
      void invokeWaha<{ state: string; phoneNumber?: string }>({ accountId, action: "state" })
        .then((data) => {
          if (cancelled) return;
          if (data.state === "connected") {
            cancelled = true;
            clearInterval(timer);
            onConnected(data.phoneNumber);
          }
        })
        .catch(() => {
          // Transient poll failures are ignored — the next tick keeps trying.
        });
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [accountId, onConnected]);

  return (
    <div className="space-y-3 text-center">
      {qrLoading && !qrBase64 && (
        <p className="py-10 text-sm text-muted-foreground">
          <Icon icon="mdi:loading" className="mr-1.5 inline animate-spin" size={16} />
          Gerando o QR code…
        </p>
      )}
      {qrBase64 && (
        <>
          <img
            src={qrBase64}
            alt="QR code para conectar o WhatsApp"
            className="mx-auto size-56 rounded-lg border border-border"
          />
          <p className="text-xs text-muted-foreground">
            No WhatsApp do número: <strong>Aparelhos conectados → Conectar aparelho</strong>. O
            código é atualizado automaticamente.
          </p>
        </>
      )}
      {pairingError && <p className="text-xs text-severity-critical">{pairingError}</p>}
    </div>
  );
}

/** Re-pair dialog for an existing (already-created) WAHA account — opened after "Parear novamente" restarts the session. */
function WahaPairingDialog({
  accountId,
  label,
  onClose,
  onConnected,
}: {
  accountId: string;
  label: string;
  onClose: () => void;
  onConnected: (phoneNumber?: string) => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Parear "{label}" novamente</DialogTitle>
          <DialogDescription>
            Escaneie o QR code para reconectar esta sessão ao WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <WahaQrPairingPane accountId={accountId} onConnected={onConnected} />
        <div className="flex justify-center">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
