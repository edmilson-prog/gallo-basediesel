import { useState } from "react";
import type { ICustomerAddress, ILead } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatCnpj, formatCpf, onlyDigits } from "@/features/customers/utils/cnpjCpf";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import { isConversionDocument, type IConversionField } from "../../engine/conversionReadiness";

const COPY = LEADS_STRINGS.panel.conversion;

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
      <PopoverContent align="end" className="w-72 p-3">
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

  // No effect re-seeding this from `lead`. Radix unmounts the popover's content
  // on close, so every open already starts from the current lead — and a
  // background refetch (a realtime participant change, say) hands us a NEW lead
  // object with the same values, which such an effect would use to wipe what
  // the seller is halfway through typing.

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
      return onSave({ document: digits });
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
        <Input
          autoFocus
          inputMode="numeric"
          value={document}
          onChange={(e) => setDocument(maskDocument(e.target.value))}
          placeholder="000.000.000-00"
          className="h-8"
        />
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
        <Button type="submit" size="sm">
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
