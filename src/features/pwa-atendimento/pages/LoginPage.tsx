import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { MfaChallengeStep } from "@/features/auth/MfaChallengeStep";
import {
  clearRememberedEmail,
  readRememberedEmail,
  saveRememberedEmail,
} from "@/features/auth/rememberEmail";
import { PwaButton } from "../components/ui/PwaButton";
import { PwaField } from "../components/ui/PwaField";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

/**
 * Sign-in for the atendimento PWA.
 *
 * The look is the kit's, but the credentials go through the same
 * `signInWithPassword` the desktop uses — this app reads real conversations
 * under RLS, so a demo auth would be a security hole, not a shortcut.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const { signInWithPassword, completeMfaChallenge, cancelMfaChallenge } = useAuth();

  const rememberedEmail = readRememberedEmail();
  const [email, setEmail] = useState(rememberedEmail ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(rememberedEmail !== null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaOpen, setMfaOpen] = useState(false);

  const goToApp = () => {
    void navigate({ to: "/atendimento/conversas" });
  };

  const persistEmail = () => {
    if (remember) saveRememberedEmail(email);
    else clearRememberedEmail();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const result = await signInWithPassword(email.trim(), password);

    if (result.mfaRequired) {
      persistEmail();
      setPending(false);
      setMfaOpen(true);
      return;
    }
    if (result.blocked) {
      setPending(false);
      setError(
        result.blocked.reason === "suspended"
          ? "Seu acesso está suspenso. Fale com o gestor."
          : "Fora do horário de atendimento configurado para o seu perfil.",
      );
      return;
    }
    if (!result.ok) {
      setPending(false);
      setError(result.error ?? S.login.genericError);
      return;
    }

    persistEmail();
    goToApp();
  };

  if (mfaOpen) {
    return (
      <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
        <MfaChallengeStep
          onSubmit={async (code) => {
            const result = await completeMfaChallenge(code);
            if (result.ok) {
              goToApp();
              return null;
            }
            return result.error ?? "Código inválido. Tente novamente.";
          }}
          onCancel={() => {
            cancelMfaChallenge();
            setMfaOpen(false);
            setPassword("");
          }}
        />
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex h-full flex-col overflow-y-auto overflow-x-hidden px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]"
    >
      <div className="mt-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
          {S.login.eyebrow}
        </p>
        <h1 className="mt-2 font-display text-[38px] font-extrabold uppercase leading-[0.92] tracking-[0.01em] text-foreground">
          {S.login.title[0]}
          <br />
          {S.login.title[1]}
        </h1>
      </div>

      <div className="mt-7 flex flex-col gap-4">
        <PwaField
          label={S.login.email}
          icon="mdi:email-outline"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={S.login.emailPlaceholder}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <PwaField
          label={S.login.password}
          icon="mdi:lock-outline"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          right={
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? S.login.hidePassword : S.login.showPassword}
              className="-mr-2 flex h-11 w-11 items-center justify-center text-muted-foreground"
            >
              <Icon icon={showPassword ? "mdi:eye-off-outline" : "mdi:eye-outline"} size={17} />
            </button>
          }
        />

        <button
          type="button"
          role="checkbox"
          aria-checked={remember}
          onClick={() => setRemember((value) => !value)}
          className="flex min-h-[44px] items-center gap-2.5 text-left text-[13.5px] font-medium text-muted-foreground"
        >
          <span
            className={`flex h-[18px] w-[18px] items-center justify-center rounded-sm ${
              remember ? "bg-primary" : "ring-[1.5px] ring-inset ring-border"
            }`}
          >
            {remember && <Icon icon="mdi:check" size={13} className="text-primary-foreground" />}
          </span>
          {S.login.remember}
        </button>

        {error && (
          <p
            role="alert"
            className="rounded bg-severity-critical/10 px-3 py-2.5 text-[13px] font-medium text-severity-critical ring-1 ring-inset ring-severity-critical/30"
          >
            {error}
          </p>
        )}

        <PwaButton
          type="submit"
          variant="gold"
          full
          disabled={pending || !email.trim() || !password}
          className="mt-1.5"
        >
          {pending ? S.login.submitting : S.login.submit}
          {!pending && <Icon icon="mdi:chevron-right" size={17} />}
        </PwaButton>

        <p className="text-center text-[12.5px] text-muted-foreground">{S.login.forgotHint}</p>
      </div>

      <div className="min-h-6 flex-1" />

      <div className="flex items-center justify-between border-t border-border pt-3.5">
        <span className="text-[11px] text-muted-foreground">{S.login.footer}</span>
        <span className="font-mono text-[11px] text-muted-foreground/70">v{__APP_VERSION__}</span>
      </div>
    </form>
  );
}
