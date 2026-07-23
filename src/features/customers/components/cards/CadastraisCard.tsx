import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer, ICustomerAddress } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useAuth } from "@/features/auth/useAuth";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { formatCNPJ, formatCPF, formatPhone } from "@/shared/utils/format";
import { formatCnpj, formatCpf } from "../../utils/cnpjCpf";
import {
  buildCustomerPatch,
  formatCep,
  toCustomerDraft,
  validateCustomerDraft,
  type ICustomerDraft,
  type ICustomerDraftErrors,
} from "../../utils/customerDraft";

const COPY = CUSTOMER_STRINGS.overview.cadastrais;

export interface ICadastraisCardProps {
  customer: ICustomer;
  /** Enables the inline editor (detail page only). The Atendimento fiche mounts
   *  the card without this prop, so it stays read-only there. */
  editable?: boolean;
  /** Nonce bumped by the ⋮ "Editar dados" action to open the editor on demand. */
  editSignal?: number;
}

/**
 * Identity card — renders B2B fields (CNPJ, razão social, nome fantasia,
 * contato) or B2C fields (CPF, nome completo). Discriminated union ensures
 * the wrong branch never reads from missing fields.
 *
 * When `editable` and the caller has write access, the card flips into a
 * self-contained inline editor (pure engine in `../../utils/customerDraft`).
 * Telefone stays read-only by design — it is the WhatsApp anchor.
 */
export function CadastraisCard({ customer, editable, editSignal }: ICadastraisCardProps) {
  const provider = useCustomersProvider();
  const queryClient = useQueryClient();
  const { currentUser, hasRole } = useAuth();
  const canEdit = usePermission("customer", "edit");

  // Mirror the RLS `customers_update` predicate: staff, or the wallet owner.
  // A seller who merely ATTENDS a pool contact sees the page but no CTA.
  const isWalletOwner = currentUser?.sellerId != null && customer.sellerId === currentUser.sellerId;
  const canWrite = canEdit && (hasRole(["Owner", "Gestor"]) || isWalletOwner);
  const showEdit = Boolean(editable) && canWrite;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ICustomerDraft | null>(null);
  const [errors, setErrors] = useState<ICustomerDraftErrors>({});
  const [saving, setSaving] = useState(false);
  const consumedSignal = useRef<number | undefined>(undefined);

  const startEdit = () => {
    setDraft(toCustomerDraft(customer));
    setErrors({});
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
    setErrors({});
  };

  // Open the editor when the menu bumps `editSignal` (once per distinct value).
  useEffect(() => {
    if (!editSignal || !showEdit) return;
    if (editSignal === consumedSignal.current) return;
    consumedSignal.current = editSignal;
    startEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSignal, showEdit]);

  const changeDraft = (patch: Partial<ICustomerDraft>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  const handleSave = async () => {
    if (!draft) return;
    const validation = validateCustomerDraft(draft, customer.type);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    const patch = buildCustomerPatch(customer, draft);
    if (Object.keys(patch).length === 0) {
      cancelEdit();
      return;
    }

    setSaving(true);
    try {
      const before: Record<string, unknown> = {};
      for (const key of Object.keys(patch)) {
        before[key] = (customer as unknown as Record<string, unknown>)[key];
      }
      await provider.update(customer.id, patch);
      auditLog({
        action: "customer.data_updated",
        resource: "customer",
        resourceId: customer.id,
        before,
        after: patch,
      });
      void queryClient.invalidateQueries({ queryKey: ["customer-profile", customer.id] });
      void queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      toast.success(COPY.editSavedToast);
      cancelEdit();
    } catch {
      toast.error(COPY.editFailedToast);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-background p-3">
      <header className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon icon="mdi:badge-account-outline" size={14} />
          {COPY.title}
        </span>
        {showEdit && !editing && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label={COPY.edit}
            onClick={startEdit}
          >
            <Icon icon="mdi:pencil-outline" size={14} />
          </Button>
        )}
      </header>

      {editing && draft ? (
        <EditView
          type={customer.type}
          phone={customer.phone}
          draft={draft}
          errors={errors}
          onChange={changeDraft}
        />
      ) : (
        <ReadView customer={customer} />
      )}

      {editing && (
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
            {COPY.cancel}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? COPY.saving : COPY.save}
          </Button>
        </div>
      )}
    </section>
  );
}

function ReadView({ customer }: { customer: ICustomer }) {
  return (
    <dl className="space-y-2 text-xs">
      {customer.type === "B2B" ? (
        <>
          <Row label={COPY.razaoSocial} value={customer.razaoSocial} />
          <Row label={COPY.nomeFantasia} value={customer.nomeFantasia} />
          <Row label={COPY.cnpj} value={formatCNPJ(customer.cnpj)} mono />
          <Row label={COPY.contactName} value={customer.contactName} />
        </>
      ) : (
        <>
          <Row label={COPY.fullName} value={customer.fullName} />
          <Row label={COPY.cpf} value={formatCPF(customer.cpf)} mono />
        </>
      )}
      <Row label={COPY.email} value={customer.email} emptyLabel={COPY.noEmail} />
      <Row label={COPY.phone} value={formatPhone(customer.phone)} mono />
      <AddressRow address={customer.address} />
    </dl>
  );
}

