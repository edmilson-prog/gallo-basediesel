// src/features/quotes/components/new/items/ImportPanel.tsx
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { IPart } from "@/shared/types";
import { useItemSearch } from "../../../hooks/useItemSearch";
import {
  applyLlmSuggestions,
  buildImportSelection,
  interpretImportText,
  type IImportLine,
  type IImportSelection,
  type ImportConfidence,
} from "../../../engine/quoteImport";
import { interpretQuoteImport } from "../../../api/interpretQuoteImport";
import { InlineCell } from "./InlineCell";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const EXAMPLE = `Bom dia! Segue o pedido do Atego:
2 bicos injetores 0445120212
1 kit reparo F00RJ01727
4 filtros de combustível
12 litros de óleo 15W40`;

/** Text formats we can actually read here; PDF and photo need vision. */
const READABLE = ".txt,.csv,.xml";

const CONFIDENCE_BADGE: Record<ImportConfidence, { label: string; className: string }> = {
  exact: {
    label: "código exato",
    className: "border-severity-success/40 bg-severity-success/10 text-severity-success",
  },
  probable: {
    label: "provável",
    className: "border-severity-warning/40 bg-severity-warning/10 text-severity-warning",
  },
  ambiguous: { label: "opções", className: "border-info/40 bg-info/10 text-info" },
  unmatched: {
    label: "não encontrada",
    className: "border-severity-critical/40 bg-severity-critical/10 text-severity-critical",
  },
};

/** checkbox | interpretação | preço | qtd | subtotal */
const ROW = "grid-cols-[1rem_minmax(0,1fr)_6rem_6rem_6.5rem]";

export interface IImportPanelProps {
  /** Commits the confirmed lines into the quote, in one undoable step. */
  onImport: (selection: IImportSelection) => void;
}

/**
 * Reading a customer's list into the quote: paste it as it arrived, see what
 * was understood, then confirm. The review step is the point — the model may
 * be wrong, so nothing enters the quote until the seller says so, and every
 * line shows the customer's own wording next to what it was read as.
 */
