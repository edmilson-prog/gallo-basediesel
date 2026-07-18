import type { INewSupplierEntryDraft } from "../../utils/draft";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.detail.suppliers;

const EMPTY_ENTRY: INewSupplierEntryDraft = {
  name: "",
  supplierCode: "",
  invoiceNumber: "",
  invoiceDate: "",
  cost: undefined,
  quantity: undefined,
};

export interface IPartSupplierEntryFormProps {
  value: INewSupplierEntryDraft | null;
  onChange: (next: INewSupplierEntryDraft | null) => void;
}

export function PartSupplierEntryForm({ value, onChange }: IPartSupplierEntryFormProps) {
  const entry = value ?? EMPTY_ENTRY;

  const set = <K extends keyof INewSupplierEntryDraft>(key: K, v: INewSupplierEntryDraft[K]) => {
    onChange({ ...entry, [key]: v });
  };

  return (
    <div className="mt-3 rounded-md border border-dashed border-border p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {COPY.addTitle}
      </p>
      <p className="mb-2 text-xs text-muted-foreground">{COPY.hint}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <Label className="text-[10px] uppercase">{COPY.name}</Label>
          <Input value={entry.name} onChange={(e) => set("name", e.target.value)} className="h-8" />
        </div>
        <div>
          <Label className="text-[10px] uppercase">{COPY.code}</Label>
          <Input
            value={entry.supplierCode}
            onChange={(e) => set("supplierCode", e.target.value)}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase">{COPY.invoice}</Label>
          <Input
            value={entry.invoiceNumber}
            onChange={(e) => set("invoiceNumber", e.target.value)}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase">{COPY.date}</Label>
          <Input
            type="date"
            value={entry.invoiceDate}
            onChange={(e) => set("invoiceDate", e.target.value)}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase">{COPY.cost}</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={entry.cost ?? ""}
            onChange={(e) =>
              set("cost", e.target.value === "" ? undefined : Number(e.target.value))
            }
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase">{COPY.qty}</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={entry.quantity ?? ""}
            onChange={(e) =>
              set("quantity", e.target.value === "" ? undefined : Number(e.target.value))
            }
            className="h-8"
          />
        </div>
      </div>
    </div>
  );
}
