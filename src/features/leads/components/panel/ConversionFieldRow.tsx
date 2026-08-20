import { useEffect, useMemo, useState } from "react";
import type { ICustomerAddress, ILead } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { formatCnpj, formatCpf, isValidCnpj, onlyDigits } from "@/features/customers/utils/cnpjCpf";
import { useMinhaReceita } from "@/features/customers/hooks/useMinhaReceita";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import { isConversionDocument, type IConversionField } from "../../engine/conversionReadiness";
import {
  buildDocumentSaveChanges,
  deriveReceitaLookupState,
  planReceitaAutofill,
} from "../../engine/receitaAutofill";
import { LeadReceitaCard } from "./LeadReceitaCard";

const COPY = LEADS_STRINGS.panel.conversion;

/** Keystroke settle time before the Receita lookup fires. Matches "Novo cliente". */
const LOOKUP_DEBOUNCE_MS = 450;
/** How long the save waits on the Receita before letting the seller through anyway. */
const LOOKUP_PATIENCE_MS = 3500;

/** Mask as the seller types: 11 digits or fewer reads as a CPF, more as a CNPJ. */
function maskDocument(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 14);
  if (digits.length <= 11) return formatCpf(digits);
  return formatCnpj(digits);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export interface IConversionFieldRowProps {
  field: IConversionField;
  lead: ILead;
  /** Writes the field. Resolves false when the write failed. */
  onSave: (changes: Partial<ILead>) => Promise<boolean>;
  /** Write in flight for THIS field. */
  pending: boolean;
  /** False for a viewer who cannot edit the lead — the row stays informative. */
  canEdit: boolean;
}

/**
 * One line of the conversion checklist: answered or not, and if not, the place
 * to answer it.
 *
 * The kit fills the field in place, and that is the point of the card — the
 * data gets captured DURING the conversation, not in a modal at the end of it.
 * Everything here writes straight to the lead.
 */
