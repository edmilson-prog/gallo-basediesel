// src/features/model-kits/components/ApplyKitDialog.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { ID, IPart, IVehicleModelKit } from "@/shared/types";
import { buildKitPreview } from "../utils/kitPreview";
import type { IKitPreviewLine } from "../utils/kitPreview";
import { formatBRL } from "@/shared/utils/format";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IApplyKitSelection {
  part: IPart;
  quantity: number;
}

export interface IApplyKitDialogProps {
  kit: IVehicleModelKit | null; // null = closed
  partsById: Map<ID, IPart>;
  onOpenChange(open: boolean): void;
  onConfirm(selection: IApplyKitSelection[]): void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface ILineState {
  checked: boolean;
  quantity: number;
}

function buildInitialState(lines: IKitPreviewLine[]): ILineState[] {
  return lines.map((l) => ({
    checked: !l.isOptional,
    quantity: l.defaultQuantity,
  }));
}

function hasPrice(part: IPart): boolean {
  return typeof part.unitPrice === "number" && part.unitPrice > 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApplyKitDialog({
  kit,
  partsById,
  onOpenChange,
  onConfirm,
}: IApplyKitDialogProps): React.ReactElement | null {
  // Build preview whenever the kit changes
  const preview = useMemo(
    () => (kit ? buildKitPreview(kit, partsById) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kit?.id, partsById],
  );

  // Per-line interactive state, reset whenever the kit changes
  const [lineStates, setLineStates] = useState<ILineState[]>(() =>
    preview ? buildInitialState(preview.lines) : [],
  );

  useEffect(() => {
    setLineStates(preview ? buildInitialState(preview.lines) : []);
  }, [preview]);

  if (!kit || !preview) return null;

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const lines = preview.lines;
  const firstOptionalIdx = lines.findIndex((l) => l.isOptional);
  const hasOptionals = firstOptionalIdx !== -1;

  const nTotal = lines.length;
  const nMarked = lineStates.filter((s) => s.checked).length;
  const nNoPriceMarked = lines.filter((l, i) => lineStates[i]?.checked && !hasPrice(l.part)).length;

  const estimatedTotal = lines.reduce((sum, l, i) => {
    const s = lineStates[i];
    if (!s?.checked || !hasPrice(l.part)) return sum;
    return sum + l.part.unitPrice * s.quantity;
  }, 0);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function setChecked(idx: number, checked: boolean) {
    setLineStates((prev) => prev.map((s, i) => (i === idx ? { ...s, checked } : s)));
  }

  function setQuantity(idx: number, delta: number) {
    setLineStates((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, quantity: Math.max(1, s.quantity + delta) } : s)),
    );
  }

