import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { getCategoryLabel, getSubcategoriesFor, PART_CATEGORY_DESCRIPTORS } from "../../utils/categories";
import type { IPartDraft, IPartDraftErrors } from "../../utils/draft";
import { PartImage } from "../PartImage";
import { PartSefazBadge } from "./PartSefazBadge";

const COPY = CATALOG_STRINGS.detail.identity;
const FORM_COPY = CATALOG_STRINGS.form.fields;

export interface IPartIdentityCardProps {
  part: IPart;
  /** Compact omits the description and uses a smaller image (sheet header). */
  compact?: boolean;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
  errors?: IPartDraftErrors;
}

export function PartIdentityCard({
  part,
  compact = false,
  editing = false,
  draft,
  onDraftChange,
  errors,
}: IPartIdentityCardProps) {
  if (editing && draft && onDraftChange) {
    return (
      <PartIdentityEditor
        draft={draft}
        onChange={onDraftChange}
        errors={errors}
        gtin={part.gtin}
        sefazStatus={part.sefazStatus}
        sefazCheckedAt={part.sefazCheckedAt}
        category={part.category}
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex gap-4">
        <PartImage part={part} size={compact ? "sm" : "lg"} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <h1 className="text-lg font-semibold uppercase leading-tight tracking-tight text-foreground">
              {part.name}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              SKU {part.sku} · OEM {part.oemCodes[0] ?? "—"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {part.category && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                {getCategoryLabel(part.category)}
              </span>
            )}
            {part.segment && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {part.segment}
              </span>
            )}
            {part.isOriginal ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                <Icon icon="mdi:check-decagram" size={11} />
                {CATALOG_STRINGS.badges.original}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {CATALOG_STRINGS.badges.equivalent}
              </span>
            )}
            {!part.active && (
              <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] text-destructive">
                {CATALOG_STRINGS.status.inactive}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* GTIN block — the official identity */}
      <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <Icon icon="mdi:barcode" size={13} />
          {COPY.gtinLabel}
        </div>
        {part.gtin ? (
          <>
            <p className="mt-1 font-mono text-base font-semibold tracking-wide text-foreground">
              {part.gtin}
            </p>
            <div className="mt-1.5">
              <PartSefazBadge status={part.sefazStatus} checkedAt={part.sefazCheckedAt} />
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">{COPY.noGtin}</p>
        )}
        {part.supplierCode && (
          <p className="mt-2 text-xs text-muted-foreground">
            {COPY.supplierCode}: <span className="font-mono">{part.supplierCode}</span>
          </p>
        )}
      </div>

      {/* Reference / group / type chips */}
      {(part.reference || part.group || part.partType) && (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
          {part.reference && <IdentityField label={COPY.reference} value={part.reference} mono />}
          {part.group && <IdentityField label={COPY.group} value={part.group} />}
          {part.partType && <IdentityField label={COPY.type} value={part.partType} />}
        </dl>
      )}

      {!compact && part.description && (
        <p className="mt-3 text-sm text-muted-foreground">{part.description}</p>
      )}
    </div>
  );
}

function IdentityField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-foreground" : "text-foreground"}>{value}</dd>
    </div>
  );
}

interface IPartIdentityEditorProps {
  draft: IPartDraft;
  onChange: (patch: Partial<IPartDraft>) => void;
  errors?: IPartDraftErrors;
  gtin: string | undefined;
  sefazStatus: IPart["sefazStatus"];
  sefazCheckedAt: string | undefined;
  category: IPart["category"];
}

function PartIdentityEditor({ draft, onChange, errors, sefazStatus, sefazCheckedAt }: IPartIdentityEditorProps) {
  const subOptions = getSubcategoriesFor(draft.category);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <EditField label={FORM_COPY.name} required error={errors?.name}>
          <Input value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
        </EditField>
        <EditField label={FORM_COPY.oemPrimary} required error={errors?.oemPrimary}>
          <Input
            value={draft.oemPrimary}
            onChange={(e) => onChange({ oemPrimary: e.target.value })}
            className="font-mono"
          />
        </EditField>
        <EditField label={FORM_COPY.oemAlternatives} hint="Separados por vírgula">
          <Input
            value={draft.oemAlternatives}
            onChange={(e) => onChange({ oemAlternatives: e.target.value })}
            className="font-mono"
          />
        </EditField>
        <EditField label={FORM_COPY.manufacturer} required error={errors?.brand}>
          <Input value={draft.brand} onChange={(e) => onChange({ brand: e.target.value })} />
        </EditField>
        <EditField label={FORM_COPY.supplier}>
          <Input value={draft.supplier} onChange={(e) => onChange({ supplier: e.target.value })} />
        </EditField>
        <EditField label={FORM_COPY.isOriginal}>
          <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3">
            <Switch
              checked={draft.isOriginal}
              onCheckedChange={(v) => onChange({ isOriginal: v })}
              id="edit-is-original"
            />
            <Label htmlFor="edit-is-original" className="cursor-pointer text-xs">
              {draft.isOriginal ? "Peça original" : "Peça equivalente"}
            </Label>
          </div>
        </EditField>
        <EditField label={FORM_COPY.category} required error={errors?.category}>
          <Select
            value={draft.category ?? ""}
            onValueChange={(v) => onChange({ category: v === "" ? undefined : (v as IPartDraft["category"]) })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {PART_CATEGORY_DESCRIPTORS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </EditField>
        <EditField label={FORM_COPY.subcategory}>
          <Select
            value={draft.subcategory ?? ""}
            onValueChange={(v) => onChange({ subcategory: v === "" ? undefined : v })}
            disabled={subOptions.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={subOptions.length === 0 ? "—" : "Selecione…"} />
            </SelectTrigger>
            <SelectContent>
              {subOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </EditField>
        <EditField label={COPY.gtinLabel}>
          <Input
            value={draft.gtin}
            onChange={(e) => onChange({ gtin: e.target.value })}
            className="font-mono"
          />
        </EditField>
        <EditField label={COPY.reference}>
          <Input value={draft.reference} onChange={(e) => onChange({ reference: e.target.value })} className="font-mono" />
        </EditField>
        <EditField label={COPY.group}>
          <Input value={draft.group} onChange={(e) => onChange({ group: e.target.value })} />
        </EditField>
        <EditField label={COPY.type}>
          <Input value={draft.partType} onChange={(e) => onChange({ partType: e.target.value })} />
        </EditField>
        <div className="md:col-span-2">
          <EditField label={FORM_COPY.description}>
            <Textarea
              value={draft.description}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={2}
            />
          </EditField>
        </div>
      </div>

      {draft.gtin && (
        <div className="mt-3">
          <PartSefazBadge status={sefazStatus} checkedAt={sefazCheckedAt} />
        </div>
      )}
    </div>
  );
}

function EditField({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[10px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
