import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ID } from "@/shared/types";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Icon } from "@/components/Icon";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import {
  formatCnpj,
  formatCpf,
  formatPhone,
  isValidCnpj,
  isValidCpf,
  isValidPhone,
  onlyDigits,
} from "@/features/customers/utils/cnpjCpf";
import { useMinhaReceita } from "@/features/customers/hooks/useMinhaReceita";
import {
  GuestMatchError,
  useCustomerAuth,
  type CustomerRegisterInput,
} from "../hooks/useCustomerAuth";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegisterType = "B2C" | "B2B";

/** Visual validation state for the CNPJ field (drives icon + message). */
type DocFieldState = "idle" | "checking" | "valid" | "invalid" | "warning";

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
  const { register, confirmGuestMerge } = useCustomerAuth();
  const [form, setForm] = useState<IFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof IFormState | "root", string>>>({});
  const [submitting, setSubmitting] = useState(false);
  // PRD-067 RF-023 — guest-checkout match awaiting the visitor's confirmation.
  const [guestMatch, setGuestMatch] = useState<{
    guestId: ID;
    matchedBy: "email" | "document";
    payload: CustomerRegisterInput;
  } | null>(null);
  const [merging, setMerging] = useState(false);

  const {
    lookup: lookupCnpj,
    reset: resetCnpj,
    status: cnpjStatus,
    data: cnpjData,
  } = useMinhaReceita();
  const debouncedCnpj = useDebounce(form.cnpj, 500);
  const cnpjChecking = form.type === "B2B" && cnpjStatus === "loading";

  // Visual state for the CNPJ field: instant for the checksum, API-driven after.
  const cnpjFieldState: DocFieldState =
    form.type !== "B2B" || onlyDigits(form.cnpj).length < 14
      ? "idle"
      : !isValidCnpj(form.cnpj)
        ? "invalid"
        : cnpjStatus === "loading"
          ? "checking"
          : cnpjStatus === "invalid"
            ? "invalid"
            : cnpjStatus === "error"
              ? "warning"
              : cnpjStatus === "success"
                ? "valid"
                : "checking";

  useSeoMeta({ title: S.registerPageTitle, description: S.registerPageDescription });

  const update = <K extends keyof IFormState>(key: K, value: IFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // CNPJ lookup against Minha Receita; autofill razão social / nome fantasia
  // only into empty fields so the visitor's own input is never overwritten.
  useEffect(() => {
    if (form.type !== "B2B") {
      resetCnpj();
      return;
    }
    const digits = onlyDigits(debouncedCnpj);
    if (digits.length !== 14 || !isValidCnpj(debouncedCnpj)) {
      resetCnpj();
      return;
    }
    let active = true;
    void lookupCnpj(debouncedCnpj).then((company) => {
      if (!active || !company) return;
      setForm((prev) => ({
        ...prev,
        razaoSocial: prev.razaoSocial.trim() ? prev.razaoSocial : company.razaoSocial,
        nomeFantasia: prev.nomeFantasia.trim()
          ? prev.nomeFantasia
          : company.nomeFantasia || company.razaoSocial,
      }));
    });
    return () => {
      active = false;
    };
  }, [debouncedCnpj, form.type, lookupCnpj, resetCnpj]);

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
      else if (cnpjStatus === "invalid") next.cnpj = S.errCnpjNotFound;
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

    setSubmitting(true);
    try {
      await register(payload);
      toast.success(S.registerSuccess);
      void navigate({ to: "/loja/conta" });
    } catch (err) {
      if (err instanceof GuestMatchError) {
        // Don't merge silently — ask the visitor to confirm linking the order.
        setGuestMatch({ guestId: err.guestId, matchedBy: err.matchedBy, payload });
      } else if (err instanceof Error && err.name === "EmailTakenError") {
        setErrors({ email: S.registerEmailTaken });
      } else {
        setErrors({ root: "Não foi possível criar a conta. Tente novamente." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmMerge = async () => {
    if (!guestMatch || merging) return;
    setMerging(true);
    try {
      await confirmGuestMerge(guestMatch.guestId, guestMatch.payload);
      setGuestMatch(null);
      toast.success(S.guestMergeSuccess);
      void navigate({ to: "/loja/conta" });
    } catch {
      setGuestMatch(null);
      setErrors({ root: "Não foi possível vincular o pedido. Tente novamente." });
    } finally {
      setMerging(false);
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
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">
                  {S.registerCnpjLabel}
                </Label>
                <div className="relative">
                  <Input
                    inputMode="numeric"
                    className="pr-9"
                    placeholder={S.registerCnpjPlaceholder}
                    value={form.cnpj}
                    aria-invalid={cnpjFieldState === "invalid" || Boolean(errors.cnpj)}
                    aria-describedby="register-cnpj-msg"
                    onChange={(e) => {
                      update("cnpj", formatCnpj(e.target.value));
                      if (errors.cnpj) setErrors((prev) => ({ ...prev, cnpj: undefined }));
                    }}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {cnpjFieldState === "checking" && (
                      <Icon
                        icon="mdi:loading"
                        size={16}
                        className="animate-spin text-muted-foreground motion-reduce:animate-none"
                      />
                    )}
                    {cnpjFieldState === "valid" && (
                      <Icon icon="mdi:check-circle" size={16} className="text-success" />
                    )}
                    {cnpjFieldState === "invalid" && (
                      <Icon icon="mdi:alert-circle" size={16} className="text-destructive" />
                    )}
                    {cnpjFieldState === "warning" && (
                      <Icon icon="mdi:cloud-alert-outline" size={16} className="text-warning" />
                    )}
                  </span>
                </div>
                <div id="register-cnpj-msg" className="min-h-4" aria-live="polite">
                  {cnpjFieldState === "checking" && (
                    <p className="text-xs text-muted-foreground">{S.cnpjChecking}</p>
                  )}
                  {cnpjFieldState === "valid" && cnpjData?.razaoSocial && (
                    <p className="inline-flex items-center gap-1 text-xs text-success">
                      <Icon icon="mdi:office-building-outline" size={13} />
                      <span className="font-medium">{cnpjData.razaoSocial}</span>
                    </p>
                  )}
                  {cnpjFieldState === "warning" && (
                    <p className="inline-flex flex-wrap items-center gap-1.5 text-xs text-warning">
                      <Icon icon="mdi:cloud-alert-outline" size={13} />
                      {S.cnpjLookupError}
                      <button
                        type="button"
                        onClick={() => void lookupCnpj(form.cnpj)}
                        className="font-medium underline underline-offset-2 hover:no-underline"
                      >
                        {S.cnpjRetry}
                      </button>
                    </p>
                  )}
                  {(cnpjFieldState === "invalid" || (cnpjFieldState === "idle" && errors.cnpj)) &&
                    errors.cnpj && (
                      <p role="alert" className="text-xs text-destructive">
                        {errors.cnpj}
                      </p>
                    )}
                  {cnpjFieldState === "invalid" && !errors.cnpj && (
                    <p role="alert" className="text-xs text-destructive">
                      {cnpjStatus === "invalid" ? S.errCnpjNotFound : S.errCnpjInvalid}
                    </p>
                  )}
                </div>
              </div>
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

          <Button type="submit" size="lg" className="w-full" disabled={submitting || cnpjChecking}>
            {submitting ? S.registerSubmitting : cnpjChecking ? S.cnpjChecking : S.registerSubmit}
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

      <AlertDialog open={guestMatch !== null} onOpenChange={(open) => !open && setGuestMatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{S.guestMergeTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {guestMatch?.matchedBy === "document" ? S.guestMergeByDocument : S.guestMergeByEmail}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>{S.guestMergeCancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmMerge();
              }}
              disabled={merging}
            >
              {S.guestMergeConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
