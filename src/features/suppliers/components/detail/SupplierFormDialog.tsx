import { useEffect, useRef, useState } from "react";
import type { ISupplier, SupplierCategory, SupplierPaymentMethod } from "@/shared/types";
import type { ICreateSupplierInput, IUpdateSupplierPatch } from "@/providers/data";
import { useSuppliersProvider } from "@/providers/data";
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
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { useMinhaReceita, type ICnpjCompany } from "@/features/customers/hooks/useMinhaReceita";
import {
  formatCnpj,
  formatPhone,
  isValidCnpj,
  onlyDigits,
} from "@/features/customers/utils/cnpjCpf";
import {
  canSaveSupplier,
  resolveSupplierDocState,
  type SupplierDocState,
} from "../../engine/supplierForm";
import { useSupplierMutations } from "../../hooks/useSupplierMutations";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";
import { CATEGORY_LABEL, PAYMENT_METHOD_LABEL } from "../../utils/supplierDisplay";

const COPY = SUPPLIERS_STRINGS;

/** Keystroke settle time before the Receita and duplicate lookups fire. */
const LOOKUP_DEBOUNCE_MS = 380;

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
 * In edit mode the field opens holding the saved document WITHOUT re-querying
 * the Receita or the duplicate guard — both would be pure waste (the value is
 * already confirmed) and the guard would need to special-case matching itself.
 * The moment the user changes so much as one digit it stops being "the saved
 * value" and falls through to the exact same flow as a brand-new CNPJ,
 * including a fresh duplicate check against every OTHER supplier.
 */
