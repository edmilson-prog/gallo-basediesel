import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { MOCK_USERS } from "@/features/auth/mock-users";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import {
  clearRememberedEmail,
  readRememberedEmail,
  saveRememberedEmail,
} from "@/features/auth/rememberEmail";
import { BrandPanel } from "@/features/auth/BrandPanel";
import { ProfileCard } from "@/features/auth/ProfileCard";
import { MfaChallengeStep } from "@/features/auth/MfaChallengeStep";
import type { IUserProfile } from "@/features/auth/mock-users";
import { useAccessGate, AccessBlockedNotice } from "@/features/access";
import { markExplicitLogin } from "@/features/idle-alerts";

const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginPage() {
  const {
    signIn,
    signInWithPassword,
    signOut,
    mfaPending,
    completeMfaChallenge,
    cancelMfaChallenge,
  } = useAuth();
  const { evaluateForProfile } = useAccessGate();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const isSupabase = AUTH_SOURCE === "supabase";
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [email, setEmail] = useState(() => readRememberedEmail() ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => readRememberedEmail() !== null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ nextOpenAt?: string | null } | null>(null);

  /** Runs the work-schedule access gate (PRD-212) and lands the user in the app. */
  const proceedWithProfile = (profile: IUserProfile) => {
    void evaluateForProfile(profile).then((decision) => {
      if (!decision.allowed) {
        signOut();
        setBlocked({ nextOpenAt: decision.nextOpenAt });
        setPendingId(null);
        return;
      }
      const target = next ?? profile.defaultRedirect;
      markExplicitLogin();
      void navigate({ to: target });
    });
  };

  const enter = (id: string) => {
    setError(null);
    setBlocked(null);
    setPendingId(id);
    const profile = signIn(id);
    if (!profile) {
      setError("Perfil não encontrado.");
      setPendingId(null);
      return;
    }
    proceedWithProfile(profile);
  };

  /** Second login step — resolves with an error message, or null on success. */
  const handleMfaSubmit = async (code: string): Promise<string | null> => {
    const result = await completeMfaChallenge(code);
    if (!result.ok || !result.profile) {
      return result.error ?? "Não foi possível entrar.";
    }
    proceedWithProfile(result.profile);
    return null;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBlocked(null);
    if (!EMAIL_REGEX.test(email.trim())) {
      setError("Informe um e-mail válido.");
      return;
    }
    setPendingId("__form__");
    void signInWithPassword(email, password).then((result) => {
      // Two-factor account: the password was accepted, but the session owes a
      // code. `mfaPending` from the auth context swaps in the challenge step.
      if (result.mfaRequired) {
        if (rememberMe) saveRememberedEmail(email);
        else clearRememberedEmail();
        setPassword("");
        setPendingId(null);
        return;
      }
      if (!result.ok || !result.profile) {
        setError(result.error ?? "Não foi possível entrar.");
        setPendingId(null);
        return;
      }
      if (rememberMe) saveRememberedEmail(email);
      else clearRememberedEmail();
      proceedWithProfile(result.profile);
    });
  };

  const handleForgotPassword = () => {
    toast.info("Redefinição de senha", {
      description: "Peça a um Owner para redefinir sua senha em Configurações → Usuários.",
    });
  };

  const handleSupport = () => {
    toast.info("Precisa de ajuda para entrar?", {
      description:
        "Fale com um Owner ou Gestor da sua loja — eles podem liberar acesso, redefinir sua senha ou remover a verificação em duas etapas em Configurações → Usuários.",
    });
  };

  const teamProfiles = MOCK_USERS.filter((u) => u.group === "team");
  const clientProfiles = MOCK_USERS.filter((u) => u.group === "client");
  const adminProfiles = MOCK_USERS.filter((u) => u.group === "admin");

  return (
    <div
      className="dark grid h-screen overflow-hidden bg-background md:grid-cols-2"
      style={{ colorScheme: "dark" }}
    >
      <BrandPanel />

      <main className="scrollbar-hide h-screen overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <div className="flex justify-end px-5 pt-5 sm:px-8 md:px-12 lg:px-16">
            <button
              type="button"
              onClick={handleSupport}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
            >
              <Icon icon="lucide:life-buoy" size={14} />
              Suporte
            </button>
          </div>

          <div className="flex flex-1 flex-col justify-center px-5 py-8 sm:px-8 md:px-12 lg:px-16">
            <div className="mx-auto w-full max-w-[400px]">
              {mfaPending ? (
                <MfaChallengeStep onSubmit={handleMfaSubmit} onCancel={cancelMfaChallenge} />
              ) : (
                <>
                  <header className="mb-8">
                    <p className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                      Acesso restrito
                    </p>
                    <h1 className="font-display text-4xl font-extrabold uppercase leading-[0.95] text-foreground">
                      Acesse a plataforma
                    </h1>
                  </header>

                  <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="login-email"
                        className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
                      >
                        E-mail
                      </Label>
                      <Input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        placeholder="voce@gallobasediesel.com.br"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        aria-invalid={Boolean(error)}
                        className="h-12"
                      />
                    </div>
                    {/* Password is collected for the future Supabase Auth flow but intentionally
                  ignored in the mock — any value (including empty) is accepted. */}
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="login-password"
                        className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
                      >
                        Senha
                      </Label>
                      <div className="relative">
                        <Input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-12 pr-11"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-muted-foreground transition-colors hover:text-primary"
                        >
                          <Icon icon={showPassword ? "lucide:eye-off" : "lucide:eye"} size={17} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="login-remember"
                          checked={rememberMe}
                          onCheckedChange={(checked) => setRememberMe(checked === true)}
                        />
                        <Label
                          htmlFor="login-remember"
                          className="cursor-pointer text-sm font-normal text-muted-foreground"
                        >
                          Lembrar-me
                        </Label>
                      </div>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
                      >
                        Esqueci minha senha
                      </button>
                    </div>
                    {error && (
                      <div
                        role="alert"
                        className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
                      >
                        {error}
                      </div>
                    )}
                    {blocked && <AccessBlockedNotice nextOpenAt={blocked.nextOpenAt} />}
                    <Button
                      type="submit"
                      size="lg"
                      className="mt-2 h-[50px] w-full text-sm font-extrabold uppercase tracking-[0.1em]"
                      disabled={pendingId !== null}
                    >
                      {pendingId === "__form__" ? (
                        <Icon icon="lucide:loader-2" size={18} className="animate-spin" />
                      ) : (
                        <>
                          Entrar
                          <Icon icon="lucide:arrow-right" size={17} />
                        </>
                      )}
                    </Button>
                  </form>

                  {!isSupabase && (
                    <div className="mt-6 space-y-6">
                      <div className="flex items-center gap-3">
                        <span className="h-px flex-1 bg-border" aria-hidden="true" />
                        <span className="text-xs text-muted-foreground">
                          ou entre como perfil de demonstração
                        </span>
                        <span className="h-px flex-1 bg-border" aria-hidden="true" />
                      </div>

                      <section className="space-y-3" aria-label="Perfis da equipe GALLO">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Equipe GALLO
                        </h2>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {teamProfiles.map((profile, i) => (
                            <ProfileCard
                              key={profile.id}
                              profile={profile}
                              index={i}
                              pending={pendingId === profile.id}
                              onSelect={enter}
                            />
                          ))}
                        </div>
                      </section>

                      {clientProfiles.length > 0 && (
                        <section className="space-y-3" aria-label="Perfil de cliente">
                          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Cliente
                          </h2>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {clientProfiles.map((profile, i) => (
                              <ProfileCard
                                key={profile.id}
                                profile={profile}
                                index={teamProfiles.length + i}
                                pending={pendingId === profile.id}
                                onSelect={enter}
                              />
                            ))}
                          </div>
                        </section>
                      )}

                      {adminProfiles.map((profile) => (
                        <div key={profile.id} className="border-t border-border pt-4">
                          <button
                            type="button"
                            onClick={() => enter(profile.id)}
                            disabled={pendingId !== null}
                            className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-60"
                          >
                            Acesso {profile.storeLabel} ({profile.displayName})
                          </button>
                        </div>
                      ))}

                      <p className="text-xs text-muted-foreground">
                        Esta é uma fase de mockup. Autenticação real será habilitada na Fase 2
                        (Supabase Auth).
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border px-5 py-4 sm:px-8 md:px-12 lg:px-16">
            <p className="font-display text-xs font-bold uppercase italic tracking-wide text-muted-foreground">
              Base forte para quem não pode parar.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
