import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { MOCK_USERS } from "@/features/auth/mock-users";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import {
  clearRememberedEmail,
  readRememberedEmail,
  saveRememberedEmail,
} from "@/features/auth/rememberEmail";
import { BrandPanel, type BrandPanelVariant } from "@/features/auth/BrandPanel";
import { ProfileCard } from "@/features/auth/ProfileCard";
import { useAccessGate, AccessBlockedNotice } from "@/features/access";

const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginPage() {
  const { signIn, signInWithPassword, signOut } = useAuth();
  const { evaluateForProfile } = useAccessGate();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const isSupabase = AUTH_SOURCE === "supabase";
  const [bg, setBg] = useState<BrandPanelVariant>("embers");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [email, setEmail] = useState(() => readRememberedEmail() ?? "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => readRememberedEmail() !== null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ nextOpenAt?: string | null } | null>(null);

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
    void evaluateForProfile(profile).then((decision) => {
      if (!decision.allowed) {
        signOut();
        setBlocked({ nextOpenAt: decision.nextOpenAt });
        setPendingId(null);
        return;
      }
      const target = next ?? profile.defaultRedirect;
      void navigate({ to: target });
    });
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
      if (!result.ok || !result.profile) {
        setError(result.error ?? "Não foi possível entrar.");
        setPendingId(null);
        return;
      }
      if (rememberMe) saveRememberedEmail(email);
      else clearRememberedEmail();
      void evaluateForProfile(result.profile).then((decision) => {
        if (!decision.allowed) {
          signOut();
          setBlocked({ nextOpenAt: decision.nextOpenAt });
          setPendingId(null);
          return;
        }
        const target = next ?? result.profile!.defaultRedirect;
        void navigate({ to: target });
      });
    });
  };

  const teamProfiles = MOCK_USERS.filter((u) => u.group === "team");
  const clientProfiles = MOCK_USERS.filter((u) => u.group === "client");
  const adminProfiles = MOCK_USERS.filter((u) => u.group === "admin");

  return (
    <div className="grid h-screen overflow-hidden md:grid-cols-2">
      {import.meta.env.DEV && (
        <div className="fixed left-3 top-3 z-50 flex gap-1 rounded-md border border-border bg-card/90 p-1 text-xs shadow-lg backdrop-blur">
          {(["embers", "gradient", "mesh"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setBg(v)}
              className={cn(
                "rounded px-2 py-1 capitalize transition-colors",
                bg === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      )}
      <BrandPanel variant={bg} />

      <main className="h-screen overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-h-full flex-col justify-center px-5 py-8 sm:px-8 md:px-12 lg:px-16">
          <div className="mx-auto w-full max-w-xl space-y-6">
            <header className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Plataforma de inteligência comercial
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Acesse a plataforma
              </h1>
            </header>

            <form className="space-y-4" onSubmit={handleSubmit} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="login-email">E-mail</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@gallobasediesel.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={Boolean(error)}
                />
              </div>
              {/* Password is collected for the future Supabase Auth flow but intentionally
                ignored in the mock — any value (including empty) is accepted. */}
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Senha</Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
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
              {error && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
                >
                  {error}
                </div>
              )}
              {blocked && <AccessBlockedNotice nextOpenAt={blocked.nextOpenAt} />}
              <Button type="submit" size="lg" className="w-full" disabled={pendingId !== null}>
                Entrar
                <Icon icon="lucide:log-in" size={16} className="ml-2" />
              </Button>
            </form>

            {!isSupabase && (
              <>
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
                  Esta é uma fase de mockup. Autenticação real será habilitada na Fase 2 (Supabase
                  Auth).
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
