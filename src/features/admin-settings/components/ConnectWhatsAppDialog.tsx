import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IWhatsAppAccount } from "@/shared/types";
import { getActiveDataSource, useWhatsAppAccountsProvider } from "@/providers/data";
import { listIntegrationSecrets, setIntegrationSecret } from "../api/integrationSecrets";
import {
  connectErrorMessage,
  INVALID_CREDENTIALS_REF_MESSAGE,
  isValidCredentialsRef,
  logoutEvolution,
  restartEvolution,
  testEvolutionServer,
} from "../api/whatsappConnect";
import { useEvolutionPairing } from "../hooks/useEvolutionPairing";
import { QrPairingStep } from "./QrPairingStep";

/**
 * Connect dialog for Evolution accounts (spec 2026-06-11): a single Dialog
 * that swaps content across 3 internal steps — instance data → QR pairing →
 * connected. Closing during pairing asks for confirmation. The apikey is
 * write-only: stored via integration-secrets (Vault) and never read back.
 */

export type ConnectDialogStep = "form" | "qr";

export interface IConnectWhatsAppDialogProps {
  /** Evolution account being connected; null = dialog closed. */
  account: IWhatsAppAccount | null;
  initialStep: ConnectDialogStep;
  onClose: () => void;
  /** Fired after any server-side mutation (connect/logout) — refresh the list. */
  onMutated: () => void;
}

