import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ICustomer, ICustomerB2B, ICustomerB2C, ID, ISeller } from "@/shared/types";
import type { ICustomerDocumentMatch } from "@/providers/data";
import { useCustomersProvider } from "@/providers/data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { formatCnpj, formatCpf, formatPhone, isValidPhone, onlyDigits } from "../../utils/cnpjCpf";
import { useMinhaReceita } from "../../hooks/useMinhaReceita";
import type { ICnpjCompany } from "../../utils/minhaReceitaMapper";
import {
  canSubmitDocument,
  deriveDocState,
  documentLength,
  offersManualFill,
} from "../../engine/newCustomerLookup";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { CustomerTypeCard } from "./new-customer/CustomerTypeCard";
import { NewCustomerField } from "./new-customer/NewCustomerField";
import { LookupStatusLine } from "./new-customer/LookupStatusLine";
import { ReceitaPanel } from "./new-customer/ReceitaPanel";
import { DuplicatePanel } from "./new-customer/DuplicatePanel";

const COPY = CUSTOMER_STRINGS.newCustomer;

/** How long an autofilled field stays highlighted. */
const FLASH_MS = 1600;
/** Keystroke settle time before the Receita and duplicate lookups fire. */
const LOOKUP_DEBOUNCE_MS = 450;

export interface INewCustomerModalProps {
  open: boolean;
  sellers: ISeller[];
  defaultSellerId: ID | null;
  sellerLocked: boolean;
  storeId: ID;
  onClose: () => void;
  onSubmit: (input: Omit<ICustomer, "id" | "createdAt" | "notes">) => Promise<void>;
  /** Opens the ficha of a customer the duplicate guard found. */
  onOpenCustomer?: (id: ID) => void;
}

type CustomerType = ICustomer["type"];
type FlashKey = "name" | "phone" | "email";

/**
 * Cadastro rápido de cliente.
 *
 * The document leads the form because it is what fills the rest of it: a CNPJ
 * brings razão social, endereço, CNAE and (often) telefone straight from the
 * Receita, so asking for the name first would be asking the user to type what
 * the form is about to know anyway. Everything downstream — the status line,
 * the Receita panel, the duplicate block — reports on that one field.
 */
