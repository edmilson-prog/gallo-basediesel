import { useState } from "react";
import type { ICustomerAddress } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/Icon";
import { useCustomerAuth } from "@/features/storefront-account/hooks/useCustomerAuth";
import { useCustomerAuthStore } from "@/features/storefront-account/store/customerAuthStore";
import type { ICheckoutAddress } from "../../hooks/useCheckoutState";
import { formatZip, isValidZip, useViaCep } from "../../hooks/useViaCep";
import { STOREFRONT_CART_STRINGS as S } from "../../i18n/pt-BR";

export interface IAddressStepProps {
  value: ICheckoutAddress | null;
  onChange: (address: ICheckoutAddress) => void;
}

const EMPTY_ADDRESS: ICheckoutAddress = {
  zipCode: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  saveForLater: false,
};

/**
 * Checkout step 2 — delivery address (PRD-064 RF-021–024).
 *
 * Tries to resolve the address via ViaCEP and falls back to a manual form
 * when the lookup fails or the user prefers to type. The "save for later"
 * toggle is disabled for guests with a tooltip.
 */
export function AddressStep({ value, onChange }: IAddressStepProps) {
  const { isAuthenticated, customer } = useCustomerAuth();
  const savedAddresses = useCustomerAuthStore((s) =>
    customer ? (s.savedAddresses[customer.id] ?? []) : [],
  );
  const addSavedAddress = useCustomerAuthStore((s) => s.addSavedAddress);
  const viaCep = useViaCep();
  const [form, setForm] = useState<ICheckoutAddress>(value ?? EMPTY_ADDRESS);
  const [errors, setErrors] = useState<Partial<Record<keyof ICustomerAddress, string>>>({});

  const handleZipLookup = async () => {
    setErrors({});
    if (!isValidZip(form.zipCode)) {
      setErrors({ zipCode: S.errZipInvalid });
      return;
    }
    const lookup = await viaCep.lookup(form.zipCode);
    if (lookup) {
      setForm((prev) => ({
        ...prev,
        zipCode: lookup.zipCode,
        street: lookup.street || prev.street,
        district: lookup.district || prev.district,
        city: lookup.city || prev.city,
        state: lookup.state || prev.state,
      }));
    }
  };

  const handleConfirm = () => {
    const next: Partial<Record<keyof ICustomerAddress, string>> = {};
    if (!form.zipCode) next.zipCode = S.errRequired;
    else if (!isValidZip(form.zipCode)) next.zipCode = S.errZipInvalid;
    if (!form.street.trim()) next.street = S.errRequired;
    if (!form.number.trim()) next.number = S.errRequired;
    if (!form.district.trim()) next.district = S.errRequired;
    if (!form.city.trim()) next.city = S.errRequired;
    if (!form.state.trim()) next.state = S.errRequired;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    if (form.saveForLater && isAuthenticated && customer) {
      const { saveForLater, ...address } = form;
      void saveForLater;
      addSavedAddress(customer.id, address);
    }
    onChange(form);
  };

  return (
    <Card className="space-y-5 p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">{S.addressTitle}</h2>
        <p className="text-xs text-muted-foreground">
          Informe o endereço completo para emitir a nota e calcular o frete.
        </p>
      </div>

      {savedAddresses.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {S.addressSavedHeading}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {savedAddresses.map((saved) => (
              <button
                key={saved.id}
                type="button"
                onClick={() =>
                  setForm({
                    zipCode: saved.zipCode,
                    street: saved.street,
                    number: saved.number,
                    complement: saved.complement,
                    district: saved.district,
                    city: saved.city,
                    state: saved.state,
                    saveForLater: false,
                  })
                }
                className="rounded-md border border-border p-3 text-left text-xs transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <span className="block font-medium text-foreground">
                  {saved.label ?? `${saved.city}/${saved.state}`}
                </span>
                <span className="block text-muted-foreground">
                  {saved.street}, {saved.number} · {saved.district}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <Field label={S.addressZipLabel} error={errors.zipCode}>
          <div className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder={S.addressZipPlaceholder}
              value={form.zipCode}
              maxLength={9}
              onChange={(e) => setForm((f) => ({ ...f, zipCode: formatZip(e.target.value) }))}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleZipLookup()}
              disabled={viaCep.loading}
            >
              {viaCep.loading ? S.addressZipLookupLoading : S.addressZipLookupCta}
            </Button>
          </div>
          {viaCep.error && (
            <p className="text-xs text-severity-warning">{S.addressZipLookupFailed}</p>
          )}
        </Field>
        <div />

        <Field label={S.addressStreetLabel} error={errors.street} className="sm:col-span-2">
          <Input
            autoComplete="address-line1"
            value={form.street}
            onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
          />
        </Field>

        <Field label={S.addressNumberLabel} error={errors.number}>
          <Input
            autoComplete="address-line2"
            value={form.number}
            onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
          />
        </Field>
        <Field label={S.addressComplementLabel}>
          <Input
            value={form.complement ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, complement: e.target.value }))}
          />
        </Field>

        <Field label={S.addressDistrictLabel} error={errors.district}>
          <Input
            value={form.district}
            onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
          />
        </Field>
        <Field label={S.addressCityLabel} error={errors.city}>
          <Input
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          />
        </Field>

        <Field label={S.addressStateLabel} error={errors.state} className="sm:w-24">
          <Input
            maxLength={2}
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))}
          />
        </Field>
        <div />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
        <div>
          <Label htmlFor="address-save" className="text-sm">
            {S.addressSaveToggle}
          </Label>
          {!isAuthenticated && (
            <p className="text-xs text-muted-foreground">{S.addressSaveDisabledHint}</p>
          )}
        </div>
        <Switch
          id="address-save"
          checked={form.saveForLater ?? false}
          disabled={!isAuthenticated}
          onCheckedChange={(checked) => setForm((f) => ({ ...f, saveForLater: checked }))}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleConfirm}>
          <Icon icon="mdi:check" size={14} className="mr-1" aria-hidden />
          Confirmar endereço
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
