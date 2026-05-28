import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { usePwaAuth } from "../hooks/usePwaAuth";
import { PWABanner } from "../components/PWABanner";
import { PWA_STRINGS as S } from "../i18n/pt-BR";

export function PWALoginPage() {
  const navigate = useNavigate();
  const { login } = usePwaAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const ok = await login(email, password);
      if (ok) {
        void navigate({ to: "/pwa/inicio" });
      } else {
        toast.error(S.loginError);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] flex-col justify-center gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo variant="mark" className="h-14 w-14" />
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">{S.appName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{S.loginSubtitle}</p>
        </div>
      </div>

      <PWABanner />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pwa-email">{S.loginEmail}</Label>
          <Input
            id="pwa-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vendedor@gallobasediesel.com.br"
            autoComplete="email"
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pwa-password">{S.loginPassword}</Label>
          <Input
            id="pwa-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="h-12 text-base"
          />
        </div>
        <Button type="submit" disabled={submitting} className="h-12 w-full text-base">
          {submitting ? "Entrando…" : S.loginCta}
        </Button>
      </form>
    </div>
  );
}