function Row({
  label,
  value,
  mono,
  emptyLabel,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  emptyLabel?: string;
}) {
  const isEmpty = !value || value.trim() === "";
  return (
    <div className="grid grid-cols-[8rem_1fr] items-baseline gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          isEmpty ? "italic text-muted-foreground" : "text-foreground",
          !isEmpty && mono && "font-mono",
        )}
      >
        {isEmpty ? (emptyLabel ?? "—") : value}
      </dd>
    </div>
  );
}

function AddressRow({ address }: { address?: ICustomerAddress }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-baseline gap-2 border-t border-border pt-2">
      <dt className="text-muted-foreground">{COPY.address}</dt>
      <dd className="text-foreground">
        {address ? (
          <span className="block leading-snug">
            {address.street}, {address.number}
            {address.complement ? ` — ${address.complement}` : ""}
            <br />
            <span className="text-muted-foreground">
              {address.district} • {address.city}/{address.state} • {address.zipCode}
            </span>
          </span>
        ) : (
          <span className="italic text-muted-foreground">{COPY.noAddress}</span>
        )}
      </dd>
    </div>
  );
}

function EditView({
  type,
  phone,
  draft,
  errors,
  onChange,
}: {
  type: ICustomer["type"];
  phone: string;
  draft: ICustomerDraft;
  errors: ICustomerDraftErrors;
  onChange: (patch: Partial<ICustomerDraft>) => void;
}) {
  return (
    <div className="space-y-3">
      {type === "B2B" ? (
        <>
          <Field
            label={COPY.razaoSocial}
            value={draft.razaoSocial}
            error={errors.razaoSocial}
            onChange={(v) => onChange({ razaoSocial: v })}
          />
          <Field
            label={COPY.nomeFantasia}
            value={draft.nomeFantasia}
            onChange={(v) => onChange({ nomeFantasia: v })}
          />
          <Field
            label={COPY.cnpj}
            value={draft.cnpj}
            error={errors.cnpj}
            mono
            inputMode="numeric"
            onChange={(v) => onChange({ cnpj: formatCnpj(v) })}
          />
          <Field
            label={COPY.contactName}
            value={draft.contactName}
            onChange={(v) => onChange({ contactName: v })}
          />
        </>
      ) : (
        <>
          <Field
            label={COPY.fullName}
            value={draft.fullName}
            error={errors.fullName}
            onChange={(v) => onChange({ fullName: v })}
          />
          <Field
            label={COPY.cpf}
            value={draft.cpf}
            error={errors.cpf}
            mono
            inputMode="numeric"
            onChange={(v) => onChange({ cpf: formatCpf(v) })}
          />
        </>
      )}

      <Field
        label={COPY.email}
        value={draft.email}
        error={errors.email}
        inputMode="email"
        onChange={(v) => onChange({ email: v })}
      />

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{COPY.phone}</Label>
        <Input value={formatPhone(phone)} disabled className="font-mono" />
        <p className="text-[11px] text-muted-foreground">{COPY.phoneReadOnlyHint}</p>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {COPY.address}
        </p>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Field
            label={COPY.addressStreet}
            value={draft.street}
            error={errors.street}
            onChange={(v) => onChange({ street: v })}
          />
          <Field
            label={COPY.addressNumber}
            value={draft.number}
            onChange={(v) => onChange({ number: v })}
          />
        </div>
        <Field
          label={COPY.addressComplement}
          value={draft.complement}
          onChange={(v) => onChange({ complement: v })}
        />
        <div className="grid grid-cols-2 gap-2">
          <Field
            label={COPY.addressDistrict}
            value={draft.district}
            onChange={(v) => onChange({ district: v })}
          />
          <Field
            label={COPY.addressCity}
            value={draft.city}
            error={errors.city}
            onChange={(v) => onChange({ city: v })}
          />
        </div>
        <div className="grid grid-cols-[5rem_1fr] gap-2">
          <Field
            label={COPY.addressState}
            value={draft.state}
            error={errors.state}
            maxLength={2}
            onChange={(v) => onChange({ state: v.toUpperCase() })}
          />
          <Field
            label={COPY.addressZip}
            value={draft.zipCode}
            error={errors.zipCode}
            mono
            inputMode="numeric"
            onChange={(v) => onChange({ zipCode: formatCep(v) })}
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  error,
  onChange,
  mono,
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  mono?: boolean;
  inputMode?: "numeric" | "email";
  maxLength?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-8 text-xs", mono && "font-mono")}
        aria-invalid={error ? true : undefined}
      />
      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