export function ImportPanel({ onImport }: IImportPanelProps) {
  const { allParts } = useItemSearch({ enabled: true, query: "" });
  const [stage, setStage] = useState<"input" | "working" | "review">("input");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [lines, setLines] = useState<IImportLine[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const partsById = new Map(allParts.map((p) => [p.id, p] as const));
  const canRun = text.trim().length > 0;

  const run = async () => {
    if (!canRun) return;
    setStage("working");
    // Pass 1 is local and instant; pass 2 asks the model about what is left.
    const first = interpretImportText(text, allParts);
    const suggestions = await interpretQuoteImport(first, allParts);
    const resolved = applyLlmSuggestions(first, suggestions, allParts);
    setLines(resolved);
    setChecked(
      Object.fromEntries(resolved.map((line) => [line.key, Boolean(line.partId)] as const)),
    );
    setPrices({});
    setStage("review");
  };

  const reset = () => {
    setStage("input");
    setLines([]);
    setChecked({});
    setPrices({});
  };

  const patch = (key: string, next: Partial<IImportLine>) =>
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...next } : line)));

  const priceOf = (line: IImportLine): number => {
    if (line.partId) return partsById.get(line.partId)?.unitPrice ?? 0;
    const raw = prices[line.key] ?? "";
    const parsed = Number.parseFloat(raw.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const included = lines.filter((line) => checked[line.key] && (line.partId || priceOf(line) > 0));
  const total = included.reduce((sum, line) => sum + priceOf(line) * line.quantity, 0);

  const confirm = () => {
    const selection = buildImportSelection(lines, checked, prices, allParts);
    if (selection.catalog.length + selection.free.length === 0) return;
    onImport(selection);
    setText("");
    setFileName(null);
    reset();
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setFileName(file.name);
    };
    reader.readAsText(file);
  };

  if (stage === "working") {
    return (
      <div className="flex items-center justify-center gap-2 py-7 text-sm text-muted-foreground">
        <Icon icon="mdi:loading" size={17} className="animate-spin motion-reduce:animate-none" />
        Interpretando {fileName ?? "o texto colado"}…
      </div>
    );
  }

  if (stage === "review") {
    return (
      <section
        aria-label="Importação interpretada"
        className="overflow-hidden rounded-lg border border-border bg-background/40"
      >
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <Icon icon="lucide:sparkles" size={14} className="text-primary" />
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            O que foi identificado
          </h3>
          {fileName && (
            <span className="rounded border border-border px-1 text-[10px] uppercase text-muted-foreground">
              {fileName}
            </span>
          )}
          <span className="font-semicond text-[11.5px] text-muted-foreground">
            {lines.length} {lines.length === 1 ? "linha" : "linhas"}
          </span>
          <button
            type="button"
            onClick={reset}
            title="Descartar"
            aria-label="Descartar importação"
            className="ml-auto grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon icon="mdi:close" size={15} />
          </button>
        </header>

        <div className="max-h-80 overflow-y-auto px-3 pb-2.5 pt-1.5">
          <div
            className={`grid ${ROW} items-center gap-2 px-0.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`}
          >
            <span className="sr-only">Incluir</span>
            <span>Interpretação</span>
            <span className="text-right">Preço unit.</span>
            <span className="text-center">Qtd</span>
            <span className="text-right">Subtotal</span>
          </div>

          {lines.length === 0 ? (
            <p className="py-4 text-xs text-muted-foreground">Nenhum item reconhecido no texto.</p>
          ) : (
            lines.map((line) => {
              const part = line.partId ? partsById.get(line.partId) : undefined;
              const badge = CONFIDENCE_BADGE[line.confidence];
              const unit = priceOf(line);
              const on = Boolean(checked[line.key]) && (Boolean(line.partId) || unit > 0);
              return (
                <div
                  key={line.key}
                  className={`grid ${ROW} items-center gap-2 px-0.5 py-1.5 transition-opacity motion-reduce:transition-none ${
                    checked[line.key] ? "" : "opacity-60"
                  }`}
                >
                  <Checkbox
                    checked={Boolean(checked[line.key])}
                    disabled={!line.partId && unit <= 0}
                    onCheckedChange={(v) =>
                      setChecked((prev) => ({ ...prev, [line.key]: v === true }))
                    }
                    aria-label={line.raw}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-foreground">
                        {part
                          ? part.name
                          : line.confidence === "ambiguous"
                            ? "Qual peça?"
                            : "Sem correspondência no catálogo"}
                      </span>
                      <span
                        className={`shrink-0 rounded border px-1 text-[10px] uppercase ${badge.className}`}
                      >
                        {line.confidence === "ambiguous"
                          ? `${line.candidateIds.length} opções`
                          : badge.label}
                      </span>
                    </div>
                    <p className="truncate font-semicond text-[11px] text-muted-foreground">
                      «{line.raw}»
                      {part
                        ? ` · SKU ${part.sku}`
                        : line.confidence === "unmatched"
                          ? " · informe um preço para incluir como item avulso"
                          : ""}
                    </p>
                    {line.candidateIds.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {line.candidateIds.map((id) => {
                          const candidate = partsById.get(id);
                          if (!candidate) return null;
                          const active = line.partId === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                patch(line.key, { partId: id });
                                setChecked((prev) => ({ ...prev, [line.key]: true }));
                              }}
                              aria-pressed={active}
                              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                                active
                                  ? "border-info/50 bg-info/10 text-foreground"
                                  : "border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {candidate.brand} {candidate.sku} ·{" "}
                              {moneyFormatter.format(candidate.unitPrice)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {part ? (
                    <span className="text-right text-[11px] text-muted-foreground">
                      {moneyFormatter.format(part.unitPrice)}
                    </span>
                  ) : line.confidence === "unmatched" ? (
                    <InlineCell
                      value={prices[line.key] ?? ""}
                      onCommit={(raw) => setPrices((prev) => ({ ...prev, [line.key]: raw }))}
                      prefix="R$"
                      ariaLabel={`Preço de ${line.raw}`}
                    />
                  ) : (
                    <span className="text-right text-[11px] text-muted-foreground">R$ —</span>
                  )}

                  <span className="flex justify-center">
                    <span className="flex items-center overflow-hidden rounded-md border border-border">
                      <button
                        type="button"
                        disabled={!checked[line.key]}
                        onClick={() =>
                          patch(line.key, { quantity: Math.max(1, line.quantity - 1) })
                        }
                        aria-label={`Diminuir quantidade de ${line.raw}`}
                        className="grid h-6 w-5 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      >
                        <Icon icon="mdi:minus" size={12} />
                      </button>
                      <span className="min-w-5 text-center text-xs font-semibold tabular-nums text-foreground">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={!checked[line.key]}
                        onClick={() => patch(line.key, { quantity: line.quantity + 1 })}
                        aria-label={`Aumentar quantidade de ${line.raw}`}
                        className="grid h-6 w-5 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      >
                        <Icon icon="mdi:plus" size={12} />
                      </button>
                    </span>
                  </span>

                  <span
                    className={`text-right font-display text-[13px] font-extrabold tabular-nums ${
                      on ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {on ? moneyFormatter.format(unit * line.quantity) : "R$ —"}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-muted/20 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {included.length} de {lines.length} itens
          </span>
          <span
            className="font-display text-[19px] font-extrabold tabular-nums text-foreground"
            aria-live="polite"
          >
            {moneyFormatter.format(total)}
          </span>
          <span className="font-semicond text-[11px] text-muted-foreground">
            confira código e quantidade antes de adicionar
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Descartar
            </Button>
            <Button type="button" size="sm" disabled={included.length === 0} onClick={confirm}>
              <Icon icon="mdi:plus" size={15} />
              Adicionar {included.length} {included.length === 1 ? "item" : "itens"}
            </Button>
          </div>
        </footer>
      </section>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_14rem]">
        <Textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            "Cole a lista do cliente como veio — mensagem, e-mail ou planilha. Ex.:\n2 bicos injetores 0445120212\n4 filtros de combustível\n12 litros de óleo 15W40"
          }
          aria-label="Lista do cliente para importar"
          className="font-semicond text-[13px] leading-relaxed"
        />
        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={READABLE}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFile(file);
              e.target.value = "";
            }}
          />
          {fileName ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-2.5 py-2">
              <Icon icon="mdi:file-document-outline" size={15} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">{fileName}</span>
              <button
                type="button"
                onClick={() => setFileName(null)}
                title="Remover arquivo"
                aria-label="Remover arquivo"
                className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:text-foreground"
              >
                <Icon icon="mdi:close" size={13} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border px-2.5 py-3.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground motion-reduce:transition-none"
            >
              <Icon icon="mdi:file-upload-outline" size={17} />
              <span className="text-xs font-medium">Enviar arquivo</span>
              <span className="font-semicond text-[11px] text-muted-foreground">
                texto, CSV ou XML
              </span>
            </button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setText(EXAMPLE)}>
            usar lista de exemplo
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 font-semicond text-[11.5px] text-muted-foreground">
          Códigos são reconhecidos aqui mesmo; o resto vai para a IA identificar. Nada entra no
          orçamento sem a sua confirmação.
        </p>
        <Button type="button" size="sm" disabled={!canRun} onClick={() => void run()}>
          <Icon icon="lucide:sparkles" size={15} />
          Interpretar
        </Button>
      </div>
    </div>
  );
}
