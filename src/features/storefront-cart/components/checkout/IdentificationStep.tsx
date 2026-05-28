import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import type { CheckoutIdentity } from "../../hooks/useCheckoutState";
import { STOREFRONT_CART_STRINGS as S } from "../../i18n/pt-BR";

export interface IIdentificationStepProps {
  value: CheckoutIdentity | null;
  onChange: (identity: CheckoutIdentity) => void;
}

interface IGuestFormState {
  fullName: string;
  docType: "pf" | "pj";
  doc: string;
  email: string;
  phone: string;
}

const EMPTY_FORM: IGuestFormState = {
  fullName: "",
  docType: "pf",
  doc: "",
  email: "",
  phone: "",
};

const CPF_REGEX = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
const CNPJ_REGEX = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_DIGITS_REGEX = /^\d{10,11}$/;

function maskCpf(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskCnpj(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length === 0 ? "" : `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Checkout step 1 — identification (PRD-064 RF-018–020).
 *
 * Auto-confirms when a session is available; otherwise offers the choice
 * between logging in (PRD-065) and guest checkout, with format-only
 * validation for CPF/CNPJ/email/phone.
 */
export function IdentificationStep({ value, onChange }: IIdentificationStepProps) {
  const { isAuthenticated, currentUser } = useAuth();
  const [mode, setMode] = useState<"choose" | "guest">(
    value?.kind === "guest" ? "guest" : "choose",
  );
  const [form, setForm] = useState<IGuestFormState>(() => {
    if (value?.kind === "guest") {
      return {
        fullName: value.fullName,
        docType: value.docType,
        doc: value.doc,
        email: value.email,
        phone: value.phone,
      };
    }
    return EMPTY_FORM;
  });
  const [errors, setErrors] = useState<Partial<Record<keyof IGuestFormState, string>>>({});

  // Logged-in users skip the form entirely.
  if (isAuthenticated && currentUser) {
    if (value?.kind !== "registered" || value.userId !== currentUser.id) {
      onChange({
        kind: "registered",
        userId: currentUser.id,
        displayName: currentUser.displayName,
      });
    }
    return (
      <Card className="space-y-2 border-primary/30 bg-primary/5 p-5">
        <p className="text-sm text-foreground">{S.idLoggedAs(currentUser.displayName)}</p>
        <p className="text-xs text-muted-foreground">{S.idLoggedHint}</p>
      </Card>
    );
  }

  const handleGuestSubmit = (): boolean => {
    const next: Partial<Record<keyof IGuestFormState, string>> = {};
    if (!form.fullName.trim()) next.fullName = S.errRequired;
    if (!form.doc) next.doc = S.errRequired;
    else if (form.docType === "pf" && !CPF_REGEX.test(form.doc)) next.doc = S.errCpfInvalid;
    else if (form.docType === "pj" && !CNPJ_REGEX.test(form.doc)) next.doc = S.errCnpjInvalid;
    if (!form.email) next.email = S.errRequired;
    else if (!EMAIL_REGEX.test(form.email)) next.email = S.errEmailInvalid;
    if (!form.phone) next.phone = S.errRequired;
    else if (!PHONE_DIGITS_REGEX.test(form.phone.replace(/\D/g, "")))
      next.phone = S.errPhoneInvalid;
    setErrors(next);
    if (Object.keys(next).length > 0) return false;
    onChange({
      kind: "guest",
      fullName: form.fullName.trim(),
      docType: form.docType,
      doc: form.doc,
      email: form.email.trim(),
      phone: form.phone,
    });
    return true;
  };

  if (mode === "choose") {
    return (
      <Card className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{S.checkoutStep1}</h2>
          <p className="text-sm text-muted-foreground">
            Acelere com sua conta ou siga como visitante — você pode criar a conta depois.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild variant="outline" size="lg">
            <Link to="/loja/conta">
              <Icon icon="mdi:login" size={16} className="mr-2" aria-hidden />
              {S.idLoginCta}
            </Link>
          </Button>
          <Button size="lg" onClick={() => setMode("guest")}>
            <Icon icon="mdi:account-outline" size={16} className="mr-2" aria-hidden />
            {S.idGuestCta}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{S.idGuestTitle}</h2>
          <p className="text-xs text-muted-foreground">{S.idGuestHint}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setMode("choose")}>
          <Icon icon="mdi:arrow-left" size={14} className="mr-1" aria-hidden />
          Voltar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={S.idGuestNameLabel} error={errors.fullName} className="sm:col-span-2">
          <Input
            placeholder={S.idGuestNamePlaceholder}
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          />
        </Field>

        <Field label={S.idGuestTypeLabel}>
          <RadioGroup
            value={form.docType}
            onValueChange={(v) => setForm((f) => ({ ...f, docType: v as "pf" | "pj", doc: "" }))}
            className="flex gap-3"
          >
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value="pf" />
              {S.idGuestTypePf}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value="pj" />
              {S.idGuestTypePj}
            </label>
          </RadioGroup>
        </Field>

        <Field label={S.idGuestDocLabel(form.docType)} error={errors.doc}>
          <Input
            placeholder={S.idGuestDocPlaceholder(form.docType)}
            inputMode="numeric"
            value={form.doc}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                doc: form.docType === "pf" ? maskCpf(e.target.value) : maskCnpj(e.target.value),
              }))
            }
          />
        </Field>

        <Field label={S.idGuestEmailLabel} error={errors.email}>
          <Input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </Field>

        <Field label={S.idGuestPhoneLabel} error={errors.phone}>
          <Input
            type="tel"
            autoComplete="tel"
            placeholder={S.idGuestPhonePlaceholder}
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))}
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleGuestSubmit}>
          <Icon icon="mdi:check" size={14} className="mr-1" aria-hidden />
          Confirmar dados
        </Button>
      </div>
    </Card>
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
