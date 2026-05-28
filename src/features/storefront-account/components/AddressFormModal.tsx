import { useState } from "react";
import type { ICustomerAddress } from "@/shared/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import { formatZip, isValidZip, useViaCep } from "@/features/storefront-cart/hooks/useViaCep";
import type { ICustomerSavedAddress } from "../store/customerAuthStore";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

export interface IAddressFormValue extends ICustomerAddress {
  label?: string;
}

export interface IAddressFormModalProps {
  open: boolean;
  initial?: ICustomerSavedAddress;
  onClose: () => void;
  onSubmit: (value: IAddressFormValue) => void;
}

const EMPTY: IAddressFormValue = {
  label: "",
  zipCode: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
};

export function AddressFormModal({ open, initial, onClose, onSubmit }: IAddressFormModalProps) {
  const viaCep = useViaCep();
  const [form, setForm] = useState<IAddressFormValue>(() => initial ?? EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof IAddressFormValue, string>>>({});

  // Reset the form whenever the dialog (re)opens with a different target.
  const [trackedKey, setTrackedKey] = useState<string | undefined>(initial?.id);
  if (open && trackedKey !== initial?.id) {
    setTrackedKey(initial?.id);
    setForm(initial ?? EMPTY);
    setErrors({});
  }

  const update = <K extends keyof IAddressFormValue>(key: K, value: IAddressFormValue[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleZipLookup = async () => {
    if (!isValidZip(form.zipCode)) {
      setErrors((e) => ({ ...e, zipCode: S.errZipInvalid }));
      return;
    }
    const found = await viaCep.lookup(form.zipCode);
    if (found) {
      setForm((prev) => ({
        ...prev,
        street: found.street || prev.street,
        district: found.district || prev.district,
        city: found.city || prev.city,
        state: found.state || prev.state,
      }));
    }
  };

  const handleSubmit = () => {
    const next: Partial<Record<keyof IAddressFormValue, string>> = {};
    if (!isValidZip(form.zipCode)) next.zipCode = S.errZipInvalid;
    if (!form.street.trim()) next.street = S.errRequired;
    if (!form.number.trim()) next.number = S.errRequired;
    if (!form.district.trim()) next.district = S.errRequired;
    if (!form.city.trim()) next.city = S.errRequired;
    if (!form.state.trim()) next.state = S.errRequired;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({ ...form, label: form.label?.trim() || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial ? S.addressesModalTitleEdit : S.addressesModalTitleCreate}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Apelido (opcional)">
            <Input
              placeholder="Ex.: Garagem, Matriz"
              value={form.label ?? ""}
              onChange={(e) => update("label", e.target.value)}
            />
          </Field>

          <Field label="CEP" error={errors.zipCode}>
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                placeholder="00000-000"
                value={form.zipCode}
                onChange={(e) => update("zipCode", formatZip(e.target.value))}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleZipLookup()}
                disabled={viaCep.loading}
              >
                {viaCep.loading ? (
                  <Icon icon="mdi:loading" size={16} className="animate-spin" aria-hidden />
                ) : (
                  "Buscar"
                )}
              </Button>
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Rua / avenida" error={errors.street} className="sm:col-span-2">
              <Input value={form.street} onChange={(e) => update("street", e.target.value)} />
            </Field>
            <Field label="Número" error={errors.number}>
              <Input value={form.number} onChange={(e) => update("number", e.target.value)} />
            </Field>
            <Field label="Complemento" className="sm:col-span-3">
              <Input
                value={form.complement ?? ""}
                onChange={(e) => update("complement", e.target.value)}
              />
            </Field>
            <Field label="Bairro" error={errors.district}>
              <Input value={form.district} onChange={(e) => update("district", e.target.value)} />
            </Field>
            <Field label="Cidade" error={errors.city}>
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
            </Field>
            <Field label="UF" error={errors.state}>
              <Input
                maxLength={2}
                value={form.state}
                onChange={(e) => update("state", e.target.value.toUpperCase())}
              />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>{S.addressesSave}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
