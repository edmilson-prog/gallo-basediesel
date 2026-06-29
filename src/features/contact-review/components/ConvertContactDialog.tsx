import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { IConversation, ICustomer, ID } from "@/shared/types";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSellersProvider } from "@/providers/data";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";
import { useContactConversion } from "../hooks/useContactConversion";
import {
  validateConversion, toConvertInput, type IConversionFormValues,
} from "../engine/validateConversion";

export interface IConvertContactDialogProps {
  customer: ICustomer;
  conversation?: IConversation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConverted?: () => void;
}

function initialValues(customer: ICustomer): IConversionFormValues {
  const name = customer.type === "B2B" ? customer.nomeFantasia : customer.fullName;
  return {
    type: customer.type,
    fullName: customer.type === "B2C" ? (name ?? "") : (customer.whatsappName ?? ""),
    cpf: customer.type === "B2C" ? (customer.cpf ?? "") : "",
    razaoSocial: customer.type === "B2B" ? (customer.razaoSocial ?? "") : "",
    nomeFantasia: customer.type === "B2B" ? (name ?? "") : (customer.whatsappName ?? ""),
    cnpj: customer.type === "B2B" ? (customer.cnpj ?? "") : "",
    contactName: customer.type === "B2B" ? (customer.contactName ?? "") : "",
  };
}

export function ConvertContactDialog({
  customer, conversation, open, onOpenChange, onConverted,
}: IConvertContactDialogProps) {
  const role = useCurrentRole();
  const isStaff = role === "Owner" || role === "Gestor";
  const { currentStoreId } = useCurrentStore();
  const sellersProvider = useSellersProvider();
  const { saving, convert } = useContactConversion();

  const [values, setValues] = useState<IConversionFormValues>(() => initialValues(customer));
  const [sellerId, setSellerId] = useState<ID | "">("");
  const [errors, setErrors] = useState<ReturnType<typeof validateConversion>["errors"]>({});

  useEffect(() => {
    if (open) {
      setValues(initialValues(customer));
      setSellerId("");
      setErrors({});
    }
  }, [open, customer]);

  // list() returns ISeller[] directly (not IPaginatedResult)
  const sellersQuery = useQuery({
    queryKey: ["sellers-list", currentStoreId],
    queryFn: () => sellersProvider.list({ storeId: currentStoreId ?? undefined }),
    enabled: open && isStaff && Boolean(currentStoreId),
  });
  const sellers = sellersQuery.data ?? [];

  const set = (patch: Partial<IConversionFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateConversion(values);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    try {
      const input = toConvertInput(
        customer.id,
        values,
        isStaff ? (sellerId || undefined) : undefined,
      );
      await convert(input, conversation?.id ?? null);
      toast.success(S.convert.success);
      onConverted?.();
      onOpenChange(false);
    } catch {
      toast.error(S.convert.failure);
    }
  };

  const phone = useMemo(() => customer.phone, [customer.phone]);
  const isB2B = values.type === "B2B";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onOpenChange(false)}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{S.convert.title}</DialogTitle>
            <DialogDescription>{S.convert.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>{S.convert.typeLabel}</Label>
            <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {(["B2C", "B2B"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set({ type: t })}
                  className={
                    "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                    (values.type === t
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {t === "B2C" ? S.convert.pf : S.convert.pj}
                </button>
              ))}
            </div>
          </div>

          {!isB2B ? (
            <>
              <Field label={S.convert.fullName} error={errors.fullName}>
                <Input value={values.fullName} onChange={(e) => set({ fullName: e.target.value })} autoFocus />
              </Field>
              <Field label={`${S.convert.cpf} · ${S.convert.optional}`} error={errors.cpf}>
                <Input value={values.cpf} onChange={(e) => set({ cpf: e.target.value })} placeholder="000.000.000-00" />
              </Field>
            </>
          ) : (
            <>
              <Field label={`${S.convert.razaoSocial} · ${S.convert.optional}`}>
                <Input value={values.razaoSocial} onChange={(e) => set({ razaoSocial: e.target.value })} />
              </Field>
              <Field label={S.convert.nomeFantasia} error={errors.nomeFantasia}>
                <Input value={values.nomeFantasia} onChange={(e) => set({ nomeFantasia: e.target.value })} autoFocus />
              </Field>
              <Field label={`${S.convert.cnpj} · ${S.convert.optional}`} error={errors.cnpj}>
                <Input value={values.cnpj} onChange={(e) => set({ cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
              </Field>
              <Field label={`${S.convert.contactName} · ${S.convert.optional}`}>
                <Input value={values.contactName} onChange={(e) => set({ contactName: e.target.value })} />
              </Field>
            </>
          )}

          <Field label={S.convert.phone}>
            <Input value={phone} readOnly className="text-muted-foreground" />
          </Field>

          <div className="space-y-1.5">
            <Label>{S.convert.owner}</Label>
            {isStaff ? (
              <Select value={sellerId} onValueChange={(v) => setSellerId(v as ID)}>
                <SelectTrigger><SelectValue placeholder={S.convert.ownerPick} /></SelectTrigger>
                <SelectContent>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={S.convert.ownerSelf} readOnly className="text-muted-foreground" />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {S.convert.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? S.convert.submitting : S.convert.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