export function ConversionFieldRow({
  field,
  lead,
  onSave,
  pending,
  canEdit,
}: IConversionFieldRowProps) {
  const [open, setOpen] = useState(false);
  const label = COPY.fields[field.id];
  // The phone is the conversation's own address; there is no editor for it.
  const editable = canEdit && field.id !== "phone";

  const summary = (
    <>
      <Icon
        icon={field.filled ? "mdi:check-circle" : "mdi:circle-outline"}
        size={14}
        className={cn(
          "shrink-0",
          field.filled ? "text-severity-success" : "text-muted-foreground/50",
        )}
      />
      <span className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            "block text-xs",
            field.filled ? "font-medium text-muted-foreground" : "font-semibold text-foreground",
          )}
        >
          {label}
          {field.required && !field.filled && (
            <span aria-hidden className="ml-1 text-severity-critical">
              *
            </span>
          )}
        </span>
        {field.hint && (
          <span className="mt-px block text-[10.5px] text-muted-foreground">
            {COPY.hints[field.hint]}
          </span>
        )}
      </span>
      {pending ? (
        <Icon icon="mdi:loading" size={13} className="shrink-0 animate-spin text-muted-foreground" />
      ) : field.filled ? (
        <span
          className="max-w-[150px] truncate text-[11.5px] font-semibold text-muted-foreground"
          title={field.value ?? undefined}
        >
          {field.value}
        </span>
      ) : (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-0.5 text-[11.5px] font-bold",
            editable ? "text-muted-foreground group-hover:text-primary" : "text-muted-foreground/60",
          )}
        >
          {editable && <Icon icon="mdi:plus" size={11} />}
          {editable ? COPY.fill : "—"}
        </span>
      )}
    </>
  );

  const rowClass =
    "group flex w-full items-center gap-2 rounded px-1 py-1.5 -mx-1 text-left transition-colors";

  if (!editable) {
    return (
      <div className={rowClass} title={field.id === "phone" ? COPY.phoneReadOnly : undefined}>
        {summary}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            rowClass,
            "hover:bg-foreground/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {summary}
        </button>
      </PopoverTrigger>
      {/* The document editor carries the Receita's answer, which needs the room. */}
      <PopoverContent
        align="end"
        className={cn("p-3", field.id === "document" ? "w-[300px]" : "w-72")}
      >
        <FieldEditor
          field={field}
          lead={lead}
          onCancel={() => setOpen(false)}
          onSave={async (changes) => {
            const ok = await onSave(changes);
            if (ok) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function FieldEditor({
  field,
  lead,
  onSave,
  onCancel,
}: {
  field: IConversionField;
  lead: ILead;
  onSave: (changes: Partial<ILead>) => Promise<void>;
  onCancel: () => void;
}) {
  const label = COPY.fields[field.id];
  const [name, setName] = useState(lead.name ?? "");
  const [document, setDocument] = useState(lead.document ? maskDocument(lead.document) : "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [address, setAddress] = useState<ICustomerAddress>(
    lead.address ?? { street: "", number: "", district: "", city: "", state: "", zipCode: "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [useNameSuggestion, setUseNameSuggestion] = useState(false);

  // No effect re-seeding this from `lead`. Radix unmounts the popover's content
  // on close, so every open already starts from the current lead — and a
  // background refetch (a realtime participant change, say) hands us a NEW lead
  // object with the same values, which such an effect would use to wipe what
  // the seller is halfway through typing.

  const isDocumentField = field.id === "document";
  const {
    lookup: lookupCnpj,
    reset: resetCnpj,
    status: cnpjStatus,
    data: cnpjData,
  } = useMinhaReceita();
  const debouncedDocument = useDebounce(document, LOOKUP_DEBOUNCE_MS);
  const documentDigits = onlyDigits(document);
  /**
   * The CNPJ the current lookup was fired for. Tracked separately from the
   * debounced value because they disagree for exactly one render — the one
   * between the debounce landing and this effect running — and during it every
   * status on hand still describes the PREVIOUS number.
   */
  const [requestedCnpj, setRequestedCnpj] = useState<string | null>(null);
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  // CNPJ only: a CPF has no public lookup, and the Receita answers 404 for one.
  useEffect(() => {
    if (!isDocumentField) return;
    const target = onlyDigits(debouncedDocument);
    if (target.length !== 14 || !isValidCnpj(target)) {
      setRequestedCnpj(null);
      resetCnpj();
      return;
    }
    setRequestedCnpj(target);
    void lookupCnpj(target);
  }, [isDocumentField, debouncedDocument, lookupCnpj, resetCnpj]);

  // Editing the number retracts an accepted name suggestion — it belonged to
  // the company the PREVIOUS CNPJ named — and restarts the patience timer.
  useEffect(() => {
    setUseNameSuggestion(false);
    setWaitedTooLong(false);
  }, [documentDigits]);

  const receitaState = isDocumentField
    ? deriveReceitaLookupState({
        typed: document,
        requestedCnpj,
        status: cnpjStatus,
        loadedCnpj: cnpjData?.cnpj ?? null,
      })
    : "idle";

  const company = receitaState === "found" ? cnpjData : null;
  const plan = useMemo(
    () => (company ? planReceitaAutofill(lead, company) : null),
    [company, lead],
  );

  /**
   * The save waits on the Receita, but not forever. Without a ceiling the only
   * way out of `checking` is Cancel — which, because Radix unmounts the
   * popover's content, throws away the number the seller just typed. A slow
   * mirror (or a response that resolves after being superseded) would otherwise
   * hold the button hostage for the full 8-second timeout, or for good.
   */
  useEffect(() => {
    if (receitaState !== "checking") return;
    const timer = window.setTimeout(() => setWaitedTooLong(true), LOOKUP_PATIENCE_MS);
    return () => window.clearTimeout(timer);
  }, [receitaState]);

  /**
   * Waiting is only worth blocking the save for when the number on screen is a
   * NEW one — that is the write whose autofill would be lost. Reopening the row
   * on a document the lead already has never blocks at all.
   */
  const waitingForReceita =
    receitaState === "checking" &&
    !waitedTooLong &&
    documentDigits !== onlyDigits(lead.document ?? "");

  const submit = async () => {
    setError(null);
    if (field.id === "name") {
      if (!name.trim()) return setError(COPY.requiredName);
      return onSave({ name: name.trim() });
    }
    if (field.id === "document") {
      const digits = onlyDigits(document);
      // An emptied field clears the column — the seller who typed the wrong
      // number needs a way back to "not informed".
      if (!digits) return onSave({ document: undefined });
      if (!isConversionDocument(digits)) return setError(COPY.invalidDocument);
      // Everything the Receita answered for goes out in the SAME write: one
      // round trip, one refetch, and a checklist that jumps to its real score
      // instead of climbing a row at a time.
      return onSave(buildDocumentSaveChanges(digits, plan, useNameSuggestion));
    }
    if (field.id === "email") {
      const trimmed = email.trim();
      if (!trimmed) return onSave({ email: undefined });
      if (!isEmail(trimmed)) return setError(COPY.invalidEmail);
      return onSave({ email: trimmed });
    }
    // address
    if (!address.city.trim()) return setError(COPY.requiredCity);
    return onSave({
      address: {
        street: address.street.trim(),
        number: address.number.trim(),
        district: address.district.trim(),
        city: address.city.trim(),
        state: address.state.trim().toUpperCase().slice(0, 2),
        zipCode: address.zipCode.trim(),
      },
    });
  };

  return (
    <form
      className="space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-xs font-semibold text-foreground">{COPY.editTitle(label)}</p>

      {field.id === "name" && (
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
      )}

      {field.id === "document" && (
        <>
          <div className="relative">
            <Input
              autoFocus
              inputMode="numeric"
              value={document}
              onChange={(e) => setDocument(maskDocument(e.target.value))}
              placeholder="000.000.000-00"
              className="h-8 pr-8"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
              {receitaState === "checking" && (
                <Icon
                  icon="mdi:loading"
                  size={14}
                  className="animate-spin text-muted-foreground motion-reduce:animate-none"
                  aria-hidden
                />
              )}
              {receitaState === "found" && (
                <Icon
                  icon="mdi:check-decagram"
                  size={14}
                  className="text-severity-success"
                  aria-hidden
                />
              )}
              {receitaState === "notfound" && (
                <Icon
                  icon="mdi:magnify-remove-outline"
                  size={14}
                  className="text-severity-critical"
                  aria-hidden
                />
              )}
              {receitaState === "offline" && (
                <Icon icon="mdi:wifi-off" size={14} className="text-muted-foreground" aria-hidden />
              )}
            </span>
          </div>
          <LeadReceitaCard
            state={receitaState}
            company={company}
            plan={plan}
            useNameSuggestion={useNameSuggestion}
            onToggleNameSuggestion={() => setUseNameSuggestion((v) => !v)}
            onRetry={() => void lookupCnpj(document)}
          />
        </>
      )}

      {field.id === "email" && (
        <Input
          autoFocus
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-8"
        />
      )}

      {field.id === "address" && (
        <div className="grid grid-cols-3 gap-2">
          <AddressInput
            className="col-span-2"
            label={COPY.addressCity}
            value={address.city}
            autoFocus
            onChange={(v) => setAddress((a) => ({ ...a, city: v }))}
          />
          <AddressInput
            label={COPY.addressState}
            value={address.state}
            maxLength={2}
            onChange={(v) => setAddress((a) => ({ ...a, state: v.toUpperCase() }))}
          />
          <AddressInput
            className="col-span-2"
            label={COPY.addressStreet}
            value={address.street}
            onChange={(v) => setAddress((a) => ({ ...a, street: v }))}
          />
          <AddressInput
            label={COPY.addressNumber}
            value={address.number}
            onChange={(v) => setAddress((a) => ({ ...a, number: v }))}
          />
          <AddressInput
            className="col-span-2"
            label={COPY.addressDistrict}
            value={address.district}
            onChange={(v) => setAddress((a) => ({ ...a, district: v }))}
          />
          <AddressInput
            label={COPY.addressZip}
            value={address.zipCode}
            onChange={(v) => setAddress((a) => ({ ...a, zipCode: v }))}
          />
        </div>
      )}

      {error && <p className="text-[11px] text-severity-critical">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {COPY.cancel}
        </Button>
        {/* Saving mid-lookup would drop the autofill the seller is about to be
            offered — the wait is the whole reason the panel calls the Receita.
            `title`/`aria-label` carry the reason: a disabled button that says
            nothing is the same dead end for a screen reader as for anyone. */}
        <Button
          type="submit"
          size="sm"
          disabled={waitingForReceita}
          title={waitingForReceita ? COPY.receita.checking : undefined}
          aria-label={waitingForReceita ? `${COPY.save} — ${COPY.receita.checking}` : undefined}
        >
          {COPY.save}
        </Button>
      </div>
    </form>
  );
}

function AddressInput({
  label,
  value,
  onChange,
  className,
  autoFocus,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoFocus?: boolean;
  maxLength?: number;
}) {
  return (
    <div className={className}>
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input
        autoFocus={autoFocus}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 h-8"
      />
    </div>
  );
}
