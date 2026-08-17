import { useCallback, useEffect, useRef, useState } from "react";
import type { ISupplier, SupplierCategory, SupplierPaymentMethod } from "@/shared/types";
import type { ICreateSupplierInput, IUpdateSupplierPatch } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ICnpjCompany } from "@/features/customers/hooks/useMinhaReceita";
import { formatPhone, onlyDigits } from "@/features/customers/utils/cnpjCpf";
import { canSaveSupplier } from "../../engine/supplierForm";
import { useSupplierDocumentField } from "../../hooks/useSupplierDocumentField";
import { useSupplierMutations } from "../../hooks/useSupplierMutations";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";
import { CATEGORY_LABEL, PAYMENT_METHOD_LABEL } from "../../utils/supplierDisplay";

const COPY = SUPPLIERS_STRINGS;

const CATEGORY_OPTIONS: SupplierCategory[] = ["parts", "services", "freight", "financial"];
const PAYMENT_METHOD_OPTIONS: SupplierPaymentMethod[] = [
  "boleto",
  "pix",
  "transferencia",
  "debito_automatico",
];

/** Sentinel for the two optional selects — Radix `Select` rejects an empty-string value. */
const NONE = "__none";

export interface ISupplierFormDialogProps {
  open: boolean;
  /** `null` means cadastro; a supplier means edição. */
  supplier: ISupplier | null;
  onClose: () => void;
  onSaved: (supplier: ISupplier) => void;
}

/**
 * Cadastro/edição de fornecedor, CNPJ primeiro — one component, `supplier`
 * decides the mode. The document field leads because a valid CNPJ fills the
 * rest of the form from the Receita, same reasoning as `NewCustomerModal`.
 *
 * All of the CNPJ field's own machinery (debounce, Receita lookup, duplicate
 * guard, derived state/copy/icon) lives in `useSupplierDocumentField` — see
 * that hook's doc comment for the edit-mode "don't re-query the saved value"
 * behavior and the race it closes. This component owns everything else:
 * the rest of the fields, and turning them into a create/update payload.
 */
