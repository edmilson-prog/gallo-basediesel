import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { TotpCodeInput } from "./TotpCodeInput";
import { isCompleteTotpCode } from "./engine/mfaGate";

interface IMfaChallengeStepProps {
  /** Resolves with an error message, or null when the sign-in completed. */
  onSubmit: (code: string) => Promise<string | null>;
  onCancel: () => void;
}

/**
 * Second step of the login: the account has two-factor enabled, so the password
 * alone left the session at aal1. Until a valid code lands here, the app treats
 * the user as signed out.
 */
export function MfaChallengeStep({ onSubmit, onCancel }: IMfaChallengeStepProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (value: string) => {
    if (!isCompleteTotpCode(value) || pending) return;
    setPending(true);
    setError(null);
    const message = await onSubmit(value);
    if (message) {
      setError(message);
      setCode("");
      setPending(false);
      return;
    }
    // Success — the caller navigates away; keep the button disabled meanwhile.
  };

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Icon icon="lucide:shield-check" className="size-5" />
        </span>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Verificação em duas etapas
        </h2>
        <p className="text-sm text-muted-foreground">
          Abra seu aplicativo autenticador e digite o código de 6 dígitos gerado para a GALLO Base
          Diesel.
        </p>
      </header>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(code);
        }}
      >
        <TotpCodeInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError(null);
          }}
          onComplete={(v) => void submit(v)}
          disabled={pending}
          autoFocus
        />

        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            {error}
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!isCompleteTotpCode(code) || pending}
        >
          {pending ? "Verificando…" : "Confirmar e entrar"}
          <Icon icon="lucide:log-in" size={16} className="ml-2" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={onCancel}
          disabled={pending}
        >
          Voltar
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        Perdeu o acesso ao aplicativo autenticador? Peça a um Owner para remover a verificação em
        duas etapas da sua conta em Configurações → Usuários.
      </p>
    </div>
  );
}
