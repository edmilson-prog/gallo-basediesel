import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import { usePortalSeed } from "../hooks/usePortalSeed";
import { usePortalAuth } from "../hooks/usePortalAuth";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

export function PortalLoginPage() {
  usePortalSeed();
  const navigate = useNavigate();
  const { login } = usePortalAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(email, password)) {
      void navigate({ to: "/portal/inicio" });
    } else {
      toast.error(S.loginError);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-900 px-4">
      <Card className="w-full max-w-sm space-y-6 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Icon icon="mdi:hexagon-multiple" size={40} className="text-amber-500" aria-hidden />
          <h1 className="font-display text-xl font-bold text-foreground">{S.loginTitle}</h1>
          <p className="text-sm text-muted-foreground">{S.loginSubtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="portal-email">{S.loginEmail}</Label>
            <Input
              id="portal-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="gerente@empresa.com.br"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="portal-password">{S.loginPassword}</Label>
            <Input
              id="portal-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full">
            {S.loginCta}
          </Button>
        </form>

        <p className="text-center text-[11px] text-muted-foreground">{S.loginHint}</p>
      </Card>
    </div>
  );
}
