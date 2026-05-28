import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PasswordRecoveryPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useSeoMeta({ title: S.recoverPageTitle });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!email.trim()) {
      setError(S.errRequired);
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError(S.errEmailInvalid);
      return;
    }
    setError(undefined);
    setSubmitting(true);
    window.setTimeout(() => {
      toast.success(S.recoverSuccess);
      setSubmitting(false);
      setEmail("");
    }, 600);
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10 sm:py-16">
      <header className="space-y-1 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {S.recoverTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{S.recoverSubtitle}</p>
      </header>

      <Card className="space-y-4 p-6">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          <Icon icon="mdi:test-tube" size={14} className="mr-1 inline" aria-hidden />
          {S.recoverDemoBanner}
        </div>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="recover-email">{S.loginEmailLabel}</Label>
            <Input
              id="recover-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error)}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? "Enviando…" : S.recoverSubmit}
          </Button>
        </form>
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link to="/loja/login">
            <Icon icon="mdi:arrow-left" size={14} className="mr-1" aria-hidden />
            {S.recoverBack}
          </Link>
        </Button>
      </Card>
    </div>
  );
}
