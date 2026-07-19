import { useState } from "react";
import type { IPartCrossReference } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

export interface IPartCrossReferenceEditorProps {
  value: IPartCrossReference[];
  onChange: (next: IPartCrossReference[]) => void;
}

export function PartCrossReferenceEditor({ value, onChange }: IPartCrossReferenceEditorProps) {
  const [draftBrand, setDraftBrand] = useState("");
  const [draftCode, setDraftCode] = useState("");

  const addRow = () => {
    if (!draftBrand.trim() || !draftCode.trim()) return;
    onChange([...value, { brand: draftBrand.trim(), code: draftCode.trim() }]);
    setDraftBrand("");
    setDraftCode("");
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {CATALOG_STRINGS.form.fields.crossReferencesHint}
      </p>

      <div className="space-y-2">
        {value.map((ref, index) => (
          <div
            key={`${ref.brand}-${ref.code}-${index}`}
            className="flex items-center gap-2 rounded-md border border-border bg-card p-2"
          >
            <span className="flex-1 text-sm">
              <span className="font-medium">{ref.brand}</span>{" "}
              <span className="font-mono text-muted-foreground">{ref.code}</span>
            </span>
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remover referência"
            >
              <Icon icon="mdi:close" size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <Label className="text-[10px] uppercase">Marca</Label>
          <Input
            value={draftBrand}
            onChange={(e) => setDraftBrand(e.target.value)}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase">Código</Label>
          <Input
            value={draftCode}
            onChange={(e) => setDraftCode(e.target.value)}
            className="h-8 font-mono"
          />
        </div>
        <div className="flex items-end">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Icon icon="mdi:plus" size={14} />
            {CATALOG_STRINGS.form.addCrossReference}
          </Button>
        </div>
      </div>
    </div>
  );
}