export function ConnectWhatsAppDialog({
  account,
  initialStep,
  onClose,
  onMutated,
}: IConnectWhatsAppDialogProps) {
  const provider = useWhatsAppAccountsProvider();
  const isGo = account?.provider === "evolution-go";
  const isMock = useMemo(() => getActiveDataSource() === "mock", []);

  const [step, setStep] = useState<ConnectDialogStep>(initialStep);
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [savedKeyHint, setSavedKeyHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverOk, setServerOk] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<"label" | "url" | "instance" | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  // Re-seed local state whenever the dialog (re)opens for an account.
  useEffect(() => {
    if (!account) return;
    setStep(initialStep);
    setLabel(account.label);
    setBaseUrl(account.providerConfig?.baseUrl ?? "");
    setInstanceName(account.providerConfig?.instanceName ?? "");
    setApiKeyValue("");
    setSavedKeyHint(null);
    setServerOk(false);
    setFormError(null);
    setInvalidField(null);
  }, [account, initialStep]);

  // Saved-key hint (write-only secret): name + last 4 chars, never the value.
  useEffect(() => {
    if (!account || isMock) return;
    setSavedKeyHint(null);
    const secretName = `${account.credentialsRef}_API_KEY`;
    void listIntegrationSecrets()
      .then((secrets) => {
        const found = secrets.find((s) => s.name === secretName);
        setSavedKeyHint(found?.hint ?? null);
      })
      .catch(() => setSavedKeyHint(null));
  }, [account, isMock]);

  const pairing = useEvolutionPairing(step === "qr" && account ? account.id : null);

  const pairingInProgress =
    step === "qr" &&
    (pairing.phase === "qr" || pairing.phase === "connecting" || pairing.phase === "loading-qr");

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    if (pairingInProgress) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  const handleSaveAndTest = async () => {
    if (!account) return;
    setFormError(null);
    setInvalidField(null);
    if (!label.trim() || !baseUrl.trim() || !instanceName.trim()) {
      setInvalidField(!label.trim() ? "label" : !baseUrl.trim() ? "url" : "instance");
      setFormError("Preencha nome, URL do servidor e instância.");
      return;
    }
    if (!/^https?:\/\//.test(baseUrl.trim())) {
      setInvalidField("url");
      setFormError("A URL do servidor deve começar com http(s)://");
      return;
    }
    // The secret name is derived from the account's credentials prefix — a
    // legacy/seed prefix (e.g. "vault://...") would be rejected by the vault
    // with a raw English error; fail early with actionable pt-BR copy.
    if (apiKeyValue.trim() && !isMock && !isValidCredentialsRef(account.credentialsRef)) {
      setFormError(
        `${INVALID_CREDENTIALS_REF_MESSAGE} Edite a conta na lista (campo "Prefixo de credenciais") e tente de novo.`,
      );
      return;
    }
    setBusy(true);
    try {
      // Spread the existing config: keys merged server-side by the edge
      // (e.g. profileName) must survive this form save.
      await provider.update(account.id, {
        label: label.trim(),
        providerConfig: {
          ...account.providerConfig,
          baseUrl: baseUrl.trim().replace(/\/$/, ""),
          instanceName: instanceName.trim(),
        },
      });
      onMutated();
      if (apiKeyValue.trim() && !isMock) {
        try {
          await setIntegrationSecret(
            `${account.credentialsRef}_API_KEY`,
            apiKeyValue.trim(),
            `API key Evolution — ${label.trim()}`,
          );
          setSavedKeyHint(apiKeyValue.trim().slice(-4));
          setApiKeyValue("");
        } catch (err) {
          // integration-secrets is Owner-only; surface its own message (e.g. 403)
          // instead of the generic Evolution copy.
          setFormError(err instanceof Error ? err.message : "Não foi possível salvar a chave.");
          return;
        }
      }
      const result = await testEvolutionServer(account.id);
      setServerOk(result.ok);
      if (result.ok) toast.success("Servidor Evolution respondeu.");
      // The edge syncs whatsapp_accounts.status with the live connection
      // state on `test` — refresh so the card badges reflect reality.
      onMutated();
    } catch (err) {
      setServerOk(false);
      setFormError(connectErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!account) return;
    setBusy(true);
    try {
      await logoutEvolution(account.id);
      toast.success("Conta desconectada.");
      onMutated();
      onClose();
    } catch (err) {
      toast.error(connectErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRestart = async () => {
    if (!account) return;
    setBusy(true);
    try {
      await restartEvolution(account.id);
      toast.success("Instância reiniciada.");
    } catch (err) {
      toast.error(connectErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Connected: refresh the account list once, as soon as we reach `open`.
  const phase = pairing.phase;
  useEffect(() => {
    if (phase === "open") onMutated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <>
      <Dialog open={Boolean(account)} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {step === "form" ? "Conectar conta WhatsApp" : `Conectar — ${account?.label ?? ""}`}
            </DialogTitle>
            <DialogDescription>
              {step === "form"
                ? "Evolution API — a instância já deve existir no servidor."
                : isGo
                  ? "Escaneie o código com o WhatsApp do número (Evolution Go)."
                  : "Escaneie o código com o WhatsApp do número da loja."}
            </DialogDescription>
          </DialogHeader>

          {step === "form" && account && !isGo && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="connect-label">Nome da conta</Label>
                <Input
                  id="connect-label"
                  value={label}
                  onChange={(e) => {
                    setLabel(e.target.value);
                    setInvalidField(null);
                  }}
                  aria-invalid={invalidField === "label" || undefined}
                  aria-describedby={formError ? "connect-form-error" : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="connect-url">URL do servidor Evolution</Label>
                <Input
                  id="connect-url"
                  className="font-mono"
                  inputMode="url"
                  placeholder="https://evolution.exemplo.com.br"
                  value={baseUrl}
                  onChange={(e) => {
                    setBaseUrl(e.target.value);
                    setInvalidField(null);
                    setServerOk(false);
                  }}
                  aria-invalid={invalidField === "url" || undefined}
                  aria-describedby={formError ? "connect-form-error" : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="connect-instance">Nome / ID da instância</Label>
                <Input
                  id="connect-instance"
                  className="font-mono"
                  value={instanceName}
                  onChange={(e) => {
                    setInstanceName(e.target.value);
                    setInvalidField(null);
                    setServerOk(false);
                  }}
                  aria-invalid={invalidField === "instance" || undefined}
                  aria-describedby={formError ? "connect-form-error" : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="connect-apikey">API key</Label>
                <Input
                  id="connect-apikey"
                  type="password"
                  autoComplete="new-password"
                  className="font-mono"
                  placeholder={
                    savedKeyHint ? `••••••••${savedKeyHint}` : "Cole a apikey da instância"
                  }
                  value={apiKeyValue}
                  onChange={(e) => {
                    setApiKeyValue(e.target.value);
                    setInvalidField(null);
                    setServerOk(false);
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  {savedKeyHint
                    ? "Chave salva no cofre — preencha apenas para substituir."
                    : "Gravada criptografada no cofre da plataforma. Nunca é exibida de volta."}
                </p>
              </div>

              {formError && (
                <p
                  id="connect-form-error"
                  role="alert"
                  className="flex items-start gap-1.5 text-sm text-severity-critical"
                >
                  <Icon icon="mdi:alert-circle-outline" size={16} className="mt-0.5 shrink-0" />
                  {formError}
                </p>
              )}
              {serverOk && !formError && (
                <p
                  role="status"
                  className="flex items-center gap-1.5 text-sm text-severity-success"
                >
                  <Icon icon="mdi:check-circle-outline" size={16} />
                  Servidor respondeu — pronto para gerar o QR code.
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={() => void handleSaveAndTest()}>
                  {busy ? "Testando…" : "Salvar e testar servidor"}
                </Button>
                <Button disabled={!serverOk || busy} onClick={() => setStep("qr")}>
                  Gerar QR code
                  <Icon icon="mdi:arrow-right" size={14} className="ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {step === "qr" && account && pairing.phase !== "open" && (
            <div className="space-y-2">
              <QrPairingStep pairing={pairing} />
              {pairing.phase === "error" && !isGo && (
                <div className="flex justify-start">
                  <Button variant="ghost" size="sm" onClick={() => setStep("form")}>
                    <Icon icon="mdi:arrow-left" size={14} className="mr-1.5" />
                    Editar dados da conexão
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === "qr" && account && pairing.phase === "open" && (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-severity-success bg-severity-success/10 motion-safe:animate-in motion-safe:zoom-in">
                <Icon icon="mdi:check" size={32} className="text-severity-success" />
              </span>
              <p role="status" aria-live="polite" className="text-sm font-semibold text-foreground">
                Conectado{pairing.profile.profileName ? ` como ${pairing.profile.profileName}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {pairing.profile.phoneNumber ?? account.phoneNumber} · instância {instanceName}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void handleRestart()}
                >
                  <Icon icon="mdi:restart" size={14} className="mr-1.5" />
                  Reiniciar instância
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void handleDisconnect()}
                >
                  <Icon icon="mdi:link-off" size={14} className="mr-1.5" />
                  Desconectar
                </Button>
                <Button size="sm" autoFocus onClick={onClose}>
                  Concluir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a conexão?</AlertDialogTitle>
            <AlertDialogDescription>
              O pareamento em andamento será interrompido. Você pode reabrir e gerar um novo código
              quando quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar conectando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmClose(false);
                onClose();
              }}
            >
              Cancelar conexão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
