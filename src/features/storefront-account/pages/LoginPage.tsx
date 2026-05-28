import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ILoginPageProps {
  returnTo?: string;
}

export function LoginPage({ returnTo }: ILoginPageProps) {
  const navigate = useNavigate();
  const { login } = useCustomerAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; root?: string }>({});

  useSeoMeta({ title: S.loginPageTitle, description: S.loginPageDescription });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const next: typeof errors = {};
    if (!email.trim()) next.email = S.errRequired;
    else if (!EMAIL_REGEX.test(email.trim())) next.email = S.errEmailInvalid;
    if (!password) next.password = S.errRequired;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const customer = await login(email, password);
      if (!customer) {
        setErrors({ root: S.loginErrorNotFound });
        return;
      }
      toast.success(S.loginSuccess(getCustomerName(customer)));
      const target = returnTo && returnTo.startsWith("/loja") ? returnTo : "/loja/conta";
      void navigate({ to: target });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10 sm:py-16">
      <header className="space-y-1 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {S.loginTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{S.loginSubtitle}</p>
      </header>

      <Card className="space-y-4 p-6">
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="login-email">{S.loginEmailLabel}</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder={S.loginEmailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password">{S.loginPasswordLabel}</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder={S.loginPasswordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          {errors.root && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {errors.root}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-xs">
            <Link to="/loja/recuperar-senha" className="font-medium text-primary hover:underline">
              {S.loginForgot}
            </Link>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? S.loginSubmitting : S.loginSubmit}
            {!submitting && <Icon icon="mdi:login" size={16} className="ml-2" aria-hidden />}
          </Button>
        </form>

        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
          {S.loginDemoHint}
        </p>

        <div className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
          <p className="text-center text-muted-foreground">
            {S.loginNoAccount}{" "}
            <Link to="/loja/cadastro" className="font-medium text-primary hover:underline">
              {S.loginRegisterCta}
            </Link>
          </p>
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link to="/loja">
              <Icon icon="mdi:store-outline" size={14} className="mr-1" aria-hidden />
              {S.loginGuestCta}
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