export function NewCustomerModal({
  open,
  sellers,
  defaultSellerId,
  sellerLocked,
  storeId,
  onClose,
  onSubmit,
  onOpenCustomer,
}: INewCustomerModalProps) {
  const customersProvider = useCustomersProvider();

  const [type, setType] = useState<CustomerType>("B2B");
  const [document, setDocument] = useState("");
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sellerId, setSellerId] = useState<ID | "">(defaultSellerId ?? "");
  const [manual, setManual] = useState(false);
  const [flash, setFlash] = useState<Partial<Record<FlashKey, boolean>>>({});
  const [duplicates, setDuplicates] = useState<ICustomerDocumentMatch[]>([]);
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const documentRef = useRef<HTMLInputElement>(null);
  // Autofill must only write into fields that are still empty, and it runs from
  // inside the lookup effect — reading state through a ref keeps the effect off
  // the name/phone/email dependency list, which would re-fire it per keystroke.
  const currentValues = useRef({ name, phone, email });
  currentValues.current = { name, phone, email };
  // What the user is looking at RIGHT NOW, as opposed to what the debounced
  // lookup was fired for — an answer that lands after the field moved on (kept
  // typing, switched type, closed and reopened the modal) must not autofill.
  const liveDigits = useRef("");

  const {
    lookup: lookupCnpj,
    reset: resetCnpj,
    status: cnpjStatus,
    data: cnpjData,
  } = useMinhaReceita();
  const debouncedDocument = useDebounce(document, LOOKUP_DEBOUNCE_MS);

  const digits = onlyDigits(document);
  liveDigits.current = digits;
  const debouncedDigits = onlyDigits(debouncedDocument);
  const complete = digits.length === documentLength(type);

  // True while the debounced lookups still describe the PREVIOUS document.
  // Trusting them inside that window is how a pasted duplicate slips through.
  const lookupsPending = complete && (digits !== debouncedDigits || duplicateChecking);

  const docState = deriveDocState({
    type,
    digits,
    pending: lookupsPending,
    cnpjStatus,
    duplicateFound: duplicates.length > 0,
    manual,
  });

  const resetForm = useCallback(() => {
    setType("B2B");
    setDocument("");
    setName("");
    setContactName("");
    setPhone("");
    setEmail("");
    setSellerId(defaultSellerId ?? "");
    setManual(false);
    setFlash({});
    setDuplicates([]);
    setDuplicateChecking(false);
    resetCnpj();
  }, [defaultSellerId, resetCnpj]);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  // The document is the field that fills the rest of the form, so that is where
  // the cursor starts — and where it goes back to when switching type swaps the
  // input out. Deferred a tick so the dialog's own initial focus lands first.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => documentRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open, type]);

  /** Fills the empty fields the Receita can answer for, and says which it touched. */
  const applyCompany = useCallback((company: ICnpjCompany) => {
    const touched: Partial<Record<FlashKey, boolean>> = {};
    const { name: currentName, phone: currentPhone, email: currentEmail } = currentValues.current;

    const filledName = company.nomeFantasia || company.razaoSocial;
    if (!currentName.trim() && filledName) {
      setName(filledName);
      touched.name = true;
    }
    if (!currentPhone.trim() && company.phone) {
      setPhone(formatPhone(company.phone));
      touched.phone = true;
    }
    if (!currentEmail.trim() && company.email) {
      setEmail(company.email);
      touched.email = true;
    }
    if (Object.keys(touched).length > 0) setFlash(touched);
  }, []);

  useEffect(() => {
    if (Object.keys(flash).length === 0) return;
    const timer = setTimeout(() => setFlash({}), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  // Receita lookup — CNPJ only, once the checksum passes.
  useEffect(() => {
    if (type !== "B2B") {
      resetCnpj();
      return;
    }
    const target = onlyDigits(debouncedDocument);
    if (target.length !== documentLength("B2B")) {
      resetCnpj();
      return;
    }
    let active = true;
    void lookupCnpj(target).then((company) => {
      // `active` alone isn't enough: reopening the modal remounts nothing, so
      // the effect never tears down and a lookup fired for the previous CNPJ
      // would autofill the freshly reset form.
      if (active && company && liveDigits.current === target) applyCompany(company);
    });
    return () => {
      active = false;
    };
  }, [debouncedDocument, type, lookupCnpj, resetCnpj, applyCompany]);

  // Duplicate guard. Runs off a SECURITY DEFINER RPC rather than a customers
  // search on purpose: `customers_select` hides other sellers' customers from a
  // non-staff caller, so a plain search would answer "none" and the duplicate
  // would be created anyway.
  useEffect(() => {
    const target = onlyDigits(debouncedDocument);
    // Every exit path must clear `duplicateChecking`: the cleanup below flips
    // `active` to false, so an early return that skipped the reset would latch
    // the flag at true and hold the form in "loading" for good.
    if (target.length !== documentLength(type)) {
      setDuplicates([]);
      setDuplicateChecking(false);
      return;
    }
    let active = true;
    setDuplicateChecking(true);
    void customersProvider
      .findByDocument(target)
      .then((rows) => {
        if (active) setDuplicates(rows);
      })
      .catch(() => {
        // Fail open: a guard outage must not block a legitimate cadastro.
        if (active) setDuplicates([]);
      })
      .finally(() => {
        if (active) setDuplicateChecking(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedDocument, type, customersProvider]);

  const handleTypeChange = (next: CustomerType) => {
    if (next === type) return;
    setType(next);
    setDocument("");
    setManual(false);
    setDuplicates([]);
    setDuplicateChecking(false);
    resetCnpj();
  };

  const isDuplicate = docState === "duplicate";
  const phoneTouched = onlyDigits(phone).length > 0;
  const phoneValid = useMemo(() => isValidPhone(phone), [phone]);
  const receitaCompany = type === "B2B" && docState === "done" ? cnpjData : null;

  const formValid =
    name.trim().length > 0 &&
    canSubmitDocument(docState) &&
    phoneValid &&
    sellerId !== "" &&
    (type === "B2C" || contactName.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const base = {
        storeId,
        phone: onlyDigits(phone),
        email: email.trim() || undefined,
        sellerId: sellerId as ID,
        status: "ativo" as const,
        tags: [],
        // The Receita's address is the one piece of the lookup that has nowhere
        // to show on this form — it goes straight to the ficha.
        address: receitaCompany?.address,
      };
      // `Omit` does not distribute over a union, so `Omit<ICustomer, …>`
      // collapses to the shared base fields and would reject `cnpj`/`cpf` here.
      // Checking each branch against its own variant keeps the fields typed.
      const input =
        type === "B2B"
          ? ({
              ...base,
              type: "B2B",
              cnpj: onlyDigits(document),
              // Razão social is the Receita's, never the user's — the field on
              // screen is the nome fantasia, which is what the CRM displays.
              razaoSocial: receitaCompany?.razaoSocial || name.trim(),
              nomeFantasia: name.trim(),
              contactName: contactName.trim(),
            } satisfies Omit<ICustomerB2B, "id" | "createdAt" | "notes">)
          : ({
              ...base,
              type: "B2C",
              cpf: onlyDigits(document),
              fullName: name.trim(),
            } satisfies Omit<ICustomerB2C, "id" | "createdAt" | "notes">);
      await onSubmit(input);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const documentAdornment =
    {
      loading: (
        <span
          aria-hidden="true"
          className="size-[15px] animate-spin rounded-full border-2 border-primary/25 border-t-primary motion-reduce:animate-none"
        />
      ),
      done: <Icon icon="mdi:check-decagram" size={16} className="text-severity-success" />,
      manual: <Icon icon="mdi:pencil-outline" size={16} className="text-muted-foreground" />,
      invalid: (
        <Icon icon="mdi:alert-circle-outline" size={16} className="text-severity-critical" />
      ),
      notfound: (
        <Icon icon="mdi:magnify-remove-outline" size={16} className="text-severity-critical" />
      ),
      error: <Icon icon="mdi:wifi-off" size={16} className="text-primary" />,
      duplicate: <Icon icon="mdi:account-check-outline" size={16} className="text-primary" />,
      idle: null,
      typing: null,
    }[docState] ?? null;

  const documentFallbackIcon =
    type === "B2B" ? (
      <Icon icon="mdi:magnify" size={15} className="text-muted-foreground/70" />
    ) : (
      <Icon
        icon="mdi:card-account-details-outline"
        size={15}
        className="text-muted-foreground/70"
      />
    );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[600px] gap-0 overflow-hidden p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="px-[22px] pr-12 pt-[18px] text-left">
            <DialogTitle className="font-display text-[21px] font-extrabold uppercase leading-none tracking-[0.02em] text-foreground">
              {COPY.title}
            </DialogTitle>
            <DialogDescription className="text-[12.5px] text-muted-foreground">
              {COPY.subtitle}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3.5 px-[22px] pt-4">
            <div role="radiogroup" aria-label={COPY.typeLegend} className="flex gap-2.5">
              <CustomerTypeCard
                active={type === "B2B"}
                icon="mdi:office-building-outline"
                title={COPY.typePj.title}
                subtitle={COPY.typePj.subtitle}
                onClick={() => handleTypeChange("B2B")}
              />
              <CustomerTypeCard
                active={type === "B2C"}
                icon="mdi:account-outline"
                title={COPY.typePf.title}
                subtitle={COPY.typePf.subtitle}
                onClick={() => handleTypeChange("B2C")}
              />
            </div>

            {type === "B2B" ? (
              <NewCustomerField
                ref={documentRef}
                id="customer-document"
                label={COPY.cnpj.label}
                note={COPY.cnpj.note}
                mono
                inputMode="numeric"
                value={document}
                onChange={(v) => setDocument(formatCnpj(v))}
                placeholder="00.000.000/0000-00"
                invalid={docState === "invalid" || docState === "notfound"}
                describedBy="customer-document-status"
                adornment={documentAdornment ?? documentFallbackIcon}
              >
                <LookupStatusLine id="customer-document-status" state={docState} type={type} />
                {offersManualFill(docState) && (
                  <button
                    type="button"
                    onClick={() => setManual(true)}
                    className="mt-1.5 cursor-pointer text-xs font-bold text-primary hover:underline"
                  >
                    {COPY.manualFillCta}
                  </button>
                )}
              </NewCustomerField>
            ) : (
              <NewCustomerField
                ref={documentRef}
                id="customer-document"
                label={COPY.cpf.label}
                mono
                inputMode="numeric"
                value={document}
                onChange={(v) => setDocument(formatCpf(v))}
                placeholder="000.000.000-00"
                invalid={docState === "invalid"}
                describedBy="customer-document-status"
                adornment={documentAdornment ?? documentFallbackIcon}
              >
                {docState === "invalid" || docState === "loading" ? (
                  <LookupStatusLine id="customer-document-status" state={docState} type={type} />
                ) : (
                  <div
                    id="customer-document-status"
                    className="mt-[7px] flex min-h-4 items-center gap-[7px] text-muted-foreground"
                  >
                    <Icon icon="mdi:information-outline" size={13} className="shrink-0" />
                    <span className="text-xs">{COPY.cpf.hint}</span>
                  </div>
                )}
              </NewCustomerField>
            )}

            {receitaCompany && <ReceitaPanel company={receitaCompany} />}
            {isDuplicate && (
              <DuplicatePanel
                matches={duplicates}
                onOpenCustomer={(id) => {
                  onOpenCustomer?.(id);
                  onClose();
                }}
              />
            )}

            {/* A duplicate ends the form: there is nothing left to fill in. */}
            {!isDuplicate && (
              <>
                <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2">
                  <NewCustomerField
                    id="customer-name"
                    label={type === "B2B" ? COPY.fields.nameB2B : COPY.fields.nameB2C}
                    note={type === "B2B" ? COPY.fields.nameB2BNote : null}
                    flash={flash.name}
                    value={name}
                    onChange={setName}
                    placeholder={
                      type === "B2B"
                        ? COPY.fields.nameB2BPlaceholder
                        : COPY.fields.nameB2CPlaceholder
                    }
                  />
                  {type === "B2B" && (
                    <NewCustomerField
                      id="customer-contact"
                      label={COPY.fields.contact}
                      value={contactName}
                      onChange={setContactName}
                      placeholder={COPY.fields.contactPlaceholder}
                    />
                  )}
                  <NewCustomerField
                    id="customer-phone"
                    label={COPY.fields.phone}
                    flash={flash.phone}
                    inputMode="tel"
                    value={phone}
                    onChange={(v) => setPhone(formatPhone(v))}
                    placeholder={COPY.fields.phonePlaceholder}
                    invalid={phoneTouched && !phoneValid}
                    describedBy="customer-phone-error"
                  >
                    <div id="customer-phone-error" className="min-h-4" aria-live="polite">
                      {phoneTouched && !phoneValid && (
                        <p className="mt-1 text-[11px] font-semibold text-severity-critical">
                          {COPY.errors.invalidPhone}
                        </p>
                      )}
                    </div>
                  </NewCustomerField>
                  <NewCustomerField
                    id="customer-email"
                    label={COPY.fields.email}
                    note={COPY.fields.emailNote}
                    flash={flash.email}
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={setEmail}
                    placeholder={COPY.fields.emailPlaceholder}
                  />
                </div>

                <div className="min-w-0">
                  <div className="mb-1.5 flex items-baseline gap-[7px]">
                    <label
                      htmlFor="customer-seller"
                      className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground"
                    >
                      {COPY.fields.seller}
                    </label>
                  </div>
                  <Select
                    value={sellerId === "" ? undefined : sellerId}
                    onValueChange={(v) => setSellerId(v)}
                    disabled={sellerLocked}
                  >
                    <SelectTrigger
                      id="customer-seller"
                      className="h-auto rounded-[7px] border-border bg-muted/40 px-3 py-2.5 text-sm font-semibold focus:border-primary focus:ring-[3px] focus:ring-primary/15"
                    >
                      <SelectValue placeholder={COPY.fields.sellerPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {sellers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <div className="mt-1 flex items-center gap-2.5 px-[22px] pb-[18px] pt-4">
            <span className="flex-1 text-[11.5px] text-muted-foreground/70">
              {isDuplicate ? COPY.duplicate.blocked : COPY.footerHint}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="font-display text-[13px] font-bold uppercase tracking-[0.045em]"
            >
              {COPY.cancel}
            </Button>
            <Button
              type="submit"
              disabled={!formValid || isSubmitting}
              className="gap-1.5 font-display text-[13px] font-bold uppercase tracking-[0.045em]"
            >
              <Icon icon="mdi:account-plus-outline" size={14} />
              {isSubmitting ? COPY.submitting : COPY.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
