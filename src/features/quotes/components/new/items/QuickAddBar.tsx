// src/features/quotes/components/new/items/QuickAddBar.tsx
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/Icon";
import { useItemSearch } from "../../../hooks/useItemSearch";
import { parseBulkPasteLines, resolveBulkPaste } from "../../../utils/bulkPaste";
import type { IAdderProps } from "./ContinuousAdder";

const PLACEHOLDER = "GP-0445120212; 2\n0445020150; 1\nGP-FS20020; 4";

/**
 * Bulk entry: paste one part per line as `SKU or OEM; quantity`. Built for the
 * counter workflow where the customer sends a written list.
 */
export function QuickAddBar({ onAddPart }: IAdderProps) {
  const [value, setValue] = useState("");
  const { allParts } = useItemSearch({ enabled: true, query: "" });

  const add = () => {
    const parsed = parseBulkPasteLines(value);
    if (parsed.length === 0) {
      toast.error("Cole ao menos uma linha no formato SKU; quantidade.");
      return;
    }
    const { matched, unmatched } = resolveBulkPaste(parsed, allParts);
    if (matched.length === 0) {
      toast.error("Nenhum código reconhecido.");
      return;
    }
    for (const { part, quantity } of matched) onAddPart(part, quantity);
    setValue("");
    const label = matched.length === 1 ? "item adicionado" : "itens adicionados";
    if (unmatched.length > 0) {
      toast.warning(`${matched.length} ${label}. Não encontrados: ${unmatched.join(", ")}.`);
    } else {
      toast.success(`${matched.length} ${label}.`);
    }
  };

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">
        Cole uma lista — um item por linha, no formato{" "}
        <b className="font-semibold text-foreground">SKU ou OEM; quantidade</b>.
      </p>
      <Textarea
        rows={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={PLACEHOLDER}
        aria-label="Lista de peças para adicionar"
        className="font-mono text-xs leading-relaxed"
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Icon icon="mdi:playlist-plus" size={16} />
          Adicionar lista
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setValue("")}>
          Limpar
        </Button>
      </div>
    </div>
  );
}
