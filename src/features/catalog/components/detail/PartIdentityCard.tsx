import { toast } from "sonner";
import type { IPart } from "@/shared/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { getCategoryLabel, getSubcategoriesFor } from "../../utils/categories";
import { useCategoryDescriptors } from "../../hooks/useCategoryDescriptors";
import type { IPartDraft, IPartDraftErrors } from "../../utils/draft";
import { PartImage } from "../PartImage";
import { PartChip } from "./PartChip";
import { PartPanel } from "./PartPanel";
import { PartSefazBadge } from "./PartSefazBadge";
import { PartSpecRow } from "./PartSpecRow";

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

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(CATALOG_STRINGS.detail.counterCards.copied(value));
    } catch {
      toast.error(CATALOG_STRINGS.detail.counterCards.copyError);
    }
  };

  return (
    <PartPanel flush>
      <div className="px-5 pb-1 pt-5">
        <div className="flex gap-4">
          <PartImage
            part={part}
            size={compact ? "md" : "detail"}
            className="shrink-0 border border-border"
          />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">
              {COPY.code(part.sku)}
            </p>
            <h1 className="mb-[9px] mt-[3px] font-display text-[22px] font-bold uppercase leading-[1.05] tracking-[0.01em] text-foreground">
              {part.name}
            </h1>
            <div className="flex flex-wrap gap-[7px]">
              <PartChip variant="ghost" size="sm">
                {COPY.oem(part.oemCodes[0] ?? COPY.empty)}
              </PartChip>
              {part.category && (
                <PartChip variant="ghost" size="sm">
                  {getCategoryLabel(part.category)}
                </PartChip>
              )}
              {part.segment && (
                <PartChip variant="ghost" size="sm">
                  {part.segment}
                </PartChip>
              )}
              {part.isOriginal ? (
                <PartChip tone="warning" size="sm" icon="mdi:check-decagram">
                  {CATALOG_STRINGS.badges.original}
                </PartChip>
              ) : (
                <PartChip variant="ghost" size="sm" icon="mdi:swap-horizontal">
                  {CATALOG_STRINGS.badges.equivalent}
                </PartChip>
              )}
              <PartChip
                tone={part.active ? "success" : "critical"}
                size="sm"
                icon={part.active ? "mdi:check-circle-outline" : "mdi:close-circle-outline"}
              >
                {part.active ? CATALOG_STRINGS.status.active : CATALOG_STRINGS.status.inactive}
              </PartChip>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-4 pt-1.5">
        <PartSpecRow
          label={COPY.gtinLabel}
          value={part.gtin ?? COPY.noGtin}
          mono={Boolean(part.gtin)}
          action={
            part.gtin ? (
              <PartSefazBadge status={part.sefazStatus} checkedAt={part.sefazCheckedAt} />
            ) : undefined
          }
          onCopy={part.gtin ? () => void handleCopy(part.gtin as string) : undefined}
        />
        {part.supplierCode && (
          <PartSpecRow label={COPY.supplierCode} value={part.supplierCode} mono />
        )}
        {part.group && <PartSpecRow label={COPY.group} value={part.group} />}
        <PartSpecRow label={COPY.brand} value={part.brand} />
        {part.reference && <PartSpecRow label={COPY.reference} value={part.reference} mono />}
        {part.partType && <PartSpecRow label={COPY.type} value={part.partType} />}
        <PartSpecRow label={COPY.unit} value={part.unitOfMeasure ?? COPY.empty} />
        <PartSpecRow
          label={COPY.location}
          value={part.storageLocation ?? COPY.empty}
          action={
            part.storageLocation ? (
              <PartChip tone="info" size="sm" icon="mdi:map-marker-outline">
                {COPY.locationDefined}
              </PartChip>
            ) : (
              <PartChip variant="ghost" size="sm">
                {COPY.locationUndefined}
              </PartChip>
            )
          }
        />
      </div>

      {!compact && part.description && (
        <p className="border-t border-border px-5 py-3.5 text-sm text-muted-foreground">
          {part.description}
        </p>
      )}
    </PartPanel>
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

function PartIdentityEditor({
  draft,
  onChange,
  errors,
  sefazStatus,
  sefazCheckedAt,
}: IPartIdentityEditorProps) {
  const { descriptors, active: categoryOptions } = useCategoryDescriptors();
  const subOptions = getSubcategoriesFor(draft.category, descriptors);

  return (
    <div className="rounded-xl border border-border bg-card p-[18px]">
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
            onValueChange={(v) =>
              onChange({ category: v === "" ? undefined : (v as IPartDraft["category"]) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((d) => (
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
          <Input
            value={draft.reference}
            onChange={(e) => onChange({ reference: e.target.value })}
            className="font-mono"
          />
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