export function SupplierFormDialog({ open, supplier, onClose, onSaved }: ISupplierFormDialogProps) {
  const { currentStoreId } = useCurrentStore();
  const { create, update } = useSupplierMutations();
  const isEditing = supplier !== null;

  const [name, setName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [category, setCategory] = useState<SupplierCategory>("parts");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [leadTimeDaysText, setLeadTimeDaysText] = useState("");
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<SupplierPaymentMethod | "">(
    "",
  );
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [suppliedItemsText, setSuppliedItemsText] = useState("");
  // Not rendered as fields — filled silently from the Receita lookup, same
  // treatment `NewCustomerModal` gives the customer's address.
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [registryStatus, setRegistryStatus] = useState("");
  const [registryActivity, setRegistryActivity] = useState("");

  // Autofill must only touch fields still empty AT THE TIME the lookup
  // resolves, and it runs from inside the hook's lookup effect — reading
  // through a ref keeps that effect off these field values, which would
  // otherwise re-fire it per keystroke.
  const currentValuesRef = useRef({ name, tradeName, contactPhone, city, state });
  currentValuesRef.current = { name, tradeName, contactPhone, city, state };

  /** Fills only the fields the user has left empty, and always snapshots the registry facts. */
  const applyCompany = useCallback((company: ICnpjCompany) => {
    const cur = currentValuesRef.current;
    if (!cur.name.trim() && company.razaoSocial) setName(company.razaoSocial);
    if (!cur.tradeName.trim() && company.nomeFantasia) setTradeName(company.nomeFantasia);
    if (!cur.contactPhone.trim() && company.phone) setContactPhone(formatPhone(company.phone));
    if (!cur.city.trim() && company.address?.city) setCity(company.address.city);
    if (!cur.state.trim() && company.address?.state) setState(company.address.state);
    setRegistryStatus(company.situacaoCadastral ?? "");
    setRegistryActivity(company.cnae ?? "");
  }, []);

  const docField = useSupplierDocumentField({
    open,
    savedDigits: supplier?.document ?? "",
    onResolved: applyCompany,
  });

  const canSave = canSaveSupplier({ name, docState: docField.docState });
  const isSubmitting = create.isPending || update.isPending;

  // Reset the rest of the form every time the dialog opens — for a supplier
  // (edit) or for `null` (cadastro). The document field resets itself inside
  // `useSupplierDocumentField`. Deliberately mirrors `ExpenseFormDialog`'s
  // `[open, entity]` pattern already used elsewhere in the app.
  useEffect(() => {
    if (!open) return;
    setName(supplier?.name ?? "");
    setTradeName(supplier?.tradeName ?? "");
    setCategory(supplier?.category ?? "parts");
    setPaymentTerms(supplier?.paymentTerms ?? "");
    setLeadTimeDaysText(supplier?.leadTimeDays !== undefined ? String(supplier.leadTimeDays) : "");
    setPreferredPaymentMethod(supplier?.preferredPaymentMethod ?? "");
    setContactName(supplier?.contactName ?? "");
    setContactPhone(supplier?.contactPhone ? formatPhone(supplier.contactPhone) : "");
    setSuppliedItemsText(supplier?.suppliedItems?.join(", ") ?? "");
    setCity(supplier?.city ?? "");
    setState(supplier?.state ?? "");
    setRegistryStatus(supplier?.registryStatus ?? "");
    setRegistryActivity(supplier?.registryActivity ?? "");
  }, [open, supplier]);

  const footerHint = canSave
    ? isEditing
      ? COPY.form.readyHintEdit
      : COPY.form.readyHintCreate
    : COPY.form.incompleteHint;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || isSubmitting || !currentStoreId) return;

    const suppliedItems = suppliedItemsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const leadTimeDaysValue = leadTimeDaysText.trim() === "" ? undefined : Number(leadTimeDaysText);
    const leadTimeDays =
      leadTimeDaysValue !== undefined &&
      Number.isFinite(leadTimeDaysValue) &&
      leadTimeDaysValue >= 0
        ? leadTimeDaysValue
        : undefined;

    const shared = {
      name: name.trim(),
      // Optional text fields are sent as "" (never `undefined`) when blank,
      // so that clearing a previously-saved value in edit mode actually
      // clears it. `IUpdateSupplierPatch`/`patchToRow` treat `undefined` as
      // "leave untouched" and "" as "clear" — the same convention `document`
      // already used before this fix (`row.document = patch.document ||
      // null`), now extended to every optional text column it wrote.
      tradeName: tradeName.trim(),
      // A half-typed document ("typing" doesn't block saving) is dropped
      // rather than stored — only a complete, checksum-valid CNPJ is kept.
      document: docField.digits.length === 14 ? docField.digits : "",
      category,
      paymentTerms,
      leadTimeDays,
      contactName: contactName.trim(),
      contactPhone: onlyDigits(contactPhone),
      // Unlike the free-text fields above, this is a typed enum column — the
      // contract has no "" member to carry a clear-intent through, so it
      // keeps the older "absent means leave untouched" behavior.
      preferredPaymentMethod: preferredPaymentMethod || undefined,
      suppliedItems,
      registryStatus,
      registryActivity,
      city,
      state,
    };

    try {
      const saved = isEditing
        ? await update.mutateAsync({
            id: supplier.id,
            patch: shared satisfies IUpdateSupplierPatch,
          })
        : await create.mutateAsync({
            storeId: currentStoreId,
            ...shared,
          } satisfies ICreateSupplierInput);
      onSaved(saved);
    } catch {
      // Already surfaced by useSupplierMutations' onError — keep the dialog
      // open so the user can fix the field (e.g. a server-side duplicate).
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? COPY.form.editTitle : COPY.form.createTitle}</DialogTitle>
            <DialogDescription>
              {isEditing ? COPY.form.editSubtitle : COPY.form.createSubtitle}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3.5 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="supplier-document">{COPY.form.documentLabel}</Label>
              <div className="relative">
                <Input
                  ref={docField.inputRef}
                  id="supplier-document"
                  autoFocus
                  inputMode="numeric"
                  className={cn(
                    "pr-9 font-mono",
                    (docField.docState === "invalid" || docField.docState === "duplicate") &&
                      "border-severity-critical focus-visible:ring-severity-critical",
                  )}
                  value={docField.value}
                  onChange={(e) => docField.onChange(e.target.value)}
                  placeholder={COPY.form.documentPlaceholder}
                  aria-describedby="supplier-document-status"
                />
                {docField.adornment && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {docField.adornment}
                  </span>
                )}
              </div>
              <p
                id="supplier-document-status"
                className="min-h-[1em] text-xs text-muted-foreground"
              >
                {docField.message}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="supplier-name">{COPY.form.nameLabel}</Label>
                <Input
                  id="supplier-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={COPY.form.namePlaceholder}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier-trade-name">{COPY.form.tradeNameLabel}</Label>
                <Input
                  id="supplier-trade-name"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  placeholder={COPY.form.tradeNamePlaceholder}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="supplier-category">{COPY.form.categoryLabel}</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as SupplierCategory)}>
                  <SelectTrigger id="supplier-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier-payment-terms">{COPY.form.paymentTermsLabel}</Label>
                <Select
                  value={paymentTerms || NONE}
                  onValueChange={(v) => setPaymentTerms(v === NONE ? "" : v)}
                >
                  <SelectTrigger id="supplier-payment-terms">
                    <SelectValue placeholder={COPY.form.paymentTermsPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {COPY.form.paymentTermsOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier-lead-time">{COPY.form.leadTimeLabel}</Label>
                <Input
                  id="supplier-lead-time"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={leadTimeDaysText}
                  onChange={(e) => setLeadTimeDaysText(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="supplier-payment-method">
                  {COPY.form.preferredPaymentMethodLabel}
                </Label>
                <Select
                  value={preferredPaymentMethod || NONE}
                  onValueChange={(v) =>
                    setPreferredPaymentMethod(v === NONE ? "" : (v as SupplierPaymentMethod))
                  }
                >
                  <SelectTrigger id="supplier-payment-method">
                    <SelectValue placeholder={COPY.form.preferredPaymentMethodPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {PAYMENT_METHOD_OPTIONS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {PAYMENT_METHOD_LABEL[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="supplier-contact-name">{COPY.form.contactNameLabel}</Label>
                <Input
                  id="supplier-contact-name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder={COPY.form.contactNamePlaceholder}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="supplier-contact-phone">{COPY.form.contactPhoneLabel}</Label>
                <Input
                  id="supplier-contact-phone"
                  inputMode="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(formatPhone(e.target.value))}
                />
              </div>

              <div className="col-span-3 space-y-1.5">
                <Label htmlFor="supplier-supplied-items">{COPY.form.suppliedItemsLabel}</Label>
                <Input
                  id="supplier-supplied-items"
                  value={suppliedItemsText}
                  onChange={(e) => setSuppliedItemsText(e.target.value)}
                  placeholder={COPY.form.suppliedItemsPlaceholder}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">{footerHint}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                {COPY.form.cancel}
              </Button>
              <Button type="submit" disabled={!canSave || isSubmitting}>
                {isSubmitting ? COPY.form.submitting : COPY.form.submit}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