export function SupplierFormDialog({ open, supplier, onClose, onSaved }: ISupplierFormDialogProps) {
  const { currentStoreId } = useCurrentStore();
  const provider = useSuppliersProvider();
  const { create, update } = useSupplierMutations();
  const isEditing = supplier !== null;

  const [documentValue, setDocumentValue] = useState("");
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

  const [duplicateFound, setDuplicateFound] = useState(false);
  const [duplicateChecking, setDuplicateChecking] = useState(false);

  const documentRef = useRef<HTMLInputElement>(null);
  /** The document the record was opened with — the edit-mode "don't re-query" baseline. */
  const savedDocumentDigitsRef = useRef("");
  // Autofill must only touch fields still empty AT THE TIME the lookup resolves,
  // and it runs from inside the lookup effect — reading through a ref keeps the
  // effect off the field values, which would otherwise re-fire it per keystroke.
  const currentValuesRef = useRef({ name, tradeName, contactPhone, city, state });
  currentValuesRef.current = { name, tradeName, contactPhone, city, state };
  const liveDigitsRef = useRef("");

  const { lookup: lookupCnpj, reset: resetCnpj, status: cnpjStatus } = useMinhaReceita();
  const debouncedDocument = useDebounce(documentValue, LOOKUP_DEBOUNCE_MS);

  const digits = onlyDigits(documentValue);
  liveDigitsRef.current = digits;
  const debouncedDigits = onlyDigits(debouncedDocument);
  const unchangedSavedDocument =
    savedDocumentDigitsRef.current !== "" && digits === savedDocumentDigitsRef.current;

  const pending = digits.length === 14 && (digits !== debouncedDigits || duplicateChecking);

  const docState: SupplierDocState = unchangedSavedDocument
    ? "done"
    : resolveSupplierDocState({ digits, pending, cnpjStatus, duplicateFound });

  const docMessage = unchangedSavedDocument
    ? COPY.form.savedDocumentHint
    : COPY.form.docMessages[docState];

  const canSave = canSaveSupplier({ name, docState });
  const isSubmitting = create.isPending || update.isPending;

  // Reset every time the dialog opens — for a supplier (edit) or for `null`
  // (cadastro). Deliberately mirrors `ExpenseFormDialog`'s `[open, entity]`
  // pattern already used elsewhere in the app.
  useEffect(() => {
    if (!open) return;
    const doc = supplier?.document ?? "";
    savedDocumentDigitsRef.current = doc;
    setDocumentValue(doc ? formatCnpj(doc) : "");
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
    setDuplicateFound(false);
    setDuplicateChecking(false);
    resetCnpj();
  }, [open, supplier, resetCnpj]);

  // The document field is where the cursor starts — deferred a tick so the
  // dialog's own initial focus (Radix moves it to the content) lands first.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => documentRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  /** Fills only the fields the user has left empty, and always snapshots the registry facts. */
  const applyCompany = (company: ICnpjCompany) => {
    const cur = currentValuesRef.current;
    if (!cur.name.trim() && company.razaoSocial) setName(company.razaoSocial);
    if (!cur.tradeName.trim() && company.nomeFantasia) setTradeName(company.nomeFantasia);
    if (!cur.contactPhone.trim() && company.phone) setContactPhone(formatPhone(company.phone));
    if (!cur.city.trim() && company.address?.city) setCity(company.address.city);
    if (!cur.state.trim() && company.address?.state) setState(company.address.state);
    setRegistryStatus(company.situacaoCadastral ?? "");
    setRegistryActivity(company.cnae ?? "");
  };

  // Receita lookup — skipped entirely while the field still holds the saved,
  // already-confirmed document (see the component doc comment above).
  useEffect(() => {
    if (unchangedSavedDocument) {
      resetCnpj();
      return;
    }
    const target = onlyDigits(debouncedDocument);
    if (target.length !== 14 || !isValidCnpj(target)) {
      resetCnpj();
      return;
    }
    let active = true;
    void lookupCnpj(target).then((company) => {
      // Reopening the dialog doesn't remount it, so a lookup fired for a
      // previous document could otherwise autofill the freshly reset form.
      if (active && company && liveDigitsRef.current === target) applyCompany(company);
    });
    return () => {
      active = false;
    };
  }, [debouncedDocument, unchangedSavedDocument, lookupCnpj, resetCnpj]);

  // Duplicate guard — same "don't re-query the saved value" skip as above.
  useEffect(() => {
    if (unchangedSavedDocument) {
      setDuplicateFound(false);
      setDuplicateChecking(false);
      return;
    }
    const target = onlyDigits(debouncedDocument);
    if (target.length !== 14 || !isValidCnpj(target)) {
      setDuplicateFound(false);
      setDuplicateChecking(false);
      return;
    }
    let active = true;
    setDuplicateChecking(true);
    void provider
      .list({ search: target, pageSize: 1 })
      .then((result) => {
        if (active) setDuplicateFound(result.data.length > 0);
      })
      .catch(() => {
        // Fail open: a guard outage must not block a legitimate cadastro.
        if (active) setDuplicateFound(false);
      })
      .finally(() => {
        if (active) setDuplicateChecking(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedDocument, unchangedSavedDocument, provider]);

  const adornment = (
    {
      loading: (
        <span
          aria-hidden="true"
          className="size-[15px] animate-spin rounded-full border-2 border-primary/25 border-t-primary motion-reduce:animate-none"
        />
      ),
      done: <Icon icon="mdi:check-decagram" size={16} className="text-severity-success" />,
      invalid: <Icon icon="mdi:alert-circle" size={16} className="text-severity-critical" />,
      duplicate: <Icon icon="mdi:alert-circle" size={16} className="text-severity-critical" />,
      notfound: <Icon icon="mdi:alert-circle" size={16} className="text-primary" />,
      error: <Icon icon="mdi:alert-circle" size={16} className="text-muted-foreground" />,
      idle: null,
      typing: null,
    } satisfies Record<SupplierDocState, React.ReactNode>
  )[docState];

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
      tradeName: tradeName.trim() || undefined,
      // A half-typed document ("typing" doesn't block saving) is dropped
      // rather than stored — only a complete, checksum-valid CNPJ is kept.
      document: digits.length === 14 ? digits : undefined,
      category,
      paymentTerms: paymentTerms || undefined,
      leadTimeDays,
      contactName: contactName.trim() || undefined,
      contactPhone: onlyDigits(contactPhone) || undefined,
      preferredPaymentMethod: preferredPaymentMethod || undefined,
      suppliedItems,
      registryStatus: registryStatus || undefined,
      registryActivity: registryActivity || undefined,
      city: city || undefined,
      state: state || undefined,
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
                  ref={documentRef}
                  id="supplier-document"
                  autoFocus
                  inputMode="numeric"
                  className={cn(
                    "pr-9 font-mono",
                    (docState === "invalid" || docState === "duplicate") &&
                      "border-severity-critical focus-visible:ring-severity-critical",
                  )}
                  value={documentValue}
                  onChange={(e) => setDocumentValue(formatCnpj(e.target.value))}
                  placeholder={COPY.form.documentPlaceholder}
                  aria-describedby="supplier-document-status"
                />
                {adornment && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {adornment}
                  </span>
                )}
              </div>
              <p
                id="supplier-document-status"
                className="min-h-[1em] text-xs text-muted-foreground"
              >
                {docMessage}
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
