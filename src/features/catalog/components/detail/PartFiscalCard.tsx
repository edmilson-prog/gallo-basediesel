import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
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
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { FISCAL_ORIGINS } from "../../utils/fiscalOrigins";
import type { IPartDraft } from "../../utils/draft";

const COPY = CATALOG_STRINGS.detail.fiscal;

export interface IPartFiscalCardProps {
  part: IPart;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
}

export function PartFiscalCard({
  part,
  editing = false,
  draft,
  onDraftChange,
}: IPartFiscalCardProps) {
  if (editing && draft && onDraftChange) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <CardHeader />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <EditField label={COPY.ncm}>
            <Input
              value={draft.fiscal.ncm}
              onChange={(e) => onDraftChange({ fiscal: { ...draft.fiscal, ncm: e.target.value } })}
              className="font-mono"
            />
          </EditField>
          <EditField label={COPY.icms}>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={draft.fiscal.icmsPercent ?? ""}
              onChange={(e) =>
                onDraftChange({
                  fiscal: {
                    ...draft.fiscal,
                    icmsPercent: e.target.value === "" ? undefined : Number(e.target.value),
                  },
                })
              }
            />
          </EditField>
          <EditField label={COPY.origin}>
            <Select
              value={draft.fiscal.origin}
              onValueChange={(v) => onDraftChange({ fiscal: { ...draft.fiscal, origin: v } })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {FISCAL_ORIGINS.map((o) => (
                  <SelectItem key={o.code} value={o.code}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </EditField>
          <EditField label={COPY.st}>
            <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3">
              <Switch
                checked={draft.fiscal.taxSubstitution}
                onCheckedChange={(v) =>
                  onDraftChange({ fiscal: { ...draft.fiscal, taxSubstitution: v } })
                }
                id="edit-tax-substitution"
              />
              <Label htmlFor="edit-tax-substitution" className="cursor-pointer text-xs">
                {draft.fiscal.taxSubstitution ? COPY.yes : COPY.no}
              </Label>
            </div>
          </EditField>
        </div>
      </div>
    );
  }

  const f = part.fiscal;
  const hasData = f && (f.ncm || f.icmsPercent != null || f.taxSubstitution != null || f.origin);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <CardHeader />
      {hasData ? (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Field label={COPY.ncm} value={f?.ncm} mono />
          <Field
            label={COPY.icms}
            value={f?.icmsPercent != null ? `${f.icmsPercent}%` : undefined}
          />
          <Field
            label={COPY.st}
            value={
              f?.taxSubstitution != null ? (f.taxSubstitution ? COPY.yes : COPY.no) : undefined
            }
          />
          <Field label={COPY.origin} value={f?.origin} />
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      )}
    </div>
  );
}

function CardHeader() {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon icon="mdi:file-percent-outline" size={18} className="text-muted-foreground" />
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{COPY.title}</h2>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-foreground" : "text-foreground"}>{value ?? "—"}</dd>
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
