import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { MOCK_USERS, findMockUserByEmail } from "@/features/auth/mock-users";
import { BrandPanel } from "@/features/auth/BrandPanel";
import { ProfileCard } from "@/features/auth/ProfileCard";

const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const enter = (id: string) => {
    setPendingId(id);
    const profile = signIn(id);
    if (!profile) {
      setError("Perfil não encontrado.");
      setPendingId(null);
      return;
    }
    const target = next ?? profile.defaultRedirect;
    void navigate({ to: target });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!EMAIL_REGEX.test(email.trim())) {
      setError("Informe um e-mail válido.");
      return;
    }
    const profile = findMockUserByEmail(email);
    if (!profile) {
      setError("E-mail não reconhecido. Use um perfil de demonstração abaixo.");
      return;
    }
    enter(profile.id);
  };

  const teamProfiles = MOCK_USERS.filter((u) => u.group === "team");
  const clientProfiles = MOCK_USERS.filter((u) => u.group === "client");
  const adminProfiles = MOCK_USERS.filter((u) => u.group === "admin");

  return (
    <div className="grid min-h-screen md:grid-cols-[45%_1fr]">
      <BrandPanel />

      <main className="flex flex-col justify-center px-5 py-10 sm:px-8 md:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-xl space-y-8">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Plataforma de inteligência comercial
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Acesse a plataforma
            </h1>
            <p className="text-sm text-muted-foreground">
              Esta autenticação é mockada — para demonstração.
            </p>
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
            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              >
                {error}
              </div>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={pendingId !== null}>
              Entrar
              <Icon icon="lucide:log-in" size={16} className="ml-2" />
            </Button>
          </form>

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
            <div className="grid gap-3 sm:grid-cols-2">
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
              <div className="grid gap-3 sm:grid-cols-2">
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
            Esta é uma fase de mockup. Autenticação real será habilitada na Fase 2 (Supabase Auth).
          </p>
        </div>
      </main>
    </div>
  );
}
