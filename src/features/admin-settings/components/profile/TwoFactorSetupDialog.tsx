import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TotpCodeInput } from "@/features/auth/TotpCodeInput";
import { isCompleteTotpCode } from "@/features/auth/engine/mfaGate";
import {
  type ITotpEnrollment,
  confirmTotpEnrollment,
  startTotpEnrollment,
} from "@/features/auth/mfa";

interface ITwoFactorSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the factor is verified, so the caller can refresh its status. */
  onEnabled: () => void;
}

/**
 * Activation flow for two-factor: enrolls a TOTP factor, shows the QR code to
 * scan (with the secret for manual entry) and confirms it with the first code.
 *
 * The factor only becomes `verified` after that confirmation — abandoning the
 * dialog halfway leaves the account exactly as it was.
 */
export function TwoFactorSetupDialog({
  open,
  onOpenChange,
  onEnabled,
}: ITwoFactorSetupDialogProps) {
  const [enrollment, setEnrollment] = useState<ITotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      setEnrollment(null);
      setCode("");
      setError(null);
      setSecretVisible(false);
      return;
    }
    let cancelled = false;
    setStarting(true);
    setError(null);
    void startTotpEnrollment()
      .then((data) => {
        if (!cancelled) setEnrollment(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Não foi possível iniciar a ativação.");
        }
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const confirm = async (value: string) => {
    if (!enrollment || !isCompleteTotpCode(value) || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      await confirmTotpEnrollment(enrollment.factorId, value);
      onEnabled();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível confirmar o código.");
      setCode("");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ativar verificação em duas etapas</DialogTitle>
          <DialogDescription>
            Escaneie o código abaixo com um aplicativo autenticador (Google Authenticator, Authy,
            1Password) e confirme com o código gerado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-center">
            {starting || !enrollment ? (
              <Skeleton className="size-44 rounded-lg" />
            ) : (
              <img
                src={enrollment.qrCode}
                alt="QR Code para o aplicativo autenticador"
                className="size-44 rounded-lg border border-border bg-white p-2"
              />
            )}
          </div>

          {enrollment && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-center">
              {secretVisible ? (
                <p className="break-all font-mono text-xs text-foreground">{enrollment.secret}</p>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSecretVisible(true)}
                >
                  <Icon icon="lucide:keyboard" className="size-3.5" />
                  Não consigo escanear — mostrar o código
                </Button>
              )}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Código do aplicativo
            </p>
            <TotpCodeInput
              value={code}
              onChange={(v) => {
                setCode(v);
                if (error) setError(null);
              }}
              onComplete={(v) => void confirm(v)}
              disabled={!enrollment || confirming}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              {error}
            </div>
          )}

          <p className="text-xs leading-snug text-muted-foreground">
            Guarde o aplicativo em um lugar seguro. Se perder o acesso a ele, só um Owner poderá
            remover a verificação da sua conta.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={confirming}>
            Cancelar
          </Button>
          <Button
            onClick={() => void confirm(code)}
            disabled={!enrollment || !isCompleteTotpCode(code) || confirming}
          >
            {confirming ? "Confirmando…" : "Ativar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
