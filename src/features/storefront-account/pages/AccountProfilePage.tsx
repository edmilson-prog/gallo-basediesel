import { useState } from "react";
import { toast } from "sonner";
import type { ICustomer } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/Icon";
import { formatPhone, isValidPhone } from "@/features/customers/utils/cnpjCpf";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface IFormState {
  // B2C
  fullName: string;
  // B2B
  razaoSocial: string;
  nomeFantasia: string;
  contactName: string;
  // shared
  email: string;
  phone: string;
  newsletter: boolean;
}

function initialForm(customer: ICustomer): IFormState {
  return {
    fullName: customer.type === "B2C" ? customer.fullName : "",
    razaoSocial: customer.type === "B2B" ? customer.razaoSocial : "",
    nomeFantasia: customer.type === "B2B" ? customer.nomeFantasia : "",
    contactName: customer.type === "B2B" ? customer.contactName : "",
    email: customer.email ?? "",
    phone: customer.phone,
    newsletter: false,
  };
}

export function AccountProfilePage() {
  const { customer, updateProfile } = useCustomerAuth();
  const [form, setForm] = useState<IFormState>(() =>
    customer ? initialForm(customer) : initialForm({} as ICustomer),
  );
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  // Password change (mock — no real verification).
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });

  useSeoMeta({ title: "Meu perfil · GALLO PARTS" });

  if (!customer) return null;

  const update = <K extends keyof IFormState>(key: K, value: IFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const next: Partial<Record<string, string>> = {};
    if (customer.type === "B2C" && !form.fullName.trim()) next.fullName = S.errRequired;
    if (customer.type === "B2B") {
      if (!form.razaoSocial.trim()) next.razaoSocial = S.errRequired;
      if (!form.nomeFantasia.trim()) next.nomeFantasia = S.errRequired;
      if (!form.contactName.trim()) next.contactName = S.errRequired;
    }
    if (!form.email) next.email = S.errRequired;
    else if (!EMAIL_REGEX.test(form.email.trim())) next.email = S.errEmailInvalid;
    if (!form.phone) next.phone = S.errRequired;
    else if (!isValidPhone(form.phone)) next.phone = S.errPhoneInvalid;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const patch: Partial<ICustomer> =
        customer.type === "B2C"
          ? {
              fullName: form.fullName.trim(),
              email: form.email.trim(),
              phone: form.phone,
            }
          : {
              razaoSocial: form.razaoSocial.trim(),
              nomeFantasia: form.nomeFantasia.trim(),
              contactName: form.contactName.trim(),
              email: form.email.trim(),
              phone: form.phone,
            };
      await updateProfile(patch as Partial<ICustomer>);
      toast.success(S.profileSavedToast);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordChange = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pwd.current || !pwd.next) {
      toast.error(S.errRequired);
      return;
    }
    if (pwd.next.length < 6) {
      toast.error(S.errPasswordMin);
      return;
    }
    if (pwd.next !== pwd.confirm) {
      toast.error(S.errPasswordMismatch);
      return;
    }
    setPwd({ current: "", next: "", confirm: "" });
    toast.success(S.profilePasswordChangedToast);
  };

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {S.profileTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{S.profileSubtitle}</p>
      </header>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-foreground">{S.profileDataSection}</h2>
        <form className="space-y-4" onSubmit={handleSave} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            {customer.type === "B2C" ? (
              <Field label={S.registerNameLabel} error={errors.fullName} className="sm:col-span-2">
                <Input value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
              </Field>
            ) : (
              <>
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
                <Field label={S.registerContactLabel} error={errors.contactName}>
                  <Input
                    value={form.contactName}
                    onChange={(e) => update("contactName", e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field label={S.registerEmailLabel} error={errors.email}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </Field>
            <Field label={S.registerPhoneLabel} error={errors.phone}>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => update("phone", formatPhone(e.target.value))}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? S.profileSubmitting : S.profileSubmit}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-foreground">{S.profilePasswordSection}</h2>
        <form className="space-y-4" onSubmit={handlePasswordChange}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={S.profileCurrentPasswordLabel}>
              <Input
                type="password"
                autoComplete="current-password"
                value={pwd.current}
                onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
              />
            </Field>
            <Field label={S.profileNewPasswordLabel}>
              <Input
                type="password"
                autoComplete="new-password"
                value={pwd.next}
                onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))}
              />
            </Field>
            <Field label={S.profileNewPasswordConfirmLabel}>
              <Input
                type="password"
                autoComplete="new-password"
                value={pwd.confirm}
                onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="outline">
              <Icon icon="mdi:lock-reset" size={16} className="mr-2" aria-hidden />
              {S.profilePasswordSection}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">{S.profilePreferencesSection}</h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={form.newsletter}
            onCheckedChange={(checked) => update("newsletter", checked === true)}
          />
          {S.profileNewsletterLabel}
        </label>
        <p className="text-xs text-muted-foreground">{S.profileNewsletterHint}</p>
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
