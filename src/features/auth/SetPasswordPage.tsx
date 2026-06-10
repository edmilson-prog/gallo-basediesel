import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { AUTH_SOURCE } from "./authSource";

/**
 * /auth/definir-senha (PRD-107) — landing page for Supabase action links
 * (seller email invite and password recovery).
 *
 * The action link redirects here with the session in the URL hash; supabase-js
 * (`detectSessionInUrl`, on by default) stores it asynchronously. Once the
 * session is visible the user sets a new password via `updateUser`. We then
 * sign out and send them to the regular login — predictable, and it keeps the
 * app's auth bootstrapping on a single path.
 */

type LinkState = "checking" | "ready" | "invalid";

/** Error description Supabase appends to the hash when a link is expired/used. */
function hashErrorDescription(): string | null {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  return params.get("error_description");
}

export function SetPasswordPage() {
  const navigate = useNavigate();
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (AUTH_SOURCE !== "supabase") {
      setLinkState("invalid");
      setLinkError("Este fluxo só está disponível com a autenticação real habilitada.");
      return;
    }

    const described = hashErrorDescription();
    if (described) {
      setLinkState("invalid");
      setLinkError(described);
      return;
    }

    const supabase = getSupabaseClient();
    let active = true;

    // The hash session is processed asynchronously by detectSessionInUrl:
    // listen for it, and fall back to a one-shot check + grace timeout.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) setLinkState("ready");
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setLinkState("ready");
        return;
      }
      setTimeout(() => {
        if (active) setLinkState((state) => (state === "checking" ? "invalid" : state));
      }, 2500);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setSaving(true);
    const supabase = getSupabaseClient();
    void supabase.auth
      .updateUser({ password })
      .then(async ({ error: updErr }) => {
        if (updErr) {
          setError(`Não foi possível definir a senha: ${updErr.message}`);
          setSaving(false);
          return;
        }
        // Sign out so the app bootstraps auth through the single login path.
        await supabase.auth.signOut();
        toast.success("Senha definida com sucesso", {
          description: "Entre com seu e-mail e a nova senha.",
        });
        void navigate({ to: "/auth/login" });
      })
      .catch(() => {
        setError("Não foi possível definir a senha. Tente novamente.");
        setSaving(false);
      });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
        <header className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            GALLO BASE DIESEL
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Defina sua senha</h1>
        </header>

        {linkState === "checking" && (
          <div
            className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
            role="status"
          >
            <Icon icon="lucide:loader-2" size={16} className="animate-spin" />
            Validando seu link de acesso…
          </div>
        )}

        {linkState === "invalid" && (
          <div className="space-y-4">
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            >
              {linkError ??
                "Link de acesso inválido ou expirado. Peça ao administrador um novo convite."}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void navigate({ to: "/auth/login" })}
            >
              Ir para o login
            </Button>
          </div>
        )}

        {linkState === "ready" && (
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo de 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(error)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirmar senha</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="Repita a nova senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={Boolean(error)}
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
            <Button type="submit" size="lg" className="w-full" disabled={saving}>
              {saving ? "Salvando…" : "Definir senha e continuar"}
              <Icon icon="lucide:check" size={16} className="ml-2" />
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