  function handleConfirm() {
    const selection: IApplyKitSelection[] = lines
      .filter((_, i) => lineStates[i]?.checked)
      .map((l, _i) => {
        const globalIdx = lines.indexOf(l);
        return { part: l.part, quantity: lineStates[globalIdx]?.quantity ?? l.defaultQuantity };
      });
    onConfirm(selection);
    onOpenChange(false);
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function renderLine(line: IKitPreviewLine, idx: number) {
    const state = lineStates[idx];
    if (!state) return null;
    const { checked, quantity } = state;
    const priced = hasPrice(line.part);
    const unitPrice = line.part.unitPrice;
    const subtotal = priced && checked ? unitPrice * quantity : null;

    return (
      <div
        key={line.part.id}
        className={
          "flex items-center gap-3 py-2 px-1 rounded transition-opacity" +
          (checked ? "" : " opacity-60")
        }
      >
        {/* Checkbox */}
        <Checkbox
          id={`kit-line-${idx}`}
          checked={checked}
          onCheckedChange={(val) => setChecked(idx, val === true)}
          aria-label={line.part.name}
        />

        {/* Base / optional marker */}
        <Icon
          icon={line.isOptional ? "mdi:circle-outline" : "mdi:circle"}
          className="shrink-0 text-muted-foreground"
          size={14}
        />

        {/* Part name + note */}
        <label htmlFor={`kit-line-${idx}`} className="flex-1 min-w-0 cursor-pointer">
          <span className="block text-sm font-medium text-foreground truncate">
            {line.part.name}
          </span>
          {line.note && (
            <span className="block text-xs text-muted-foreground truncate">{line.note}</span>
          )}
        </label>

        {/* Unit price */}
        <div className="w-24 text-right text-xs text-muted-foreground shrink-0">
          {priced ? formatBRL(unitPrice) : <Badge variant="outline">Sem preço</Badge>}
        </div>

        {/* Quantity stepper */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setQuantity(idx, -1)}
            disabled={!checked}
            aria-disabled={!checked}
            aria-label={`Diminuir quantidade de ${line.part.name}`}
            className="w-6 h-6 flex items-center justify-center rounded border border-border text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            −
          </button>
          <span className="w-6 text-center text-sm tabular-nums">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity(idx, +1)}
            disabled={!checked}
            aria-disabled={!checked}
            aria-label={`Aumentar quantidade de ${line.part.name}`}
            className="w-6 h-6 flex items-center justify-center rounded border border-border text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            +
          </button>
        </div>

        {/* Subtotal */}
        <div className="w-24 text-right text-sm font-medium tabular-nums shrink-0">
          {subtotal !== null ? (
            formatBRL(subtotal)
          ) : (
            <span className="text-muted-foreground">R$ —</span>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // JSX
  // -------------------------------------------------------------------------

  return (
    <TooltipProvider>
      <Dialog open={kit !== null} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Aplicar {kit.name}</DialogTitle>
            <DialogDescription>
              Opcionais vêm desmarcados — são sugestões, você escolhe.
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="max-h-[70vh] overflow-y-auto -mx-1 px-1">
            <fieldset className="border-0 p-0 m-0">
              <legend className="sr-only">Itens do kit</legend>

              {/* Column header */}
              <div className="flex items-center gap-3 py-1 px-1 text-xs text-muted-foreground font-medium select-none">
                <span className="w-4 shrink-0" />
                <span className="w-3.5 shrink-0" />
                <span className="flex-1">Peça</span>
                <span className="w-24 text-right">Preço unit.</span>
                <span className="w-[88px] text-center">Qtd</span>
                <span className="w-24 text-right">Subtotal</span>
              </div>

              {/* Base lines */}
              {lines.map((line, idx) => {
                // Insert optional divider before first optional item
                if (hasOptionals && idx === firstOptionalIdx) {
                  return (
                    <div key={`__optional-divider__${line.part.id}`}>
                      <div className="flex items-center gap-2 my-2">
                        <div className="flex-1 border-t border-border" />
                        <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">
                          opcionais (sugestões)
                        </span>
                        <div className="flex-1 border-t border-border" />
                      </div>
                      {renderLine(line, idx)}
                    </div>
                  );
                }
                return renderLine(line, idx);
              })}
            </fieldset>

            {/* Missing parts notice */}
            {preview.missing > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {preview.missing}{" "}
                {preview.missing === 1 ? "peça não encontrada" : "peças não encontradas"} no
                catálogo e {preview.missing === 1 ? "foi omitida" : "foram omitidas"}.
              </p>
            )}

            {/* No-price notice */}
            {nNoPriceMarked > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {nNoPriceMarked}{" "}
                {nNoPriceMarked === 1 ? "item marcado sem preço" : "itens marcados sem preço"} — o
                subtotal não os inclui.
              </p>
            )}

            {/* Catalog date seal */}
            <p className="mt-2 text-xs text-muted-foreground">preços do catálogo de hoje</p>
          </div>

          {/* Footer */}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: count + total */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              <span className="text-sm text-muted-foreground">
                {nMarked} de {nTotal} itens
              </span>
              <span
                className="text-lg font-semibold text-foreground tabular-nums"
                aria-live="polite"
                aria-atomic="true"
              >
                {formatBRL(estimatedTotal)}
              </span>
              <span className="text-xs text-muted-foreground">estimado</span>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>

              {nMarked === 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button variant="default" disabled aria-disabled>
                        Adicionar 0 itens ao orçamento
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Selecione ao menos um item</TooltipContent>
                </Tooltip>
              ) : (
                <Button variant="default" onClick={handleConfirm}>
                  Adicionar {nMarked} {nMarked === 1 ? "item" : "itens"} ao orçamento
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
