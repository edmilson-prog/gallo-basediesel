import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { useWahaServersProvider } from "@/providers/data";
import type { IWahaServer, WhatsAppAccountPurpose } from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { invokeWaha, WahaConnectError } from "../api/wahaConnect";

/**
 * Dedicated WAHA tab (Configurações → WhatsApp). Fully isolated from the
 * Meta/Evolution/Evolution Go "Contas" tab — WAHA sessions are read/written
 * directly against `whatsapp_accounts` (scoped to `provider='waha'`) and
 * managed exclusively through the `waha-connect` Edge Function, mirroring the
 * edge's own isolation (see `supabase/functions/waha-connect/index.ts`).
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

type WahaAccountStatus = "connected" | "disconnected" | "pending";

const STATUS_VISUAL: Record<WahaAccountStatus, { label: string; className: string; icon: string }> =
  {
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

interface IWahaAccountRow {
  id: string;
  store_id: string;
  label: string;
  phone_number: string | null;
  status: WahaAccountStatus;
  purpose: WhatsAppAccountPurpose;
  provider_config: { sessionName?: string } | null;
  created_at: string;
}

async function fetchWahaAccounts(storeId: string): Promise<IWahaAccountRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("whatsapp_accounts")
    .select("id, store_id, label, phone_number, status, purpose, provider_config, created_at")
    .eq("provider", "waha")
    .eq("store_id", storeId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`[waha] list failed: ${error.message}`);
  return (data ?? []) as unknown as IWahaAccountRow[];
}

export function WahaSection({ storeId }: { storeId: string }) {
  const [accounts, setAccounts] = useState<IWahaAccountRow[] | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IWahaAccountRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setAccounts(await fetchWahaAccounts(storeId));
    } catch {
      setAccounts([]);
    }
  }, [storeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRestart = async (row: IWahaAccountRow) => {
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

  const handleLogout = async (row: IWahaAccountRow) => {
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await invokeWaha({ accountId: deleteTarget.id, action: "delete" });
      toast.success(`Sessão "${deleteTarget.label}" excluída.`);
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      const code = err instanceof WahaConnectError ? err.code : undefined;
      if (code === "HAS_LINKED_DATA") {
        toast.error("Esta sessão tem conversas vinculadas e não pode ser excluída.");
      } else {
        toast.error(err instanceof Error ? err.message : "Não foi possível excluir a sessão.");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <Icon icon="mdi:server-network" size={16} className="mt-0.5 shrink-0" />
          <p>
            Sessões WAHA conectam a um servidor cadastrado em{" "}
            <strong>Configurações → Integrações &amp; Chaves</strong>. Esta aba não interfere nas
            contas Meta/Evolution acima.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end">
        <Button onClick={() => setWizardOpen(true)} title="Cria uma nova sessão WAHA">
          <Icon icon="lucide:plus" size={14} className="mr-1.5" />
          Nova sessão WAHA
        </Button>
      </div>

      {!accounts ? (
        <Skeleton className="h-32 w-full" />
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          Nenhuma sessão WAHA cadastrada para esta loja.
        </div>
      ) : (
        <ul className="space-y-3">
          {accounts.map((row) => {
            const status = STATUS_VISUAL[row.status];
            const sessionName = row.provider_config?.sessionName ?? "—";
            const busy = busyId === row.id;
            return (
              <li key={row.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                      <Icon icon="mdi:whatsapp" size={20} className="text-emerald-600" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{row.label}</p>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                          {PURPOSE_LABEL[row.purpose]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {row.phone_number || "Sem número ainda"} ·{" "}
                        <span className="font-mono">{sessionName}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={status.className}>
                      <Icon icon={status.icon} size={12} className="mr-1" />
                      {status.label}
                    </Badge>
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
                          <Icon icon="mdi:dots-vertical" size={18} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={busy} onSelect={() => void handleRestart(row)}>
                          <Icon icon="mdi:restart" size={15} className="mr-2" />
                          Reiniciar
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={busy} onSelect={() => void handleLogout(row)}>
                          <Icon icon="mdi:logout-variant" size={15} className="mr-2" />
                          Logout
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={busy}
                          onSelect={() => setDeleteTarget(row)}
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        >
                          <Icon icon="mdi:trash-can-outline" size={15} className="mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
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
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(true);
  const [pairingError, setPairingError] = useState<string | null>(null);

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
      });
      setAccountId(created.id);
      setPhase("pairing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar a sessão WAHA.");
      setPhase("form");
    }
  }

  // QR polling — refreshes the code every ~3s while pairing is on screen.
  useEffect(() => {
    if (phase !== "pairing" || !accountId) return;
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
  }, [phase, accountId]);

  // State polling — closes the dialog and toasts success once connected.
  useEffect(() => {
    if (phase !== "pairing" || !accountId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void invokeWaha<{ state: string; phoneNumber?: string }>({ accountId, action: "state" })
        .then((data) => {
          if (cancelled) return;
          if (data.state === "connected") {
            cancelled = true;
            clearInterval(timer);
            toast.success(`Sessão conectada${data.phoneNumber ? ` · ${data.phoneNumber}` : ""}.`);
            onCreated();
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
  }, [phase, accountId, onCreated]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
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
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
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
          <div className="space-y-3 py-2 text-center">
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
                  No WhatsApp do número: <strong>Aparelhos conectados → Conectar aparelho</strong>.
                  O código é atualizado automaticamente.
                </p>
              </>
            )}
            {pairingError && <p className="text-xs text-severity-critical">{pairingError}</p>}
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
