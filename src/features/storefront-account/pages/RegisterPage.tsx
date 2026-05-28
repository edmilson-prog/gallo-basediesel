import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Icon } from "@/components/Icon";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import {
  formatCnpj,
  formatCpf,
  formatPhone,
  isValidCnpj,
  isValidCpf,
  isValidPhone,
} from "@/features/customers/utils/cnpjCpf";
import { useCustomerAuth, type CustomerRegisterInput } from "../hooks/useCustomerAuth";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegisterType = "B2C" | "B2B";

interface IFormState {
  type: RegisterType;
  fullName: string;
  cpf: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  contactName: string;
  email: string;
  phone: string;
  password: string;
  passwordConfirm: string;
  lgpd: boolean;
}

const EMPTY_FORM: IFormState = {
  type: "B2C",
  fullName: "",
  cpf: "",
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  contactName: "",
  email: "",
  phone: "",
  password: "",
  passwordConfirm: "",
  lgpd: false,
};

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useCustomerAuth();
  const [form, setForm] = useState<IFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof IFormState | "root", string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useSeoMeta({ title: S.registerPageTitle, description: S.registerPageDescription });

  const update = <K extends keyof IFormState>(key: K, value: IFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (form.type === "B2C") {
      if (!form.fullName.trim()) next.fullName = S.errRequired;
      if (!form.cpf) next.cpf = S.errRequired;
      else if (!isValidCpf(form.cpf)) next.cpf = S.errCpfInvalid;
    } else {
      if (!form.razaoSocial.trim()) next.razaoSocial = S.errRequired;
      if (!form.nomeFantasia.trim()) next.nomeFantasia = S.errRequired;
      if (!form.cnpj) next.cnpj = S.errRequired;
      else if (!isValidCnpj(form.cnpj)) next.cnpj = S.errCnpjInvalid;
      if (!form.contactName.trim()) next.contactName = S.errRequired;
    }
    if (!form.email) next.email = S.errRequired;
    else if (!EMAIL_REGEX.test(form.email.trim())) next.email = S.errEmailInvalid;
    if (!form.phone) next.phone = S.errRequired;
    else if (!isValidPhone(form.phone)) next.phone = S.errPhoneInvalid;
    if (!form.password) next.password = S.errRequired;
    else if (form.password.length < 6) next.password = S.errPasswordMin;
    if (form.passwordConfirm !== form.password) next.passwordConfirm = S.errPasswordMismatch;
    if (!form.lgpd) next.lgpd = S.errLgpdRequired;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: CustomerRegisterInput =
        form.type === "B2C"
          ? {
              type: "B2C",
              fullName: form.fullName,
              cpf: form.cpf,
              email: form.email,
              phone: form.phone,
              password: form.password,
            }
          : {
              type: "B2B",
              razaoSocial: form.razaoSocial,
              nomeFantasia: form.nomeFantasia,
              cnpj: form.cnpj,
              contactName: form.contactName,
              email: form.email,
              phone: form.phone,
              password: form.password,
            };
      await register(payload);
      toast.success(S.registerSuccess);
      void navigate({ to: "/loja/conta" });
    } catch (err) {
      if (err instanceof Error && err.name === "EmailTakenError") {
        setErrors({ email: S.registerEmailTaken });
      } else {
        setErrors({ root: "Não foi possível criar a conta. Tente novamente." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:py-16">
      <header className="space-y-1 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {S.registerTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{S.registerSubtitle}</p>
      </header>

      <Card className="space-y-6 p-6">
        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              {S.registerTypeLabel}
            </Label>
            <RadioGroup
              value={form.type}
              onValueChange={(v) => {
                update("type", v as RegisterType);
                setErrors({});
              }}
              className="grid grid-cols-2 gap-2"
            >
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  form.type === "B2C"
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                <RadioGroupItem value="B2C" />
                {S.registerTypePf}
              </label>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  form.type === "B2B"
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                <RadioGroupItem value="B2B" />
                {S.registerTypePj}
              </label>
            </RadioGroup>
          </div>

          {form.type === "B2C" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={S.registerNameLabel} error={errors.fullName} className="sm:col-span-2">
                <Input
                  placeholder={S.registerNamePlaceholder}
                  value={form.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                />
              </Field>
              <Field label={S.registerCpfLabel} error={errors.cpf}>
                <Input
                  inputMode="numeric"
                  placeholder={S.registerCpfPlaceholder}
                  value={form.cpf}
                  onChange={(e) => update("cpf", formatCpf(e.target.value))}
                />
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={S.registerRazaoSocialLabel}
                error={errors.razaoSocial}
                className="sm:col-span-2"
              >
                <Input
                  value={form.razaoSocial}
                  onChange={(e) => update("razaoSocial", e.target.value)}
                />
              </Field>
              <Field label={S.registerNomeFantasiaLabel} error={errors.nomeFantasia}>
                <Input
                  value={form.nomeFantasia}
                  onChange={(e) => update("nomeFantasia", e.target.value)}
                />
              </Field>
              <Field label={S.registerCnpjLabel} error={errors.cnpj}>
                <Input
                  inputMode="numeric"
                  placeholder={S.registerCnpjPlaceholder}
                  value={form.cnpj}
                  onChange={(e) => update("cnpj", formatCnpj(e.target.value))}
                />
              </Field>
              <Field
                label={S.registerContactLabel}
                error={errors.contactName}
                className="sm:col-span-2"
              >
                <Input
                  value={form.contactName}
                  onChange={(e) => update("contactName", e.target.value)}
                />
              </Field>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={S.registerEmailLabel} error={errors.email}>
              <Input
                type="email"
                autoComplete="email"
                placeholder={S.registerEmailPlaceholder}
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </Field>
            <Field label={S.registerPhoneLabel} error={errors.phone}>
              <Input
                type="tel"
                autoComplete="tel"
                placeholder={S.registerPhonePlaceholder}
                value={form.phone}
                onChange={(e) => update("phone", formatPhone(e.target.value))}
              />
            </Field>
            <Field label={S.registerPasswordLabel} error={errors.password}>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={S.registerPasswordPlaceholder}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
              />
            </Field>
            <Field label={S.registerPasswordConfirmLabel} error={errors.passwordConfirm}>
              <Input
                type="password"
                autoComplete="new-password"
                value={form.passwordConfirm}
                onChange={(e) => update("passwordConfirm", e.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-1">
            <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={form.lgpd}
                onCheckedChange={(checked) => update("lgpd", checked === true)}
                aria-invalid={Boolean(errors.lgpd)}
              />
              <span>{S.registerLgpdLabel}</span>
            </label>
            {errors.lgpd && <p className="text-xs text-destructive">{errors.lgpd}</p>}
          </div>

          {errors.root && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {errors.root}
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? S.registerSubmitting : S.registerSubmit}
            {!submitting && (
              <Icon icon="mdi:account-plus-outline" size={16} className="ml-2" aria-hidden />
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {S.registerHaveAccount}{" "}
            <Link to="/loja/login" className="font-medium text-primary hover:underline">
              {S.registerLoginCta}
            </Link>
          </p>
        </form>
      </Card>
    </div>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
